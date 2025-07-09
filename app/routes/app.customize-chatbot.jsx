import { useState, useCallback } from "react";
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
  TextField,
  Select,
  ColorPicker,
  Checkbox,
  Banner,
  Combobox,
  Listbox,
  Tag,
  LegacyStack,
  ButtonGroup,
  Frame,
} from "@shopify/polaris";
import {
  ChatIcon,
  RefreshIcon,
  SettingsIcon,
  EditIcon,
  ColorIcon,
  DeleteIcon,
  PlusIcon,
  PersonIcon,
  NoteIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

// SVG Icons for different options
const SVG_ICONS = {
  // Voice icons
  microphone: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
    >
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z" />
    </svg>
  ),
  waveform: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M3 12h2v3H3v-3zm4-4h2v10H7V8zm4-6h2v22h-2V2zm4 6h2v10h-2V8zm4 4h2v3h-2v-3z" />
    </svg>
  ),
  speaker: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M5 9v6h4l5 5V4L9 9H5zm13.54.12a1 1 0 1 0-1.41 1.42 3 3 0 0 1 0 4.24 1 1 0 1 0 1.41 1.41 5 5 0 0 0 0-7.07z" />
    </svg>
  ),

  // Message icons
  message: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM4 16V4h16v12H5.17L4 17.17V16z" />
    </svg>
  ),
  cursor: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      viewBox="0 0 24 24"
      width="24"
      height="24"
    >
      <path d="M11 2h2v20h-2z" />
    </svg>
  ),
  document: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M4 4h16v2H4V4zm0 4h16v2H4V8zm0 4h10v2H4v-2zm0 4h16v2H4v-2z" />
    </svg>
  ),

  // Bot icons
  bot: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width="24"
      height="24"
      fill="currentColor"
    >
      <rect
        x="12"
        y="16"
        width="40"
        height="32"
        rx="10"
        ry="10"
        stroke="black"
        stroke-width="2"
        fill="currentColor"
      />
      <circle cx="22" cy="32" r="4" fill="white" />
      <circle cx="42" cy="32" r="4" fill="white" />
      <path
        d="M24 42c4 4 12 4 16 0"
        stroke="white"
        stroke-width="2"
        fill="none"
        stroke-linecap="round"
      />
      <line x1="32" y1="8" x2="32" y2="16" stroke="black" stroke-width="2" />
      <circle cx="32" cy="6" r="2" fill="black" />
    </svg>
  ),
  voice: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M5 9v6h4l5 5V4L9 9H5zm13.54.12a1 1 0 1 0-1.41 1.42 3 3 0 0 1 0 4.24 1 1 0 1 0 1.41 1.41 5 5 0 0 0 0-7.07z" />
    </svg>
  ),
};

// Helper function to get the appropriate icon
const getIconForType = (type, iconType) => {
  // Default to first option if not found
  if (!SVG_ICONS[iconType]) {
    if (type === "bot") return SVG_ICONS.bot;
    if (type === "voice") return SVG_ICONS.microphone;
    if (type === "message") return SVG_ICONS.message;
    return null;
  }
  return SVG_ICONS[iconType];
};

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
    console.log("API Response:", data);

    if (!data.website) {
      return json({
        error: "No website data found",
      });
    }

    const website = data.website;

    // Format popup questions properly
    let formattedPopUpQuestions = [];
    if (website.popUpQuestions && Array.isArray(website.popUpQuestions)) {
      formattedPopUpQuestions = website.popUpQuestions.map((q) =>
        typeof q === "string" ? q : q.question || "",
      );
    }

    // Return the website data with all the customization options
    return json({
      websiteData: website,
      accessKey,
      chatbotSettings: {
        customInstructions: website.customInstructions || "",
        customWelcomeMessage: website.customWelcomeMessage || "",
        popUpQuestions: formattedPopUpQuestions,
        color: website.color || "#008060",
        removeHighlight: website.removeHighlight || false,
        botName: website.botName || "AI Assistant",
        iconBot: website.iconBot || "robot",
        iconVoice: website.iconVoice || "microphone",
        iconMessage: website.iconMessage || "chat",
        clickMessage: website.clickMessage || "",
        allowMultiAIReview: website.allowMultiAIReview || false,
        // Additional fields for compatibility with UI
        monthlyQueries: website.monthlyQueries,
        queryLimit: website.queryLimit,
        renewsOn: website.renewsOn,
        lastSyncedAt: website.lastSyncedAt,
        name: website.name,
        url: website.url,
      },
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return json({
      error: error.message || "Failed to fetch website data",
    });
  }
};

