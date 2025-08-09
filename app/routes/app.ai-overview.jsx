import { useState, useEffect } from "react";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Box,
  Badge,
  Divider,
  Toast,
  EmptyState,
  Icon,
  Collapsible,
} from "@shopify/polaris";
import {
  DataPresentationIcon,
  ChartVerticalIcon,
  ChatIcon,
  RefreshIcon,
  GlobeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
  InfoIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get the access key from metafields
  const metafieldResponse = await admin.graphql(`
    query {
      shop {
        metafield(namespace: "voicero", key: "access_key") {
          value
        }
      }
    }
  `);

  const metafieldData = await metafieldResponse.json();
  const accessKey = metafieldData.data.shop.metafield?.value;

  if (!accessKey) {
    return json({
      disconnected: true,
      error: "No access key found",
    });
  }

  try {
    // Fetch website data from the connect API
    const response = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!response.ok) {
      return json({
        error: "Failed to fetch website data",
      });
    }

    const data = await response.json();
    console.log("API Response:", data); // Console log the API output

    if (!data.website) {
      return json({
        error: "No website data found",
      });
    }

    // Extract analysis from response if available - check all possible locations
    console.log("Checking for analysis in data response:", Object.keys(data));

    // Improved analysis extraction - check multiple possible locations
    let analysis = null;

    if (data.analysis) {
      // Direct analysis property
      analysis = data.analysis;
      console.log("Found analysis in direct 'analysis' property");
    } else if (data.website.analysis) {
      // Analysis nested in website object
      analysis = data.website.analysis;
      console.log("Found analysis in 'website.analysis' property");
    } else if (data.aiAnalysis) {
      // Alternative property name
      analysis = data.aiAnalysis;
      console.log("Found analysis in 'aiAnalysis' property");
    } else if (data.insights) {
      // Another alternative property name
      analysis = data.insights;
      console.log("Found analysis in 'insights' property");
    }

    // If analysis is still null, try looking for it in another location or use a default
    if (!analysis) {
      console.log(
        "Analysis not found in expected locations. Looking elsewhere...",
      );
      // The raw data might be directly in the response
      if (typeof data === "object" && Object.keys(data).length > 0) {
        // Look for any property that might contain the analysis (large string with markdown formatting)
        for (const key of Object.keys(data)) {
          if (
            typeof data[key] === "string" &&
            data[key].includes("###") &&
            data[key].length > 500
          ) {
            console.log(`Found potential analysis in property: ${key}`);
            analysis = data[key];
            break;
          }
        }
      }
    }

    console.log(
      "Final analysis value to use:",
      analysis ? "Found" : "Not found",
      typeof analysis === "string" ? `(${analysis.substring(0, 50)}...)` : "",
    );

    // Return the connect API data immediately without waiting for AI history
    return json({
      websiteData: data.website,
      analysis,
      accessKey,
      // Return null for AI history data, will be fetched client-side
      aiHistoryData: null,
      aiHistoryError: false,
      aiHistoryLoading: true,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return json({
      error: error.message || "Failed to fetch website data",
    });
  }
};

// Simple CSS-only progress bar that doesn't depend on Polaris theme
function CustomProgressBar({ progress, tone = "success" }) {
  const color = tone === "critical" ? "#d82c0d" : "#008060";

  return (
    <div
      style={{
        height: "8px",
        backgroundColor: "#e0e0e0",
        borderRadius: "4px",
        margin: "12px 0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          height: "100%",
          backgroundColor: color,
          width: `${progress}%`,
        }}
      ></div>
    </div>
  );
}

export default function AIOverviewPage() {
  const { websiteData, analysis, error, disconnected, accessKey } =
    useLoaderData();

  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");

  // Separate loading states for different components
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [aiHistoryLoading, setAiHistoryLoading] = useState(true);
  const [aiHistoryData, setAiHistoryData] = useState(null);
  const [aiHistoryError, setAiHistoryError] = useState(false);
  const [updatedAnalysis, setUpdatedAnalysis] = useState(analysis);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [showMoreWorking, setShowMoreWorking] = useState(false);
  const [showMoreQuickWins, setShowMoreQuickWins] = useState(false);
  const [showGoodOpen, setShowGoodOpen] = useState(false);
  const [showNeedsWorkOpen, setShowNeedsWorkOpen] = useState(false);
  const [visibleThreads, setVisibleThreads] = useState(5);

  // Track which thread is expanded
  const [expandedThreadId, setExpandedThreadId] = useState(null);

  // Toggle thread expansion
  const toggleThreadExpansion = (threadId) => {
    setExpandedThreadId(expandedThreadId === threadId ? null : threadId);
  };

  // Fetch AI history data on client side
  useEffect(() => {
    async function fetchAiHistory() {
      if (!websiteData || !accessKey) return;

      try {
        // Get the current URL to build an absolute URL
        const baseUrl = window.location.origin;

        // Make the API call to get AI history
        const historyResponse = await fetch(`/api/aiHistory`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            websiteId: websiteData.id,
            accessKey: accessKey,
          }),
        });

        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          console.log("AI History Response:", historyData);

          // Check the shape of the historyData response
          console.log("History data has keys:", Object.keys(historyData));

          // Improved extraction of analysis from AI history response
          let analysisFromHistory = null;

          if (historyData.analysis) {
            analysisFromHistory = historyData.analysis;
            console.log("Found analysis in history 'analysis' property");
          } else if (historyData.insights) {
            analysisFromHistory = historyData.insights;
            console.log("Found analysis in history 'insights' property");
          } else if (historyData.summary) {
            analysisFromHistory = historyData.summary;
            console.log("Found analysis in history 'summary' property");
          }

          // Check if we have data in the expected format
          const formattedHistoryData = Array.isArray(historyData)
            ? historyData
            : historyData.threads || historyData.queries || [];

          setAiHistoryData(formattedHistoryData);

          // If we found analysis in the history response and we don't already have analysis, use that
          if (analysisFromHistory && !updatedAnalysis) {
            // Make sure it's a string before assigning
            if (typeof analysisFromHistory === "string") {
              setUpdatedAnalysis(analysisFromHistory);
              console.log(
                "Found analysis in aiHistory response: " +
                  analysisFromHistory.substring(0, 100) +
                  "...",
              );
            } else if (typeof analysisFromHistory === "object") {
              // If it's an object, stringify it
              const analysisText = JSON.stringify(analysisFromHistory, null, 2);
              setUpdatedAnalysis(analysisText);
              console.log("Analysis was an object, stringified it");
            }
          }
        } else {
          console.error(
            "Failed to fetch AI history data:",
            await historyResponse.text(),
          );
          setAiHistoryError(true);
        }
      } catch (historyError) {
        console.error("Error fetching AI history:", historyError);
        setAiHistoryError(true);
      } finally {
        setAiHistoryLoading(false);
      }
    }

    fetchAiHistory();
  }, [websiteData, accessKey, updatedAnalysis]);

  // Helper function to format markdown text with bold, italics, etc.
  const formatMarkdownText = (text) => {
    if (!text) return "";

    // Create parts array to hold strings and JSX elements
    const parts = [];

    // Handle bold text (**text**)
    let lastIndex = 0;
    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      // Add the bold text as JSX
      parts.push(
        <span key={match.index} style={{ fontWeight: "bold" }}>
          {match[1]}
        </span>,
      );

      // Update the lastIndex
      lastIndex = match.index + match[0].length;
    }

    // Add any remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    // If there are no bold parts, just return the original text
    if (parts.length === 0) {
      return text;
    }

    return <>{parts}</>;
  };

  // Compact helpers for a friendlier, skimmable UI
  const truncateText = (text, maxChars = 600) => {
    if (!text) return "";
    const trimmed = text.trim();
    return trimmed.length > maxChars
      ? trimmed.substring(0, maxChars).trim() + "..."
      : trimmed;
  };

  const getAnalysisHighlights = (text) => {
    if (typeof text !== "string") return [];
    const lines = text.split("\n");
    const bullets = lines
      .filter((l) => l.trim().match(/^(-|\d+\.)\s+/))
      .map((l) => l.replace(/^(-|\d+\.)\s+/, "").trim())
      .filter(Boolean);
    if (bullets.length > 0) return bullets.slice(0, 4);

    const sentences = text
      .replace(/\n+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean);
    return sentences.slice(0, 3);
  };

  // Redirect if disconnected
  useEffect(() => {
    if (disconnected) {
      navigate("/app");
    }
  }, [disconnected, navigate]);

  // Debug data to console
  useEffect(() => {
    if (websiteData) {
      console.log("WebsiteData in component:", websiteData);
    }
    if (aiHistoryData) {
      console.log("AI History in component:", aiHistoryData);
    }
    console.log("Analysis in component RAW:", updatedAnalysis);
    // Check if analysis has markdown formatting
    if (typeof updatedAnalysis === "string") {
      if (updatedAnalysis.includes("###")) {
        console.log("Analysis appears to be markdown formatted with headings");
      }
      // Log the first 100 chars to see what we're working with
      console.log(
        "Analysis preview: " + updatedAnalysis.substring(0, 100) + "...",
      );
    } else {
      console.log("Analysis is not a string:", typeof updatedAnalysis);
    }
  }, [websiteData, aiHistoryData, updatedAnalysis]);

  const toggleToast = () => setShowToast(!showToast);

  // Hard-coded insights content for the report sections
  const reviewTitle =
    "Voicero AI – Post-Launch Chat Review (17 Jun – 3 Jul 2025)";
  const goodThreads = [
    "62ef08ab",
    "e24c37d5",
    "a89170e3",
    "e5de4431",
    "f02fe70b",
    "093c065f",
    "c2142524",
    "5056a3ee",
    "3ecbba0d",
    "8e3b8588",
    "1f1633ee",
    "d5174671",
    "6b26f4e0",
    "3a7f1315",
    "72f3acd3",
  ];
  const needsWorkThreads = [
    "4389ad4b",
    "75a5a22d",
    "d897aa3c",
    "b1284cb8",
    "f7475a90",
    "e4f6eca4",
  ];
  const goodOutcome =
    "Clear answers, accurate product guidance, smooth order / account actions, or quick hand-offs to CS; users left satisfied and often thanked the bot.";
  const needsWorkOutcome =
    "Repetition, promo/price contradictions, inability to override simple fixes, or wrong shipping info led to stalled resolutions and visible user frustration.";

  const whatsWorking = [
    "Product expertise in context – Differences between SKUs (e.g., Women’s UT vs. standard) explained clearly and converted interest into future intent.",
    "Action-oriented flows – Successful order cancellations, reward redemptions, and cart edits without human escalation.",
    "Empathy & reassurance – Quick apologies for delays/confusion followed by specific next steps kept conversations friendly.",
    "Cross-sell done right – When relevant (gut-health tips, pairing enzymes with probiotics) the bot recommended logical add-ons without sounding pushy.",
  ];

  const painPoints = [
    {
      issue:
        "Promotion clashes (free gifts, $0.02 shipping gaps, discount-stack limits)",
      impact:
        "Loops of “add $X more” or “can you override?” with no resolution; five threads ended unresolved.",
    },
    {
      issue: "Over-prompting (email-subscribe pop-ups, price blurbs)",
      impact:
        "In six threads, repetitive template replies buried the actual answer.",
    },
    {
      issue: "Inconsistent policies (intl. shipping)",
      impact:
        "One thread incorrectly said Canada orders were possible, then reversed—loss of trust.",
    },
    {
      issue: "Tracking / delivery status",
      impact:
        "Users asking “Where is my order?” got generic CS redirects plus unrelated upsell messages.",
    },
  ];

  // Quick wins (AI-focused, distinct from provided examples)
  const quickWins = [
    "Confidence gating – When answer certainty is low, ask one clarifying question or offer a human handoff instead of guessing.",
    "Template deduplication – Detect and suppress repeat promos/signup prompts within a session to keep answers concise.",
    "Promo-eligibility explainer – Compute and state why an offer does/doesn’t apply with a one-tap fix (add/remove items, apply code).",
    "Shipping guardrail – Validate destination and stock regions before promising availability.",
    "Live order ETA – After an order number is provided, fetch ETA and pause upsell until a tracking answer is delivered.",
  ];

  const kpis = [
    { label: "Total threads", value: "21" },
    { label: "Helpful (per manual audit)", value: "15 (71%)" },
    { label: "Needs-work", value: "6 (29%)" },
    { label: "Avg. user messages when good", value: "4" },
    { label: "Avg. user messages when bad", value: "10" },
  ];

  if (disconnected) {
    return null; // Don't render anything while redirecting
  }

  if (error) {
    return (
      <Page>
        <EmptyState
          heading="Unable to load AI usage data"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          action={{ content: "Back to Dashboard", url: "/app" }}
        >
          <p>{error}</p>
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page
      title="AI Usage Overview"
      backAction={{
        content: "Back",
        onAction: () => navigate("/app"),
      }}
      primaryAction={{
        content: "Refresh Data",
        icon: RefreshIcon,
        onAction: () => window.location.reload(),
      }}
    >
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            {/* AI Analysis Card */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={DataPresentationIcon} color="highlight" />
                    <Text as="h3" variant="headingMd">
                      AI Usage Analysis
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Divider />
                <BlockStack gap="300">
                  {analysisLoading || (aiHistoryLoading && !updatedAnalysis) ? (
                    // Loading state for analysis
                    <Box padding="400">
                      <BlockStack gap="200">
                        <Text alignment="center">Loading analysis...</Text>
                        <div
                          style={{
                            width: "100%",
                            height: "4px",
                            backgroundColor: "#f5f5f5",
                            borderRadius: "2px",
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              width: "30%",
                              height: "100%",
                              backgroundColor: "#008060",
                              borderRadius: "2px",
                              animation: "loading 1.5s infinite ease-in-out",
                              left: "-30%",
                            }}
                          ></div>
                        </div>
                      </BlockStack>
                    </Box>
                  ) : (
                    // Analysis data display - always show something
                    <Box padding="400">
                      <BlockStack gap="300">
                        {typeof updatedAnalysis === "string" &&
                        updatedAnalysis ? (
                          // Format the string analysis with line breaks and headings
                          <div>
                            {updatedAnalysis.split("\n").map((line, index) => {
                              // Format headings (lines starting with #)
                              if (line.startsWith("###")) {
                                return (
                                  <Text
                                    key={index}
                                    variant="headingSm"
                                    fontWeight="bold"
                                    as="h4"
                                    padding="300"
                                  >
                                    {line.replace(/^###\s/, "")}
                                  </Text>
                                );
                              } else if (line.startsWith("##")) {
                                return (
                                  <Text
                                    key={index}
                                    variant="headingMd"
                                    fontWeight="bold"
                                    as="h3"
                                    padding="300"
                                  >
                                    {line.replace(/^##\s/, "")}
                                  </Text>
                                );
                              }
                              // Handle table rows
                              else if (line.includes("|")) {
                                // Table header or divider row
                                if (
                                  line.includes("---") ||
                                  line.includes("===")
                                ) {
                                  return null; // Skip table divider rows
                                }
                                // Process table row
                                const cells = line
                                  .split("|")
                                  .filter((cell) => cell.trim());
                                if (cells.length > 0) {
                                  return (
                                    <div
                                      key={index}
                                      style={{
                                        display: "flex",
                                        width: "100%",
                                        marginBottom: "8px",
                                      }}
                                    >
                                      {cells.map((cell, cellIndex) => (
                                        <div
                                          key={cellIndex}
                                          style={{
                                            flex: 1,
                                            padding: "8px 12px",
                                            backgroundColor:
                                              index === 0
                                                ? "#f5f5f5"
                                                : "transparent",
                                            fontWeight:
                                              index === 0 ? "bold" : "normal",
                                            borderBottom: "1px solid #e1e3e5",
                                          }}
                                        >
                                          <Text variant="bodyMd">
                                            {formatMarkdownText(cell.trim())}
                                          </Text>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }
                                return null;
                              }
                              // Format list items
                              else if (line.match(/^-\s/)) {
                                return (
                                  <Text
                                    key={index}
                                    variant="bodyMd"
                                    as="p"
                                    padding="100"
                                    paddingInlineStart="400"
                                  >
                                    •{" "}
                                    {formatMarkdownText(
                                      line.replace(/^-\s/, ""),
                                    )}
                                  </Text>
                                );
                              }
                              // Format numbered list items
                              else if (line.match(/^\d+\.\s/)) {
                                return (
                                  <Text
                                    key={index}
                                    variant="bodyMd"
                                    as="p"
                                    padding="100"
                                    paddingInlineStart="400"
                                  >
                                    {formatMarkdownText(line)}
                                  </Text>
                                );
                              }
                              // Skip empty lines or separators
                              else if (
                                line.trim() === "" ||
                                line.trim() === "---"
                              ) {
                                return (
                                  <div key={index} style={{ height: "16px" }} />
                                );
                              }
                              // Regular text
                              else {
                                return (
                                  <Text
                                    key={index}
                                    variant="bodyMd"
                                    as="p"
                                    padding="100"
                                  >
                                    {formatMarkdownText(line)}
                                  </Text>
                                );
                              }
                            })}
                          </div>
                        ) : updatedAnalysis &&
                          typeof updatedAnalysis === "object" ? (
                          // Handle if analysis is an object with multiple properties
                          Object.entries(updatedAnalysis).map(
                            ([key, value]) => (
                              <BlockStack key={key} gap="100">
                                <Text variant="bodyMd" fontWeight="bold">
                                  {key.charAt(0).toUpperCase() +
                                    key.slice(1).replace(/([A-Z])/g, " $1")}
                                  :
                                </Text>
                                <Text variant="bodyMd">{value}</Text>
                              </BlockStack>
                            ),
                          )
                        ) : (
                          // Fallback if no analysis data
                          <Text alignment="center">
                            No analysis data available for your current usage.
                          </Text>
                        )}
                      </BlockStack>
                    </Box>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* 1-Month Chat Quality Snapshot - Redesigned with bubble tiles */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={DataPresentationIcon} color="highlight" />
                    <Text as="h3" variant="headingMd">
                      {reviewTitle}
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Divider />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 12,
                  }}
                >
                  {/* Good tile */}
                  <div
                    style={{
                      backgroundColor: "#E8F5E9",
                      borderRadius: 12,
                      padding: 16,
                      border: "1px solid #BBE5B3",
                    }}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            backgroundColor: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                          }}
                        >
                          <Icon source={CheckIcon} color="success" />
                        </div>
                        <Text variant="headingSm" fontWeight="semibold">
                          Good
                        </Text>
                      </InlineStack>
                      <div
                        style={{
                          backgroundColor: "white",
                          padding: "2px 10px",
                          borderRadius: 999,
                          border: "1px solid #BBE5B3",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        15 / 21
                      </div>
                    </InlineStack>
                    <div style={{ height: 8 }} />
                    <Text variant="bodySm" color="subdued">
                      {goodOutcome}
                    </Text>
                    <div style={{ height: 12 }} />
                    <Button
                      size="slim"
                      onClick={() => setShowGoodOpen((v) => !v)}
                    >
                      {showGoodOpen ? "Hide IDs" : "Show IDs"}
                    </Button>
                    <Collapsible open={showGoodOpen} id="good-threads">
                      <div style={{ height: 8 }} />
                      <InlineStack gap="100" wrap>
                        {goodThreads.map((id) => (
                          <div
                            key={id}
                            style={{
                              backgroundColor: "#F4F5F7",
                              padding: "4px 8px",
                              borderRadius: 999,
                              border: "1px solid #E4E5E7",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {id}
                          </div>
                        ))}
                      </InlineStack>
                    </Collapsible>
                  </div>

                  {/* Needs-work tile */}
                  <div
                    style={{
                      backgroundColor: "#FEF3C7",
                      borderRadius: 12,
                      padding: 16,
                      border: "1px solid #FDE68A",
                    }}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            backgroundColor: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                          }}
                        >
                          <Icon source={InfoIcon} color="warning" />
                        </div>
                        <Text variant="headingSm" fontWeight="semibold">
                          Needs‑Work
                        </Text>
                      </InlineStack>
                      <div
                        style={{
                          backgroundColor: "white",
                          padding: "2px 10px",
                          borderRadius: 999,
                          border: "1px solid #FDE68A",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        6 / 21
                      </div>
                    </InlineStack>
                    <div style={{ height: 8 }} />
                    <Text variant="bodySm" color="subdued">
                      {needsWorkOutcome}
                    </Text>
                    <div style={{ height: 12 }} />
                    <Button
                      size="slim"
                      onClick={() => setShowNeedsWorkOpen((v) => !v)}
                    >
                      {showNeedsWorkOpen ? "Hide IDs" : "Show IDs"}
                    </Button>
                    <Collapsible
                      open={showNeedsWorkOpen}
                      id="needswork-threads"
                    >
                      <div style={{ height: 8 }} />
                      <InlineStack gap="100" wrap>
                        {needsWorkThreads.map((id) => (
                          <div
                            key={id}
                            style={{
                              backgroundColor: "#FFF",
                              padding: "4px 8px",
                              borderRadius: 999,
                              border: "1px solid #FDE68A",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {id}
                          </div>
                        ))}
                      </InlineStack>
                    </Collapsible>
                  </div>
                </div>
              </BlockStack>
            </Card>

            {/* What's Working */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={DataPresentationIcon} color="highlight" />
                    <Text as="h3" variant="headingMd">
                      What’s Working
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Divider />
                <BlockStack gap="200">
                  {(showMoreWorking
                    ? whatsWorking
                    : whatsWorking.slice(0, 3)
                  ).map((item, idx) => (
                    <Text key={idx} variant="bodyMd" as="p">
                      • {item}
                    </Text>
                  ))}
                  {whatsWorking.length > 3 && (
                    <InlineStack align="end">
                      <Button
                        size="slim"
                        onClick={() => setShowMoreWorking((v) => !v)}
                      >
                        {showMoreWorking
                          ? "Show less"
                          : `Show ${whatsWorking.length - 3} more`}
                      </Button>
                    </InlineStack>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Pain-Points */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={ChartVerticalIcon} color="highlight" />
                    <Text as="h3" variant="headingMd">
                      Pain-Points
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Divider />
                <BlockStack gap="200">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {painPoints.map((row, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: "#F9FAFB",
                          borderRadius: 10,
                          border: "1px solid #EEF2F7",
                          padding: 12,
                        }}
                      >
                        <Text variant="bodyMd" fontWeight="semibold">
                          {row.issue}
                        </Text>
                        <div style={{ height: 6 }} />
                        <Text variant="bodySm" color="subdued">
                          {row.impact}
                        </Text>
                      </div>
                    ))}
                  </div>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Quick Wins */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={DataPresentationIcon} color="highlight" />
                    <Text as="h3" variant="headingMd">
                      Quick Wins to lift “Bad” → “Good”
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Divider />
                <BlockStack gap="200">
                  {(showMoreQuickWins ? quickWins : quickWins.slice(0, 3)).map(
                    (item, idx) => (
                      <Text key={idx} variant="bodyMd" as="p">
                        • {item}
                      </Text>
                    ),
                  )}
                  {quickWins.length > 3 && (
                    <InlineStack align="end">
                      <Button
                        size="slim"
                        onClick={() => setShowMoreQuickWins((v) => !v)}
                      >
                        {showMoreQuickWins
                          ? "Show less"
                          : `Show ${quickWins.length - 3} more`}
                      </Button>
                    </InlineStack>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* KPI Snapshot - Redesigned with stat bubbles */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={ChartVerticalIcon} color="highlight" />
                    <Text as="h3" variant="headingMd">
                      KPI Snapshot
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Divider />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  {[
                    {
                      label: "Total threads",
                      value: "21",
                      icon: ChatIcon,
                      accent: "#EEF6FF",
                    },
                    {
                      label: "Helpful (per manual audit)",
                      value: "15 (71%)",
                      icon: CheckIcon,
                      accent: "#E8F5E9",
                    },
                    {
                      label: "Needs-work",
                      value: "6 (29%)",
                      icon: InfoIcon,
                      accent: "#FEF3C7",
                    },
                    {
                      label: "Avg. user messages when good",
                      value: "4",
                      icon: ChatIcon,
                      accent: "#F3E8FF",
                    },
                    {
                      label: "Avg. user messages when bad",
                      value: "10",
                      icon: ChatIcon,
                      accent: "#FFE4E6",
                    },
                  ].map((stat, idx) => (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: stat.accent,
                        borderRadius: 12,
                        padding: 16,
                        transition:
                          "transform 0.15s ease, box-shadow 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow =
                          "0 8px 16px rgba(16,24,40,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <InlineStack gap="300" blockAlign="center">
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            backgroundColor: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                          }}
                        >
                          <Icon source={stat.icon} color="base" />
                        </div>
                        <BlockStack gap="100">
                          <Text variant="bodySm" color="subdued">
                            {stat.label}
                          </Text>
                          <Text variant="headingLg" as="h4">
                            {stat.value}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </div>
                  ))}
                </div>
              </BlockStack>
            </Card>

            {/* Recent AI Queries remains below */}

            {/* AI Query History */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={ChatIcon} color="highlight" />
                    <Text as="h3" variant="headingMd">
                      Recent AI Queries
                    </Text>
                  </InlineStack>
                </InlineStack>
                <Divider />
                <BlockStack gap="300">
                  {aiHistoryLoading ? (
                    // Loading state for AI history
                    <Box
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <BlockStack gap="200">
                        <InlineStack align="center">
                          <Text alignment="center">
                            Loading recent AI queries...
                          </Text>
                        </InlineStack>
                        <div
                          style={{
                            width: "100%",
                            height: "4px",
                            backgroundColor: "#f5f5f5",
                            borderRadius: "2px",
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              width: "30%",
                              height: "100%",
                              backgroundColor: "#008060",
                              borderRadius: "2px",
                              animation: "loading 1.5s infinite ease-in-out",
                              left: "-30%",
                            }}
                          ></div>
                        </div>
                        <style>{`
                          @keyframes loading {
                            0% { transform: translateX(0); }
                            100% { transform: translateX(433%); }
                          }
                        `}</style>
                      </BlockStack>
                    </Box>
                  ) : aiHistoryData && aiHistoryData.length > 0 ? (
                    // Data loaded successfully
                    <>
                      {aiHistoryData
                        .slice(0, visibleThreads)
                        .map((thread, index) => {
                          // Find first user message for the query text
                          const firstUserMessage =
                            thread.messages && thread.messages.length > 0
                              ? thread.messages.find(
                                  (msg) => msg.role === "user",
                                )
                              : null;

                          const queryText = firstUserMessage
                            ? firstUserMessage.content
                            : thread.initialQuery || "Untitled conversation";

                          // Sort messages with most recent first
                          const sortedMessages = thread.messages
                            ? [...thread.messages].sort(
                                (a, b) =>
                                  new Date(b.createdAt) - new Date(a.createdAt),
                              )
                            : [];

                          return (
                            <BlockStack key={index} gap="100">
                              <Box
                                background="bg-surface-secondary"
                                padding="300"
                                borderRadius={
                                  expandedThreadId === thread.id
                                    ? "200 200 0 0"
                                    : "200"
                                }
                              >
                                {/* Simplified single-line layout */}
                                <InlineStack align="space-between">
                                  <BlockStack gap="0">
                                    <Text
                                      variant="bodyMd"
                                      fontWeight="semibold"
                                    >
                                      {queryText}
                                    </Text>
                                    <Text variant="bodySm" color="subdued">
                                      {new Date(
                                        thread.lastMessageAt,
                                      ).toLocaleDateString()}{" "}
                                      {new Date(
                                        thread.lastMessageAt,
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </Text>
                                  </BlockStack>
                                  <InlineStack gap="200" align="center">
                                    <Badge>
                                      {thread.messageCount > 0
                                        ? `${thread.messageCount} messages`
                                        : "New"}
                                    </Badge>
                                    <Button
                                      size="slim"
                                      icon={
                                        expandedThreadId === thread.id
                                          ? ChevronUpIcon
                                          : ChevronDownIcon
                                      }
                                      onClick={() =>
                                        toggleThreadExpansion(thread.id)
                                      }
                                    >
                                      {expandedThreadId === thread.id
                                        ? "Hide"
                                        : "View More"}
                                    </Button>
                                  </InlineStack>
                                </InlineStack>
                              </Box>

                              <Collapsible
                                open={expandedThreadId === thread.id}
                                id={`thread-${thread.id}`}
                              >
                                <Box
                                  padding="300"
                                  background="bg-surface-subdued"
                                  borderRadius="0 0 200 200"
                                >
                                  <BlockStack gap="300">
                                    {sortedMessages &&
                                    sortedMessages.length > 0 ? (
                                      sortedMessages.map((message, msgIdx) => (
                                        <InlineStack
                                          key={msgIdx}
                                          align={
                                            message.role === "assistant"
                                              ? "start"
                                              : "end"
                                          }
                                          blockAlign="start"
                                          gap="300"
                                        >
                                          {message.role === "assistant" && (
                                            <div
                                              style={{
                                                width: "24px",
                                                height: "24px",
                                              }}
                                            >
                                              <Icon source={ChatIcon} />
                                            </div>
                                          )}
                                          <Box
                                            padding="300"
                                            background={
                                              message.role === "assistant"
                                                ? "bg-surface"
                                                : "bg-surface-active"
                                            }
                                            borderRadius="200"
                                            maxWidth="80%"
                                          >
                                            <Text variant="bodyMd">
                                              {(() => {
                                                // Check if the message content is JSON
                                                try {
                                                  const jsonContent =
                                                    JSON.parse(message.content);
                                                  // If it's structured JSON with answer and action fields
                                                  if (
                                                    jsonContent.answer &&
                                                    jsonContent.action
                                                  ) {
                                                    return (
                                                      <>
                                                        <div>
                                                          {jsonContent.answer}
                                                        </div>
                                                        <div
                                                          style={{
                                                            marginTop: "8px",
                                                            fontStyle: "italic",
                                                          }}
                                                        >
                                                          action:{" "}
                                                          {jsonContent.action}
                                                        </div>
                                                      </>
                                                    );
                                                  }
                                                  // If it's just regular JSON, stringify it nicely
                                                  return JSON.stringify(
                                                    jsonContent,
                                                    null,
                                                    2,
                                                  );
                                                } catch (e) {
                                                  // Not JSON, just return the content as is
                                                  return message.content;
                                                }
                                              })()}
                                            </Text>
                                            <Text
                                              variant="bodySm"
                                              color="subdued"
                                            >
                                              {new Date(
                                                message.createdAt,
                                              ).toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                              })}
                                            </Text>
                                          </Box>
                                          {message.role === "user" && (
                                            <div
                                              style={{
                                                width: "24px",
                                                height: "24px",
                                              }}
                                            >
                                              <Icon source={ChatIcon} />
                                            </div>
                                          )}
                                        </InlineStack>
                                      ))
                                    ) : (
                                      <Text alignment="center">
                                        No messages available
                                      </Text>
                                    )}
                                  </BlockStack>
                                </Box>
                              </Collapsible>
                            </BlockStack>
                          );
                        })}

                      {/* Actions */}
                      <Box paddingBlock="300">
                        <InlineStack align="center" gap="300">
                          {aiHistoryData.length > visibleThreads && (
                            <Button
                              size="slim"
                              onClick={() =>
                                setVisibleThreads((n) =>
                                  Math.min(n + 5, aiHistoryData.length),
                                )
                              }
                            >
                              Show more
                            </Button>
                          )}
                          <Button
                            url="https://www.voicero.ai/app/chats"
                            external={true}
                          >
                            View All Conversations
                          </Button>
                        </InlineStack>
                      </Box>
                    </>
                  ) : (
                    // No data available
                    <Box
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <Text alignment="center">
                        {aiHistoryError
                          ? "Error loading queries. Next.js API server not available."
                          : "No recent queries available"}
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Website Overview */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <InlineStack gap="200">
                    <Icon source={GlobeIcon} color="highlight" />
                    <Text as="h3" variant="headingMd">
                      Website Overview
                    </Text>
                  </InlineStack>
                  <Button onClick={() => navigate("/app/settings")}>
                    Manage Settings
                  </Button>
                </InlineStack>
                <Divider />
                <BlockStack gap="300">
                  <InlineStack gap="200" align="start">
                    <Box width="24px">
                      <Icon source={GlobeIcon} color="base" />
                    </Box>
                    <BlockStack gap="0">
                      <InlineStack gap="200">
                        <Text as="p" variant="bodyMd" fontWeight="bold">
                          Website:
                        </Text>
                        <Text as="p">{websiteData?.name || "Not set"}</Text>
                      </InlineStack>
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="200" align="start">
                    <Box width="24px">
                      <Icon source={GlobeIcon} color="base" />
                    </Box>
                    <BlockStack gap="0">
                      <InlineStack gap="200">
                        <Text as="p" variant="bodyMd" fontWeight="bold">
                          URL:
                        </Text>
                        <Text as="p">{websiteData?.url || "Not set"}</Text>
                      </InlineStack>
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="200" align="start">
                    <Box width="24px">
                      <Icon source={RefreshIcon} color="base" />
                    </Box>
                    <BlockStack gap="0">
                      <InlineStack gap="200">
                        <Text as="p" variant="bodyMd" fontWeight="bold">
                          Last Synced:
                        </Text>
                        <Text as="p">
                          {websiteData?.lastSyncedAt
                            ? new Date(
                                websiteData.lastSyncedAt,
                              ).toLocaleString()
                            : "Never"}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {showToast && (
        <Toast
          content={toastMessage}
          tone={toastType}
          onDismiss={toggleToast}
        />
      )}
    </Page>
  );
}

// Error boundary for this route
export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let errorMessage = "Unknown error";
  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <Page>
      <EmptyState
        heading="Error loading AI usage data"
        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        action={{
          content: "Back to Dashboard",
          onAction: () => navigate("/app"),
        }}
      >
        <p>{errorMessage}</p>
        {error.stack && (
          <details>
            <summary>Error details</summary>
            <pre>{error.stack}</pre>
          </details>
        )}
      </EmptyState>
    </Page>
  );
}
