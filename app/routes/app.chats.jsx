import { useState, useEffect, useCallback } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  InlineStack,
  Icon,
  Box,
  Divider,
  Spinner,
  Badge,
  Select,
  Collapsible,
  TextField,
  Banner,
} from "@shopify/polaris";
import {
  ChatIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CalendarIcon,
  MicrophoneIcon,
  FilterIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

async function getAccessKey(admin) {
  try {
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
    return metafieldData.data.shop.metafield?.value;
  } catch (error) {
    console.error("Error fetching access key:", error);
    return null;
  }
}

async function getWebsiteData(accessKey) {
  try {
    const response = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }

    const data = await response.json();
    return data.website;
  } catch (error) {
    console.error("Error fetching website data:", error);
    return null;
  }
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get access key
  const accessKey = await getAccessKey(admin);
  if (!accessKey) {
    return json({ error: "No access key found", website: null });
  }

  // Get website data
  const website = await getWebsiteData(accessKey);

  return json({ website, accessKey });
};

export default function Chats() {
  const loaderData = useLoaderData();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [expandedChats, setExpandedChats] = useState(new Set());

  // Filter and sort states
  const [websiteId, setWebsiteId] = useState(loaderData?.website?.id || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState("recent");
  const [currentPage, setCurrentPage] = useState(1);

  const fetcher = useFetcher();

  const sortOptions = [
    { label: "Most Recent", value: "recent" },
    { label: "Oldest", value: "oldest" },
    { label: "Longest", value: "longest" },
    { label: "Shortest", value: "shortest" },
  ];

  const fetchChats = useCallback(
    async (page = 1, append = false) => {
      if (page === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          websiteId,
          page: page.toString(),
          limit: "10",
          sort: sortOption,
        });

        if (searchQuery && searchQuery.length >= 3) {
          params.append("search", searchQuery);
        }

        const response = await fetch(`/api/websites/chats?${params}`);
        const data = await response.json();

        if (response.ok) {
          if (append) {
            setConversations((prev) => [...prev, ...data.conversations]);
          } else {
            setConversations(data.conversations);
            setCurrentPage(1);
          }
          setPagination(data.pagination);
        } else {
          setError(data.error || "Failed to fetch chats");
        }
      } catch (err) {
        setError("Failed to fetch chats");
        console.error("Error fetching chats:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [websiteId, searchQuery, sortOption],
  );

  useEffect(() => {
    fetchChats(1, false);
  }, [fetchChats]);

  const handleLoadMore = () => {
    if (pagination?.hasMore) {
      fetchChats(currentPage + 1, true);
      setCurrentPage((prev) => prev + 1);
    }
  };

  const toggleChatExpansion = (chatId) => {
    setExpandedChats((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(chatId)) {
        newSet.delete(chatId);
      } else {
        newSet.add(chatId);
      }
      return newSet;
    });
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "voice":
        return MicrophoneIcon;
      default:
        return ChatIcon;
    }
  };

  const highlightSearchText = (text, searchTerm) => {
    if (!searchTerm || searchTerm.length < 3 || !text) {
      return text;
    }

    const regex = new RegExp(
      `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi",
    );
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <span
          key={index}
          style={{
            backgroundColor: "#FFD700",
            fontWeight: "bold",
            padding: "1px 2px",
            borderRadius: "2px",
          }}
        >
          {part}
        </span>
      ) : (
        part
      ),
    );
  };

  const getTypeBadge = (type, sourceType) => {
    if (type === "voice" || sourceType === "voiceconversation") {
      return <Badge tone="info">Voice</Badge>;
    } else if (sourceType === "textconversation") {
      return <Badge tone="success">Text</Badge>;
    } else {
      return <Badge>AI Thread</Badge>;
    }
  };

  const renderActionBadges = (hasAction) => {
    if (!hasAction) return null;

    const badges = [];
    if (hasAction.click)
      badges.push(
        <Badge key="click" tone="warning">
          Click
        </Badge>,
      );
    if (hasAction.scroll)
      badges.push(
        <Badge key="scroll" tone="info">
          Scroll
        </Badge>,
      );
    if (hasAction.purchase)
      badges.push(
        <Badge key="purchase" tone="success">
          Purchase
        </Badge>,
      );
    if (hasAction.redirect)
      badges.push(
        <Badge key="redirect" tone="critical">
          Redirect
        </Badge>,
      );

    return badges;
  };

  if (loaderData?.error || !loaderData?.website) {
    return (
      <Page title="Chats">
        <Layout>
          <Layout.Section>
            <Banner tone="warning" title="No Website Connected">
              <p>
                {loaderData?.error ||
                  "Please connect your website first to view conversations."}{" "}
                <Link url="/app">Go to main page to connect</Link>
              </p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (loading && conversations.length === 0) {
    return (
      <Page title="Chats">
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="400">
                <InlineStack align="center">
                  <Spinner size="small" />
                  <Text>Loading conversations...</Text>
                </InlineStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Chats"
      subtitle={`${pagination?.totalCount || 0} conversations found`}
    >
      <Layout>
        <Layout.Section>
          {/* Filters */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Filters</Text>
              <InlineStack gap="400">
                <Box minWidth="200px">
                  <TextField
                    label="Connected Website"
                    value={`${loaderData?.website?.name || loaderData?.website?.url || "Unknown"} (ID: ${websiteId})`}
                    disabled
                    helpText="This is your connected website"
                  />
                </Box>
                <Box minWidth="200px">
                  <TextField
                    label="Search Conversations"
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Enter at least 3 characters to search..."
                    helpText={
                      searchQuery.length > 0 && searchQuery.length < 3
                        ? `${3 - searchQuery.length} more characters needed`
                        : "Search in conversation content"
                    }
                    connectedLeft={<Icon source={FilterIcon} />}
                  />
                </Box>
                <Box minWidth="150px">
                  <Select
                    label="Sort by"
                    options={sortOptions}
                    value={sortOption}
                    onChange={setSortOption}
                  />
                </Box>
                <Box paddingBlockStart="600">
                  <Button
                    primary={searchQuery.length >= 3}
                    disabled={searchQuery.length > 0 && searchQuery.length < 3}
                    onClick={() => fetchChats(1, false)}
                  >
                    {searchQuery.length >= 3 ? "Search" : "Load All"}
                  </Button>
                </Box>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {error && (
            <Banner tone="critical" title="Error">
              <p>{error}</p>
            </Banner>
          )}

          {conversations.length === 0 && !loading ? (
            <Card>
              <Box padding="400">
                <InlineStack align="center">
                  <Icon source={ChatIcon} />
                  <Text>No conversations found</Text>
                </InlineStack>
              </Box>
            </Card>
          ) : (
            <BlockStack gap="400">
              {conversations.map((conversation) => {
                const isExpanded = expandedChats.has(conversation.id);
                const TypeIcon = getTypeIcon(conversation.type);

                return (
                  <Card key={conversation.id}>
                    <BlockStack gap="300">
                      {/* Chat Header */}
                      <Box padding="400">
                        <InlineStack align="space-between">
                          <InlineStack gap="300" align="center">
                            <Icon source={TypeIcon} />
                            <BlockStack gap="100">
                              <InlineStack gap="200" align="center">
                                {getTypeBadge(
                                  conversation.type,
                                  conversation.source_type,
                                )}
                                <Text variant="bodySm" tone="subdued">
                                  {conversation.messageCount} messages
                                </Text>
                                <Text variant="bodySm" tone="subdued">
                                  {formatDate(conversation.startedAt)}
                                </Text>
                              </InlineStack>
                              <Text variant="headingMd" truncate>
                                {highlightSearchText(
                                  conversation.initialQuery,
                                  searchQuery,
                                )}
                              </Text>
                              <InlineStack gap="200">
                                <Text variant="bodySm" tone="subdued">
                                  {conversation.website?.name ||
                                    conversation.website?.domain}
                                </Text>
                                {renderActionBadges(conversation.hasAction)}
                              </InlineStack>
                            </BlockStack>
                          </InlineStack>
                          <Button
                            icon={isExpanded ? ChevronUpIcon : ChevronDownIcon}
                            variant="tertiary"
                            onClick={() => toggleChatExpansion(conversation.id)}
                          >
                            {isExpanded ? "Collapse" : "Expand"}
                          </Button>
                        </InlineStack>
                      </Box>

                      {/* Expanded Messages */}
                      <Collapsible open={isExpanded}>
                        <Box paddingInline="400" paddingBlockEnd="400">
                          <Divider />
                          <Box paddingBlockStart="400">
                            <BlockStack gap="300">
                              <Text variant="headingMd">Full Conversation</Text>
                              {conversation.messages?.map((message, index) => (
                                <Card
                                  key={index}
                                  background={
                                    message.role === "user"
                                      ? "bg-surface-secondary"
                                      : "bg-surface"
                                  }
                                >
                                  <Box padding="300">
                                    <BlockStack gap="200">
                                      <InlineStack gap="200" align="center">
                                        <Badge
                                          tone={
                                            message.role === "user"
                                              ? "info"
                                              : "success"
                                          }
                                        >
                                          {message.role === "user"
                                            ? "User"
                                            : "Assistant"}
                                        </Badge>
                                        {message.type === "voice" && (
                                          <Badge tone="warning">Voice</Badge>
                                        )}
                                        <Text variant="bodySm" tone="subdued">
                                          {formatDate(message.createdAt)}
                                        </Text>
                                      </InlineStack>
                                      <Text>
                                        {highlightSearchText(
                                          message.content,
                                          searchQuery,
                                        )}
                                      </Text>
                                    </BlockStack>
                                  </Box>
                                </Card>
                              ))}
                            </BlockStack>
                          </Box>
                        </Box>
                      </Collapsible>
                    </BlockStack>
                  </Card>
                );
              })}

              {/* Load More Button */}
              {pagination?.hasMore && (
                <Box paddingBlockStart="400">
                  <InlineStack align="center">
                    <Button
                      loading={loadingMore}
                      onClick={handleLoadMore}
                      size="large"
                    >
                      Load More ({pagination.totalCount - conversations.length}{" "}
                      remaining)
                    </Button>
                  </InlineStack>
                </Box>
              )}

              {/* Pagination Info */}
              {pagination && (
                <Box paddingBlockStart="200">
                  <InlineStack align="center">
                    <Text variant="bodySm" tone="subdued">
                      Showing {conversations.length} of {pagination.totalCount}{" "}
                      conversations
                      {pagination.totalPages > 1 &&
                        ` (Page ${pagination.page} of ${pagination.totalPages})`}
                    </Text>
                  </InlineStack>
                </Box>
              )}
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