// Utility function to count words in a string
function countWords(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

// Helper function to convert hex color to HSB
function hexToHsb(hex) {
  // Remove the # if present
  hex = hex.replace(/^#/, "");

  // Parse the hex values to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  // Find the maximum and minimum values to calculate saturation
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Calculate HSB values
  let h = 0;
  let s = max === 0 ? 0 : delta / max;
  let br = max;

  // Calculate hue
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }

    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  // Return HSB object in the format expected by ColorPicker
  return {
    hue: h,
    saturation: s,
    brightness: br,
  };
}

// Helper function to convert HSB to hex
function hsbToHex({ hue, saturation, brightness }) {
  let h = hue / 360;
  let s = saturation;
  let v = brightness;

  let r, g, b;

  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }

  // Convert to hex
  r = Math.round(r * 255)
    .toString(16)
    .padStart(2, "0");
  g = Math.round(g * 255)
    .toString(16)
    .padStart(2, "0");
  b = Math.round(b * 255)
    .toString(16)
    .padStart(2, "0");

  return `#${r}${g}${b}`;
}

export default function CustomizeChatbotPage() {
  const { websiteData, chatbotSettings, error, disconnected, accessKey } =
    useLoaderData();

  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");
  const [isSaving, setIsSaving] = useState(false);

  // Form state for chatbot settings
  const [botName, setBotName] = useState(
    chatbotSettings?.botName || "Voicero AI",
  );
  const [welcomeMessage, setWelcomeMessage] = useState(
    chatbotSettings?.customWelcomeMessage || "",
  );
  const [customInstructions, setCustomInstructions] = useState(
    chatbotSettings?.customInstructions || "",
  );
  const [clickMessage, setClickMessage] = useState(
    chatbotSettings?.clickMessage || "",
  );
  const [popUpQuestions, setPopUpQuestions] = useState(
    chatbotSettings?.popUpQuestions || [],
  );
  const [primaryColor, setPrimaryColor] = useState(
    chatbotSettings?.color
      ? hexToHsb(chatbotSettings.color)
      : { hue: 147, brightness: 0.5, saturation: 1 },
  );
  const [allowMultiAIReview, setAllowMultiAIReview] = useState(
    chatbotSettings?.allowMultiAIReview || false,
  );

  // Icon selection state
  const [iconBot, setIconBot] = useState(chatbotSettings?.iconBot || "robot");

  // Validation states
  const [botNameError, setBotNameError] = useState("");
  const [welcomeMessageError, setWelcomeMessageError] = useState("");
  const [customInstructionsError, setCustomInstructionsError] = useState("");
  const [clickMessageError, setClickMessageError] = useState("");
  const [popUpQuestionsError, setPopUpQuestionsError] = useState("");

  // New popup question input
  const [newQuestion, setNewQuestion] = useState("");

  // Validation handlers
  const validateBotName = useCallback((value) => {
    const chars = value.length;

    if (chars > 120) {
      setBotNameError("Bot name cannot be more than 120 characters");
      return false;
    }

    setBotNameError("");
    return true;
  }, []);

  const validateWelcomeMessage = useCallback((value) => {
    const words = countWords(value);

    if (words > 25) {
      setWelcomeMessageError("Welcome message cannot be more than 25 words");
      return false;
    }

    setWelcomeMessageError("");
    return true;
  }, []);

  const validateCustomInstructions = useCallback((value) => {
    const words = countWords(value);

    if (words > 50) {
      setCustomInstructionsError(
        "Custom instructions cannot be more than 50 words",
      );
      return false;
    }

    setCustomInstructionsError("");
    return true;
  }, []);

  const validateClickMessage = useCallback((value) => {
    const words = countWords(value);

    if (words > 15) {
      setClickMessageError("Click message cannot be more than 15 words");
      return false;
    }

    setClickMessageError("");
    return true;
  }, []);

  // Handle adding a new popup question
  const handleAddQuestion = useCallback(() => {
    if (!newQuestion.trim()) return;

    if (popUpQuestions.length >= 3) {
      setPopUpQuestionsError("You can only have up to 3 popup questions");
      return;
    }

    setPopUpQuestions((prev) => [...prev, newQuestion.trim()]);
    setNewQuestion("");
    setPopUpQuestionsError("");
  }, [newQuestion, popUpQuestions]);

  // Handle removing a popup question
  const handleRemoveQuestion = useCallback((indexToRemove) => {
    setPopUpQuestions((prev) =>
      prev.filter((_, index) => index !== indexToRemove),
    );
    setPopUpQuestionsError("");
  }, []);

  // Icon options
  const botIconOptions = [
    { label: "Bot", value: "bot" },
    { label: "Voice", value: "voice" },
    { label: "Message", value: "message" },
  ];

  // Form submission
  const handleSave = async () => {
    // Validate all fields
    const isNameValid = botName ? validateBotName(botName) : true;
    const isWelcomeValid = validateWelcomeMessage(welcomeMessage);
    const isInstructionsValid = validateCustomInstructions(customInstructions);
    const isClickMessageValid = validateClickMessage(clickMessage);

    if (
      !isNameValid ||
      !isWelcomeValid ||
      !isInstructionsValid ||
      !isClickMessageValid
    ) {
      return;
    }

    if (popUpQuestions.length > 3) {
      setPopUpQuestionsError("You can only have up to 3 popup questions");
      return;
    }

    setIsSaving(true);

    try {
      // Convert color from HSB to hex
      const colorHex = hsbToHex(primaryColor);

      // Ensure popup questions are simple strings - this was causing the issue
      const formattedQuestions = popUpQuestions.map((q) =>
        typeof q === "object" && q.question ? q.question : String(q),
      );

      // Prepare data for API
      const updateData = {
        websiteId: websiteData.id,
        botName,
        customWelcomeMessage: welcomeMessage,
        customInstructions,
        clickMessage,
        popUpQuestions: formattedQuestions,
        color: colorHex,
        allowMultiAIReview,
        iconBot,
      };

      console.log("Saving chatbot settings:", updateData);
      console.log("Popup questions being sent:", formattedQuestions);

      // Make API call to save settings
      const response = await fetch(`${urls.voiceroApi}/api/saveBotSettings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || errorData.message || "Failed to update settings",
        );
      }

      // Get the response data
      const data = await response.json();
      console.log("API response:", data);

      setToastMessage("Chatbot settings saved successfully!");
      setToastType("success");
      setShowToast(true);
    } catch (error) {
      console.error("Error saving settings:", error);
      setToastMessage("Failed to save settings: " + error.message);
      setToastType("critical");
      setShowToast(true);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleToast = () => setShowToast(!showToast);

  // Redirect if disconnected
  if (disconnected) {
    navigate("/app");
    return null;
  }

  if (error) {
    return (
      <Page>
        <EmptyState
          heading="Unable to load chatbot settings"
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          action={{ content: "Back to Dashboard", url: "/app" }}
        >
          <p>{error}</p>
        </EmptyState>
      </Page>
    );
  }

  return (
    <Frame>
      <Page
        title="Customize AI Chatbot"
        backAction={{
          content: "Back",
          onAction: () => navigate("/app"),
        }}
        primaryAction={{
          content: "Save Settings",
          onAction: handleSave,
          loading: isSaving,
        }}
      >
        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              {/* Chatbot Identification Card */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={PersonIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Chatbot Identity
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="400">
                    <TextField
                      label="Chatbot Name"
                      value={botName}
                      onChange={(value) => {
                        setBotName(value);
                        validateBotName(value);
                      }}
                      autoComplete="off"
                      helpText="The name displayed to your customers (max 120 characters)"
                      error={botNameError}
                      disabled={true}
                    />
                    <Banner tone="info">
                      Note: Chatbot name is currently disabled and not being
                      used.
                    </Banner>

                    <TextField
                      label="Welcome Message"
                      value={welcomeMessage}
                      onChange={(value) => {
                        setWelcomeMessage(value);
                        validateWelcomeMessage(value);
                      }}
                      multiline={3}
                      autoComplete="off"
                      helpText="First message shown when a customer opens the chat (max 25 words)"
                      error={welcomeMessageError}
                      disabled={true}
                    />
                    <Banner tone="info">
                      Note: Welcome message is currently disabled and not being
                      used.
                    </Banner>

                    <TextField
                      label="Custom Instructions"
                      value={customInstructions}
                      onChange={(value) => {
                        setCustomInstructions(value);
                        validateCustomInstructions(value);
                      }}
                      multiline={4}
                      autoComplete="off"
                      helpText="Specific instructions for how the AI should behave or respond (max 50 words)"
                      error={customInstructionsError}
                    />

                    <Checkbox
                      label="Allow Multi-AI Review"
                      checked={allowMultiAIReview}
                      onChange={setAllowMultiAIReview}
                      helpText="When enabled, multiple AI models will review responses for better quality"
                    />

                    <TextField
                      label="Click Message"
                      value={clickMessage}
                      onChange={(value) => {
                        setClickMessage(value);
                        validateClickMessage(value);
                      }}
                      autoComplete="off"
                      helpText="Message shown when user clicks on the chatbot button (max 15 words)"
                      error={clickMessageError}
                    />
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Popup Questions Card */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={ChatIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Suggested Questions
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="400">
                    <Text variant="bodyMd">
                      Add up to 3 suggested questions that will appear as quick
                      options for customers to click.
                    </Text>

                    <Banner tone="info">
                      Note: Suggested questions are currently disabled and not
                      being used.
                    </Banner>

                    {/* Popup questions list - now disabled */}
                    <BlockStack gap="300">
                      {popUpQuestions.length > 0 ? (
                        popUpQuestions.map((question, index) => (
                          <InlineStack key={index} align="space-between">
                            <Text variant="bodyMd" color="subdued">
                              {typeof question === "object"
                                ? question.question || ""
                                : question}
                            </Text>
                            <Button
                              icon={DeleteIcon}
                              plain
                              onClick={() => handleRemoveQuestion(index)}
                              accessibilityLabel="Remove question"
                              disabled={true}
                            />
                          </InlineStack>
                        ))
                      ) : (
                        <Text variant="bodySm" color="subdued">
                          No suggested questions added yet.
                        </Text>
                      )}
                    </BlockStack>

                    {/* Add new question - now disabled */}
                    <InlineStack gap="200" align="start">
                      <div style={{ flexGrow: 1 }}>
                        <TextField
                          label="Add a suggested question"
                          value={newQuestion}
                          onChange={setNewQuestion}
                          autoComplete="off"
                          labelHidden
                          placeholder="Type a question customers might ask..."
                          disabled={true}
                        />
                      </div>
                      <div style={{ marginTop: "4px" }}>
                        <Button
                          onClick={handleAddQuestion}
                          disabled={true}
                          icon={PlusIcon}
                        >
                          Add
                        </Button>
                      </div>
                    </InlineStack>

                    {popUpQuestionsError && (
                      <Banner tone="critical">
                        <p>{popUpQuestionsError}</p>
                      </Banner>
                    )}

                    <Text variant="bodySm" color="subdued">
                      {popUpQuestions.length}/3 questions added
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Appearance Card */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={ColorIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Appearance Settings
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="400">
                    <Box
                      padding="400"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <BlockStack gap="200">
                        <Text variant="bodyMd" fontWeight="bold" as="p">
                          Primary Color
                        </Text>
                        <ColorPicker
                          onChange={setPrimaryColor}
                          color={primaryColor}
                        />
                        <Text variant="bodySm" as="p" color="subdued">
                          This color will be used for the chatbot button and
                          header
                        </Text>
                      </BlockStack>
                    </Box>

                    <InlineStack gap="400" blockAlign="center">
                      <Select
                        label="Bot Icon Type"
                        options={botIconOptions}
                        onChange={setIconBot}
                        value={iconBot}
                        helpText="Icon displayed for the chatbot"
                      />
                      <div style={{ marginTop: "1.6rem", marginLeft: "1rem" }}>
                        <div style={{ color: "#2c6ecb" }}>
                          {getIconForType("bot", iconBot)}
                        </div>
                      </div>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Website Information Card */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={RefreshIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Website Information
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="300">
                    <InlineStack gap="200" align="start">
                      <Box width="24px">
                        <Icon source={ChatIcon} color="base" />
                      </Box>
                      <BlockStack gap="0">
                        <InlineStack gap="200">
                          <Text as="p" variant="bodyMd" fontWeight="bold">
                            Website:
                          </Text>
                          <Text as="p">
                            {chatbotSettings?.name || "Not set"}
                          </Text>
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
                            {chatbotSettings?.lastSyncedAt
                              ? new Date(
                                  chatbotSettings.lastSyncedAt,
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
    </Frame>
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
        heading="Error loading chatbot settings"
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
