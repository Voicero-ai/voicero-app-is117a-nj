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
  ColorPicker,
  Checkbox,
  Banner,
  LegacyStack,
  Frame,
} from "@shopify/polaris";
import {
  ChatIcon,
  RefreshIcon,
  SettingsIcon,
  ColorIcon,
  DeleteIcon,
  PlusIcon,
  PersonIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

// Normalize backend flags that may arrive as 1/0, "1"/"0", "true"/"false", or booleans
function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
    if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  }
  return Boolean(value);
}

// Removed icon selection feature

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

    // Fetch interface settings using new API
    const interfaceRes = await fetch(
      `https://90fd72f59232.ngrok-free.app/api/updateInterface/get?websiteId=${website.id}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
      },
    );

    if (!interfaceRes.ok) {
      return json({
        error: "Failed to fetch interface settings",
      });
    }

    const interfaceData = await interfaceRes.json();
    const site = interfaceData.website;

    // Format popup questions properly
    let formattedPopUpQuestions = [];
    if (site.popUpQuestions && Array.isArray(site.popUpQuestions)) {
      formattedPopUpQuestions = site.popUpQuestions.map((q) => ({
        id: q.id,
        question: q.question || "",
        createdAt: q.createdAt,
      }));
    }

    // Auto features normalized
    const autoFeatures = {
      allowAutoRedirect: toBoolean(site.allowAutoRedirect, false),
      allowAutoScroll: toBoolean(site.allowAutoScroll, false),
      allowAutoHighlight: toBoolean(site.allowAutoHighlight, false),
      allowAutoClick: toBoolean(site.allowAutoClick, false),
      allowAutoCancel: toBoolean(site.allowAutoCancel, false),
      allowAutoReturn: toBoolean(site.allowAutoReturn, false),
      allowAutoExchange: toBoolean(site.allowAutoExchange, false),
      allowAutoGetUserOrders: toBoolean(site.allowAutoGetUserOrders, false),
      allowAutoUpdateUserInfo: toBoolean(site.allowAutoUpdateUserInfo, false),
      // Defaults true where UI indicates enabled-by-default
      allowAutoFillForm: toBoolean(site.allowAutoFillForm, true),
      allowAutoTrackOrder: toBoolean(site.allowAutoTrackOrder, true),
      allowAutoLogout: toBoolean(site.allowAutoLogout, true),
      allowAutoLogin: toBoolean(site.allowAutoLogin, true),
      allowAutoGenerateImage: toBoolean(site.allowAutoGenerateImage, true),
    };

    // Return the website data with all the customization options
    return json({
      websiteData: website,
      accessKey,
      chatbotSettings: {
        customInstructions: site.customInstructions || "",
        customWelcomeMessage: site.customWelcomeMessage || "",
        popUpQuestions: formattedPopUpQuestions,
        color: site.color || "#008060",
        removeHighlight: false,
        botName: site.botName || "AI Assistant",
        autoFeatures,
        showVoiceAI: Boolean(site.showVoiceAI),
        showTextAI: Boolean(site.showTextAI),
        showHome: Boolean(site.showHome),
        showNews: Boolean(site.showNews),
        showHelp: Boolean(site.showHelp),
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

// Parse color input string to hex. Accepts #RRGGBB, #RGB, rgb(r,g,b)
function parseColorInputToHex(input) {
  if (!input) return null;
  const value = String(input).trim();
  // Hex full or short
  if (/^#?[0-9a-fA-F]{6}$/.test(value)) {
    return value.startsWith("#") ? value : `#${value}`;
  }
  if (/^#?[0-9a-fA-F]{3}$/.test(value)) {
    const v = value.replace("#", "");
    const r = v[0];
    const g = v[1];
    const b = v[2];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  // rgb(r,g,b)
  const rgbMatch = value
    .replace(/\s+/g, "")
    .match(/^rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)$/i);
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10)));
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  // Plain comma separated r,g,b
  const parts = value.split(",");
  if (parts.length === 3 && parts.every((p) => /^\d{1,3}$/.test(p.trim()))) {
    const r = Math.max(0, Math.min(255, parseInt(parts[0].trim(), 10)));
    const g = Math.max(0, Math.min(255, parseInt(parts[1].trim(), 10)));
    const b = Math.max(0, Math.min(255, parseInt(parts[2].trim(), 10)));
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return null;
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
  const [popUpQuestions, setPopUpQuestions] = useState(
    chatbotSettings?.popUpQuestions || [],
  );
  const [primaryColor, setPrimaryColor] = useState(
    chatbotSettings?.color
      ? hexToHsb(chatbotSettings.color)
      : { hue: 147, brightness: 0.5, saturation: 1 },
  );
  const [colorInput, setColorInput] = useState(
    chatbotSettings?.color || "#008060",
  );

  // Auto features state
  const [autoFeatures, setAutoFeatures] = useState(
    chatbotSettings?.autoFeatures || {
      allowAutoRedirect: false,
      allowAutoScroll: false,
      allowAutoHighlight: false,
      allowAutoClick: false,
      allowAutoCancel: false,
      allowAutoReturn: false,
      allowAutoExchange: false,
      allowAutoGetUserOrders: false,
      allowAutoUpdateUserInfo: false,
      allowAutoFillForm: true,
      allowAutoTrackOrder: true,
      allowAutoLogout: true,
      allowAutoLogin: true,
      allowAutoGenerateImage: true,
    },
  );

  const toggleAutoFeature = useCallback((featureKey) => {
    setAutoFeatures((prev) => ({ ...prev, [featureKey]: !prev[featureKey] }));
  }, []);

  // AI UI toggles state
  const [showVoiceAI, setShowVoiceAI] = useState(
    Boolean(chatbotSettings?.showVoiceAI),
  );
  const [showTextAI, setShowTextAI] = useState(
    Boolean(chatbotSettings?.showTextAI),
  );

  // Bottom navigation toggles state
  const [showHome, setShowHome] = useState(Boolean(chatbotSettings?.showHome));
  const [showNews, setShowNews] = useState(Boolean(chatbotSettings?.showNews));
  const [showHelp, setShowHelp] = useState(Boolean(chatbotSettings?.showHelp));

  // Validation states
  const [botNameError, setBotNameError] = useState("");
  const [welcomeMessageError, setWelcomeMessageError] = useState("");
  const [customInstructionsError, setCustomInstructionsError] = useState("");
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

  // Handle adding a new popup question
  const handleAddQuestion = useCallback(async () => {
    const text = newQuestion.trim();
    if (!text) return;

    if (popUpQuestions.length >= 3) {
      setPopUpQuestionsError("You can only have up to 3 popup questions");
      return;
    }

    try {
      const res = await fetch(
        `https://90fd72f59232.ngrok-free.app/api/updateInterface/addQuestion`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify({ websiteId: websiteData.id, question: text }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to add question");
      }
      setPopUpQuestions((prev) => [
        { id: data.id, question: text, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      setNewQuestion("");
      setPopUpQuestionsError("");
    } catch (e) {
      setPopUpQuestionsError(e.message || "Failed to add question");
    }
  }, [newQuestion, popUpQuestions, accessKey, websiteData?.id]);

  // Handle removing a popup question
  const handleRemoveQuestion = useCallback(
    async (indexToRemove) => {
      const q = popUpQuestions[indexToRemove];
      if (!q?.id) {
        setPopUpQuestions((prev) => prev.filter((_, i) => i !== indexToRemove));
        return;
      }
      try {
        const res = await fetch(
          `https://90fd72f59232.ngrok-free.app/api/updateInterface/deleteQuestion`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${accessKey}`,
            },
            body: JSON.stringify({ websiteId: websiteData.id, id: q.id }),
          },
        );
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to delete question");
        }
        setPopUpQuestions((prev) => prev.filter((_, i) => i !== indexToRemove));
        setPopUpQuestionsError("");
      } catch (e) {
        setPopUpQuestionsError(e.message || "Failed to delete question");
      }
    },
    [popUpQuestions, accessKey, websiteData?.id],
  );

  // Removed icon options

  // Form submission
  const handleSave = async () => {
    // Validate all fields
    const isNameValid = botName ? validateBotName(botName) : true;
    const isWelcomeValid = validateWelcomeMessage(welcomeMessage);
    const isInstructionsValid = validateCustomInstructions(customInstructions);

    if (!isNameValid || !isWelcomeValid || !isInstructionsValid) {
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

      // Prepare data for interface API
      const updateData = {
        websiteId: websiteData.id,
        botName,
        customWelcomeMessage: welcomeMessage,
        customInstructions,
        color: colorHex,
        showVoiceAI,
        showTextAI,
        showHome,
        showNews,
        showHelp,
        // Auto features included in same request
        allowAutoRedirect: !!autoFeatures.allowAutoRedirect,
        allowAutoScroll: !!autoFeatures.allowAutoScroll,
        allowAutoHighlight: !!autoFeatures.allowAutoHighlight,
        allowAutoClick: !!autoFeatures.allowAutoClick,
        allowAutoCancel: !!autoFeatures.allowAutoCancel,
        allowAutoReturn: !!autoFeatures.allowAutoReturn,
        allowAutoExchange: !!autoFeatures.allowAutoExchange,
        allowAutoGetUserOrders: !!autoFeatures.allowAutoGetUserOrders,
        allowAutoUpdateUserInfo: !!autoFeatures.allowAutoUpdateUserInfo,
        allowAutoFillForm: !!autoFeatures.allowAutoFillForm,
        allowAutoTrackOrder: !!autoFeatures.allowAutoTrackOrder,
        allowAutoLogout: !!autoFeatures.allowAutoLogout,
        allowAutoLogin: !!autoFeatures.allowAutoLogin,
        allowAutoGenerateImage: !!autoFeatures.allowAutoGenerateImage,
      };

      console.log("Saving chatbot settings:", updateData);
      console.log("Popup questions being sent:", formattedQuestions);

      // Make API call to save interface settings
      const response = await fetch(
        `https://90fd72f59232.ngrok-free.app/api/updateInterface/edit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify(updateData),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || errorData.message || "Failed to update settings",
        );
      }

      // Get the response data
      const data = await response.json();
      console.log("API response:", data);

      setToastMessage("Chatbot settings and auto features saved successfully!");
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
                    />

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
                    />

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

                    {/* Removed Multi-AI Review and Click Message fields */}
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* AI UI */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={SettingsIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        AI UI
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="400">
                    <LegacyStack vertical spacing="tight">
                      <Checkbox
                        label="Activate All"
                        helpText="Toggle both Voice and Text AI"
                        checked={showVoiceAI && showTextAI}
                        onChange={(checked) => {
                          setShowVoiceAI(checked);
                          setShowTextAI(checked);
                        }}
                      />
                      <Checkbox
                        label="Voice AI"
                        helpText="Enable voice-based assistant UI"
                        checked={showVoiceAI}
                        onChange={setShowVoiceAI}
                      />
                      <Checkbox
                        label="Text AI"
                        helpText="Enable text chat assistant UI"
                        checked={showTextAI}
                        onChange={setShowTextAI}
                      />
                    </LegacyStack>
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

                    {/* Popup questions list */}
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
                            />
                          </InlineStack>
                        ))
                      ) : (
                        <Text variant="bodySm" color="subdued">
                          No suggested questions added yet.
                        </Text>
                      )}
                    </BlockStack>

                    {/* Add new question */}
                    <InlineStack gap="200" align="start">
                      <div style={{ flexGrow: 1 }}>
                        <TextField
                          label="Add a suggested question"
                          value={newQuestion}
                          onChange={setNewQuestion}
                          autoComplete="off"
                          labelHidden
                          placeholder="Type a question customers might ask..."
                        />
                      </div>
                      <div style={{ marginTop: "4px" }}>
                        <Button onClick={handleAddQuestion} icon={PlusIcon}>
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

              {/* AI Auto Features Card */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={SettingsIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        AI Auto Features
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />

                  <BlockStack gap="400">
                    <Banner tone="warning">
                      Disabling these features may reduce the assistant's
                      effectiveness.
                    </Banner>

                    <LegacyStack vertical spacing="tight">
                      <Checkbox
                        label="Automatically redirect users to relevant pages"
                        checked={autoFeatures.allowAutoRedirect}
                        onChange={() => toggleAutoFeature("allowAutoRedirect")}
                      />
                      <Checkbox
                        label="Scroll to relevant sections on the page"
                        checked={autoFeatures.allowAutoScroll}
                        onChange={() => toggleAutoFeature("allowAutoScroll")}
                      />
                      <Checkbox
                        label="Highlight important elements on the page"
                        checked={autoFeatures.allowAutoHighlight}
                        onChange={() => toggleAutoFeature("allowAutoHighlight")}
                      />
                      <Checkbox
                        label="Click buttons and links on behalf of users"
                        checked={autoFeatures.allowAutoClick}
                        onChange={() => toggleAutoFeature("allowAutoClick")}
                      />
                      <Checkbox
                        label="Automatically fill forms for users"
                        checked={autoFeatures.allowAutoFillForm}
                        onChange={() => toggleAutoFeature("allowAutoFillForm")}
                      />
                    </LegacyStack>

                    <Divider />
                    <Text as="h4" variant="headingSm">
                      Order Features
                    </Text>
                    <LegacyStack vertical spacing="tight">
                      <Checkbox
                        label="Help users cancel orders"
                        checked={autoFeatures.allowAutoCancel}
                        onChange={() => toggleAutoFeature("allowAutoCancel")}
                      />
                      <Checkbox label="Help users return products" disabled />
                      <Checkbox label="Help users exchange products" disabled />
                      <Checkbox
                        label="Help users track their orders"
                        checked={autoFeatures.allowAutoTrackOrder}
                        onChange={() =>
                          toggleAutoFeature("allowAutoTrackOrder")
                        }
                      />
                      <Checkbox
                        label="Fetch and display user order history"
                        checked={autoFeatures.allowAutoGetUserOrders}
                        onChange={() =>
                          toggleAutoFeature("allowAutoGetUserOrders")
                        }
                      />
                    </LegacyStack>

                    <Divider />
                    <Text as="h4" variant="headingSm">
                      User Data Features
                    </Text>
                    <LegacyStack vertical spacing="tight">
                      <Checkbox
                        label="Help users update their account information"
                        checked={autoFeatures.allowAutoUpdateUserInfo}
                        onChange={() =>
                          toggleAutoFeature("allowAutoUpdateUserInfo")
                        }
                      />
                      <Checkbox
                        label="Help users log out"
                        checked={autoFeatures.allowAutoLogout}
                        onChange={() => toggleAutoFeature("allowAutoLogout")}
                      />
                      <Checkbox
                        label="Help users log in"
                        checked={autoFeatures.allowAutoLogin}
                        onChange={() => toggleAutoFeature("allowAutoLogin")}
                      />
                    </LegacyStack>

                    <Divider />
                    <Text as="h4" variant="headingSm">
                      Content Generation Features
                    </Text>
                    <LegacyStack vertical spacing="tight">
                      <Checkbox label="Generate images for users" disabled />
                    </LegacyStack>
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
                          onChange={(value) => {
                            setPrimaryColor(value);
                            const hex = hsbToHex(value);
                            setColorInput(hex);
                          }}
                          color={primaryColor}
                        />
                        <InlineStack gap="200">
                          <TextField
                            label="Color (Hex or RGB)"
                            value={colorInput}
                            onChange={(val) => {
                              setColorInput(val);
                              const hex = parseColorInputToHex(val);
                              if (hex) {
                                setPrimaryColor(hexToHsb(hex));
                              }
                            }}
                            autoComplete="off"
                            placeholder="#008060 or rgb(0,128,96) or 0,128,96"
                          />
                          <Box paddingInlineStart="200" paddingBlockStart="400">
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: "1px solid #E1E3E5",
                                background: hsbToHex(primaryColor),
                              }}
                              aria-label="Color preview"
                            />
                          </Box>
                        </InlineStack>
                        <Text variant="bodySm" as="p" color="subdued">
                          This color will be used for the chatbot button and
                          header
                        </Text>
                      </BlockStack>
                    </Box>

                    {/* Bot icon selection removed */}
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Bottom Navigation */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <InlineStack gap="200">
                      <Icon source={SettingsIcon} color="highlight" />
                      <Text as="h3" variant="headingMd">
                        Bottom Navigation
                      </Text>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="400">
                    <LegacyStack vertical spacing="tight">
                      <Checkbox
                        label="Home"
                        helpText="Shown in nav"
                        checked={showHome}
                        onChange={setShowHome}
                      />
                      <Checkbox
                        label="News"
                        helpText="Shown in nav"
                        checked={showNews}
                        onChange={setShowNews}
                      />
                      <Checkbox
                        label="Help"
                        helpText="Shown in nav"
                        checked={showHelp}
                        onChange={setShowHelp}
                      />
                    </LegacyStack>
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
