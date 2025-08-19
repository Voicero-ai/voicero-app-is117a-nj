import { useState, useEffect, useCallback } from "react";
import { useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  TextField,
  Banner,
  Link,
  InlineStack,
  Icon,
  Box,
  Divider,
  Spinner,
  Tabs,
  Badge,
  Select,
} from "@shopify/polaris";
import {
  KeyIcon,
  GlobeIcon,
  PageIcon,
  BlogIcon,
  ProductIcon,
  DiscountIcon,
  ChatIcon,
  RefreshIcon,
  SettingsIcon,
  ExternalIcon,
  ToggleOnIcon,
  ToggleOffIcon,
  QuestionCircleIcon,
  InfoIcon,
  CalendarIcon,
  DataPresentationIcon,
  CheckIcon,
  CollectionIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

// Add these constants at the top of the file after imports
const AVERAGE_TIMES = {
  products: 145, // 2:25
  pages: 100, // 1:40
  collections: 60, // 1:00
  discounts: 70, // 1:10
  posts: 90, // 1:30
  general: 90, // 1:30
};

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Get subscription status

  const response = await admin.graphql(`
    query {
      appInstallation {
        activeSubscriptions {
          id
          name
          status
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  const data = await response.json();

  const subscriptions = data.data.appInstallation.activeSubscriptions;
  const isPro = subscriptions.some(
    (sub) =>
      sub.status === "ACTIVE" &&
      sub.lineItems[0]?.plan?.pricingDetails?.price?.amount > 0,
  );

  // Get access key from metafields

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

  const savedKey = metafieldData.data.shop.metafield?.value;

  let isConnected = false;
  if (savedKey) {
    try {
      const trimmedKey = savedKey.trim();

      // Use production API URL
      const apiUrls = [
        `${urls.voiceroApi}/api/connect`, // Production URL
      ];

      let connected = false;
      let responseData = null;

      // Try each URL in sequence
      for (const apiUrl of apiUrls) {
        try {
          const testResponse = await fetch(apiUrl, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${trimmedKey}`,
            },
            mode: "cors",
          });

          const responseText = await testResponse.text();

          try {
            const parsedData = JSON.parse(responseText);

            // Only set isConnected to true if we have valid website data
            if (testResponse.ok && parsedData.website) {
              connected = true;
              responseData = parsedData;
              // Break loop on first successful connection
              break;
            }
          } catch (e) {
            console.error(
              `Error parsing connection test response from ${apiUrl}:`,
              e,
            );
          }
        } catch (fetchError) {
          console.error(`Fetch error for ${apiUrl}:`, fetchError);
          // Continue to next URL if this one fails
        }
      }

      isConnected = connected;
    } catch (error) {
      console.error("Error testing connection:", error);
      isConnected = false;
    }
  }

  return json({
    isPro,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    savedKey: isConnected ? savedKey : null,
  });
};

// Add helper function before the action handler
async function getShopId(admin) {
  try {
    const shopResponse = await admin.graphql(`
      query {
        shop {
          id
        }
      }
    `);
    const shopData = await shopResponse.json();
    return shopData.data.shop.id;
  } catch (error) {
    console.error("Error fetching shop ID:", error);
    throw error;
  }
}

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const accessKey = formData.get("accessKey");
  const action = formData.get("action");

  try {
    if (action === "quick_connect") {
      const shop = session.shop;
      const storeName = shop.split(".")[0];
      const appHandle = process.env.SHOPIFY_APP_HANDLE || "voicero-app-shop";
      const site_url = encodeURIComponent(`https://${shop}`);

      // Get the current app URL from the request headers
      const host = request.headers.get("host");
      const protocol = request.headers.get("x-forwarded-proto") || "https";
      const appUrl = `${protocol}://${host}`;

      // Use the current app URL for admin_url instead of hardcoded domain
      const admin_url = encodeURIComponent(
        `https://admin.shopify.com/store/${storeName}/apps/${appHandle}/app`,
      );

      // Use the current app URL for callback
      const callbackUrl = encodeURIComponent(
        `${appUrl}/api/quickConnectCallback`,
      );

      return {
        success: true,
        redirectUrl: `${urls.voiceroApi}/app/connect?site_url=${site_url}&redirect_url=${admin_url}&callback_url=${callbackUrl}&type=Shopify`,
      };
    } else if (action === "quick_connect_callback") {
      // This is called when the quick connect flow completes

      try {
        const incomingKey = formData.get("access_key");
        if (!incomingKey) {
          console.error("No access key provided in callback");
          throw new Error(
            "No access key was provided from the quick connect flow",
          );
        }

        // First, check if there's an existing key we need to delete

        const metafieldResponse = await admin.graphql(`
          query {
            shop {
              metafield(namespace: "voicero", key: "access_key") {
                id
                value
              }
            }
          }
        `);

        const metafieldData = await metafieldResponse.json();

        // If there's an existing metafield with a key, delete it first
        if (metafieldData.data?.shop?.metafield?.id) {
          const metafieldId = metafieldData.data.shop.metafield.id;

          const deleteResponse = await admin.graphql(`
            mutation {
              metafieldDelete(input: {
                id: "${metafieldId}"
              }) {
                deletedId
                userErrors {
                  field
                  message
                }
              }
            }
          `);

          const deleteResult = await deleteResponse.json();

          if (deleteResult.data?.metafieldDelete?.userErrors?.length > 0) {
            console.warn(
              "Warning: Issues deleting old key:",
              deleteResult.data.metafieldDelete.userErrors,
            );
          }
        }

        // Now save the new key
        const shopId = await getShopId(admin);

        const saveResponse = await admin.graphql(
          `
          mutation CreateMetafield($input: MetafieldsSetInput!) {
            metafieldsSet(metafields: [$input]) {
              metafields {
                id
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              input: {
                namespace: "voicero",
                key: "access_key",
                type: "single_line_text_field",
                value: incomingKey,
                ownerId: shopId,
              },
            },
          },
        );

        const saveResult = await saveResponse.json();

        if (saveResult.data?.metafieldsSet?.userErrors?.length > 0) {
          console.error(
            "Save key errors:",
            saveResult.data.metafieldsSet.userErrors,
          );
          throw new Error("Failed to save access key from quick connect flow");
        }

        // Now try to connect with the key
        return {
          success: true,
          message: "Successfully saved access key from quick connect flow",
          accessKey: incomingKey,
          shouldConnect: true,
        };
      } catch (error) {
        console.error("Quick connect callback error:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    } else if (action === "manual_connect") {
      try {
        const trimmedKey = accessKey?.trim();

        if (!trimmedKey) {
          console.error("No access key provided");
          throw new Error("No access key provided");
        }

        const headers = new Headers();
        headers.append("Accept", "application/json");
        headers.append("Authorization", `Bearer ${trimmedKey}`);

        // Try various URLs for connection
        const apiUrls = [
          `${urls.voiceroApi}/api/connect`,
          `${urls.voiceroApi}/api/connect`,
        ];

        let connectionSuccessful = false;
        let connectionResponse = null;
        let connectionData = null;
        let connectionError = null;

        // Try each URL until one succeeds
        for (const apiUrl of apiUrls) {
          try {
            const response = await fetch(apiUrl, {
              method: "GET",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${trimmedKey}`,
              },
              mode: "cors",
            });

            const responseText = await response.text();

            try {
              const data = JSON.parse(responseText);
              console.log("data", data);

              if (response.ok && data.website) {
                connectionSuccessful = true;
                connectionResponse = response;
                connectionData = data;

                break;
              } else {
                connectionError = data.error || "Connection failed";
              }
            } catch (parseError) {
              console.error(
                `Error parsing response from ${apiUrl}:`,
                parseError,
              );
              connectionError = "Invalid response format";
            }
          } catch (fetchError) {
            console.error(`Fetch error for ${apiUrl}:`, fetchError);
            connectionError = fetchError.message;
          }
        }

        if (!connectionSuccessful) {
          console.error(
            "All connection attempts failed. Last error:",
            connectionError,
          );
          throw new Error(
            connectionError ||
              "Connection failed. Please check your access key.",
          );
        }

        // We have a successful connection at this point
        const data = connectionData;

        // Update theme settings directly using the admin API

        const shopResponse = await admin.graphql(`
          query {
            shop {
              id
            }
          }
        `);

        const shopData = await shopResponse.json();

        const shopId = shopData.data.shop.id;

        const metafieldResponse = await admin.graphql(
          `
          mutation CreateMetafield($input: MetafieldsSetInput!) {
            metafieldsSet(metafields: [$input]) {
              metafields {
                id
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              input: {
                namespace: "voicero",
                key: "access_key",
                type: "single_line_text_field",
                value: accessKey,
                ownerId: shopId,
              },
            },
          },
        );

        const metafieldData = await metafieldResponse.json();

        if (metafieldData.data?.metafieldsSet?.userErrors?.length > 0) {
          console.error(
            "Metafield errors:",
            metafieldData.data.metafieldsSet.userErrors,
          );
          throw new Error("Failed to save access key to store");
        }

        return {
          success: true,
          accessKey: accessKey,
          message: `Successfully connected to ${data.website?.name || "website"}!`,
          websiteData: data.website,
          namespace: data.website?.VectorDbConfig?.namespace || data.namespace,
        };
      } catch (error) {
        console.error("Manual connect error:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  } catch (error) {
    console.error("Action handler error:", error);
    let errorMessage = error.message;

    if (error.response) {
      try {
        const errorData = await error.response.json();
        console.error("Error response data:", errorData);
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        console.error("Failed to parse error response:", e);
        // If we can't parse the error response, stick with the original message
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

// Add these helper functions
async function getActiveThemeId(admin) {
  const response = await admin.graphql(`
    query {
      themes(first: 10) {
        nodes {
          id
          role
          name
        }
      }
    }
  `);
  const data = await response.json();

  // Find the main theme
  const mainTheme = data.data.themes.nodes.find(
    (theme) => theme.role === "MAIN",
  );

  if (!mainTheme) {
    // If no MAIN theme, try to find a PUBLISHED theme
    const publishedTheme = data.data.themes.nodes.find(
      (theme) => theme.role === "PUBLISHED",
    );
    return publishedTheme?.id;
  }

  return mainTheme?.id;
}

async function updateThemeSettings(admin, themeId, accessKey) {
  if (!themeId) {
    return;
  }

  try {
    const themeIdNumber = themeId.split("/").pop();

    // Use standard REST API format
    const response = await admin.rest.get({
      path: `/themes/${themeIdNumber}/assets.json`,
    });

    let settingsData = {
      current: {
        "voicero-assistant": {
          access_key: accessKey,
        },
      },
    };

    try {
      // Get existing settings
      const settingsAsset = await admin.rest.get({
        path: `/themes/${themeIdNumber}/assets.json`,
        query: { "asset[key]": "config/settings_data.json" },
      });

      if (settingsAsset?.body?.asset?.value) {
        const currentSettings = JSON.parse(settingsAsset.body.asset.value);
        settingsData = {
          ...currentSettings,
          current: {
            ...currentSettings.current,
            "voicero-assistant": {
              access_key: accessKey,
            },
          },
        };
      }
    } catch (e) {
      // Handle error silently
    }

    // Update settings_data.json
    const updateResponse = await admin.rest.put({
      path: `/themes/${themeIdNumber}/assets.json`,
      data: {
        asset: {
          key: "config/settings_data.json",
          value: JSON.stringify(settingsData, null, 2),
        },
      },
    });

    if (updateResponse?.body?.asset) {
      // Successfully updated theme settings
    } else {
      throw new Error("Failed to update theme settings");
    }
  } catch (error) {
    // Handle error silently
  }
}

// Simplified training process replaced with timer
const simulateTrainingProcess = async (
  accessKey,
  untrainedItems,
  setUntrainedItems,
  websiteData,
  setItemsInTraining = () => {},
) => {
  try {
    // Initialize itemsInTraining with all items to show progress UI
    setItemsInTraining({
      products: [...(untrainedItems.products || [])],
      pages: [...(untrainedItems.pages || [])],
      posts: [...(untrainedItems.posts || [])],
      collections: [...(untrainedItems.collections || [])],
      discounts: [...(untrainedItems.discounts || [])],
    });

    console.log("Training process simulation started");

    // Wait for 30 seconds to simulate training time
    await new Promise((resolve) => setTimeout(resolve, 30000));

    // Clear all untrained items and items in training since training is complete
    setUntrainedItems({
      products: [],
      pages: [],
      posts: [],
      collections: [],
      discounts: [],
    });

    setItemsInTraining({
      products: [],
      pages: [],
      posts: [],
      collections: [],
      discounts: [],
    });

    console.log("Training process simulation complete");
  } catch (error) {
    console.error("Error during training simulation:", error);
    throw error;
  }
};

// Helper to calculate total items
const calculateTotalItems = (data) => {
  if (!data) return 0;
  const counts = {
    products: data.products?.length || 0,
    pages: data.pages?.length || 0,
    posts: data.posts?.length || 0,
    collections: data.collections?.length || 0,
    discounts: data.discounts?.length || 0,
  };
  return Object.values(counts).reduce((a, b) => a + b, 0);
};

// Helper to calculate untrained items
const calculateUntrainedItems = (data) => {
  if (!data) return 0;
  let untrainedCount = 0;

  // Count untrained items in each category
  Object.values(data).forEach((category) => {
    if (Array.isArray(category)) {
      untrainedCount += category.filter(
        (item) => !item.trained && !item.isTraining,
      ).length;
    }
  });

  return untrainedCount;
};

// Add this helper function
const calculateEstimatedTime = (untrainedItems, currentCategory) => {
  // Get counts of untrained items for each category
  const counts = {
    products: untrainedItems.products?.length || 0,
    pages: untrainedItems.pages?.length || 0,
    posts: untrainedItems.posts?.length || 0,
    collections: untrainedItems.collections?.length || 0,
    discounts: untrainedItems.discounts?.length || 0,
  };

  // Calculate total items
  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);

  // If no items, return 0
  if (totalItems === 0) return 0;

  // Find the category with the most items
  let maxItems = 0;
  let maxCategory = null;
  Object.entries(counts).forEach(([category, count]) => {
    if (count > maxItems) {
      maxItems = count;
      maxCategory = category;
    }
  });

  // Get the time for the category with most items
  let baseTime = AVERAGE_TIMES[maxCategory];

  // If we have more than one category with items, add the time for the second largest category
  const categoriesWithItems = Object.entries(counts)
    .filter(([_, count]) => count > 0)
    .sort(([_, a], [__, b]) => b - a);

  if (categoriesWithItems.length > 1) {
    const secondLargestCategory = categoriesWithItems[1][0];
    baseTime += AVERAGE_TIMES[secondLargestCategory];
  }

  // Add general training time if we have any items
  if (totalItems > 0) {
    baseTime += AVERAGE_TIMES.general;
  }

  return baseTime;
};

// Add this helper function
const formatTimeRemaining = (seconds) => {
  // If seconds is 0 or negative, return "Calculating..."
  if (seconds <= 0) return "Calculating...";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds} seconds`;
  } else if (minutes === 1) {
    return `${minutes} minute ${remainingSeconds} seconds`;
  } else {
    return `${minutes} minutes ${remainingSeconds} seconds`;
  }
};

export default function Index() {
  const { savedKey } = useLoaderData();
  const navigate = useNavigate();

  // Group all state declarations together at the top
  const [accessKey, setAccessKey] = useState(savedKey || "");
  const [untrainedItems, setUntrainedItems] = useState({
    products: [],
    pages: [],
    posts: [],
    collections: [],
    discounts: [],
  });
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [namespace, setNamespace] = useState(null);
  const [itemsInTraining, setItemsInTraining] = useState({
    products: [],
    pages: [],
    posts: [],
    collections: [],
    discounts: [],
  });
  const [extendedWebsiteData, setExtendedWebsiteData] = useState(null);
  const [isLoadingExtendedData, setIsLoadingExtendedData] = useState(false);
  const [selectedContentTab, setSelectedContentTab] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [syncStatusText, setSyncStatusText] = useState("");
  const [showActivationGuide, setShowActivationGuide] = useState(false);
  // Action details UI state
  const [selectedActionType, setSelectedActionType] = useState(null); // 'redirect' | 'purchase' | 'click' | 'scroll'
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(null);
  const [textEnabled, setTextEnabled] = useState(null);
  useEffect(() => {
    // Reset selected thread whenever action type changes
    // This ensures that when switching between action types,
    // we don't show threads from the previous action type
    if (selectedActionType !== null) {
      setSelectedThreadId(null);
    }
  }, [selectedActionType]);

  // Sync feature flags from latest data
  useEffect(() => {
    const src = extendedWebsiteData || fetcher.data?.websiteData;
    if (src) {
      if (typeof src.showVoiceAI !== "undefined") {
        setVoiceEnabled(Boolean(src.showVoiceAI));
      }
      if (typeof src.showTextAI !== "undefined") {
        setTextEnabled(Boolean(src.showTextAI));
      }
    }
  }, [extendedWebsiteData, fetcher.data]);

  // Helpers for action details
  const parseActionPayload = useCallback((content) => {
    try {
      if (typeof content !== "string") return null;
      const trimmed = content.trim();
      if (!trimmed.startsWith("{")) return null;
      const parsed = JSON.parse(trimmed);
      const action = (parsed.action || "").toString().toLowerCase();
      if (!action) return null;
      return {
        answer: parsed.answer,
        action,
        context: parsed.action_context || {},
      };
    } catch {
      return null;
    }
  }, []);

  const getThreadsForAction = useCallback(
    (actionType) => {
      if (!extendedWebsiteData || !actionType) {
        console.log("getThreadsForAction: No data or actionType", {
          extendedWebsiteData: !!extendedWebsiteData,
          actionType,
        });
        return [];
      }

      console.log("getThreadsForAction called with actionType:", actionType);

      const details = extendedWebsiteData.actionDetails || {};
      const fromDetails = Array.isArray(details[actionType])
        ? details[actionType]
        : [];

      console.log(
        "Raw details for",
        actionType,
        ":",
        fromDetails.length,
        "threads",
      );

      let threads = fromDetails;

      // Always filter threads to ensure they contain the correct action type
      if (threads.length) {
        const beforeFilter = threads.length;
        threads = threads.filter((t) => {
          // Thread must have messages
          if (!Array.isArray(t.messages) || t.messages.length === 0) {
            return false;
          }

          // Thread must contain at least one message with the matching action type
          const hasMatchingAction = t.messages.some((m) => {
            const payload = parseActionPayload(m.content);
            if (!payload) return false;
            const a = payload.action;
            if (actionType === "purchase") {
              return (
                a === "purchase" || a === "add_to_cart" || a === "add to cart"
              );
            }
            if (actionType === "add_to_cart" || actionType === "add to cart") {
              return (
                a === "purchase" || a === "add_to_cart" || a === "add to cart"
              );
            }
            return a === actionType;
          });

          if (!hasMatchingAction) {
            // Log threads that don't match to debug
            const threadActions = t.messages
              .map((m) => {
                const payload = parseActionPayload(m.content);
                return payload ? payload.action : "no-action";
              })
              .filter((a) => a !== "no-action");
            console.log(
              "Filtered out thread with actions:",
              threadActions,
              "looking for:",
              actionType,
            );
          }

          return hasMatchingAction;
        });

        console.log(
          "After filtering actionDetails:",
          beforeFilter,
          "->",
          threads.length,
          "threads for",
          actionType,
        );
      }

      // Fallback to actionConversations if details are empty
      if (!threads.length && extendedWebsiteData.actionConversations) {
        console.log("Falling back to actionConversations for", actionType);
        const conv = extendedWebsiteData.actionConversations[actionType] || [];
        console.log(
          "Raw actionConversations for",
          actionType,
          ":",
          conv.length,
          "threads",
        );

        // Always filter by messages containing the action - don't allow threads without messages
        const filtered = conv.filter((t) => {
          if (!Array.isArray(t.messages) || t.messages.length === 0) {
            return false;
          }

          const hasMatchingAction = t.messages.some((m) => {
            const payload = parseActionPayload(m.content);
            return payload && payload.action === actionType;
          });

          if (!hasMatchingAction) {
            // Log threads that don't match to debug
            const threadActions = t.messages
              .map((m) => {
                const payload = parseActionPayload(m.content);
                return payload ? payload.action : "no-action";
              })
              .filter((a) => a !== "no-action");
            console.log(
              "Filtered out conversation thread with actions:",
              threadActions,
              "looking for:",
              actionType,
            );
          }

          return hasMatchingAction;
        });

        console.log(
          "After filtering actionConversations:",
          conv.length,
          "->",
          filtered.length,
          "threads for",
          actionType,
        );

        // Deduplicate threads in fallback as well
        const uniqueFiltered = filtered.reduce((unique, thread) => {
          const id = thread.threadId || thread.messageId;
          if (!unique.find((t) => (t.threadId || t.messageId) === id)) {
            unique.push(thread);
          }
          return unique;
        }, []);

        console.log(
          "After deduplication (fallback):",
          filtered.length,
          "->",
          uniqueFiltered.length,
          "threads for",
          actionType,
        );
        return uniqueFiltered;
      }

      // Deduplicate threads by threadId or messageId to avoid showing the same thread multiple times
      const uniqueThreads = threads.reduce((unique, thread) => {
        const id = thread.threadId || thread.messageId;
        if (!unique.find((t) => (t.threadId || t.messageId) === id)) {
          unique.push(thread);
        }
        return unique;
      }, []);

      console.log(
        "After deduplication:",
        threads.length,
        "->",
        uniqueThreads.length,
        "threads for",
        actionType,
      );
      return uniqueThreads;
    },
    [extendedWebsiteData, parseActionPayload],
  );

  // State for UI and data
  const fetcher = useFetcher();
  const app = useAppBridge();
  const isLoading = fetcher.state === "submitting";

  // Add function to fetch extended website data
  const fetchExtendedWebsiteData = async () => {
    try {
      // Check if there's an active plan first
      if (!fetcher.data?.websiteData?.plan) {
        setError(
          <Banner status="warning" onDismiss={() => setError("")}>
            <p>
              You need an active plan to refresh data. Please upgrade to
              continue.
            </p>
          </Banner>,
        );
        return;
      }

      setIsLoadingExtendedData(true);

      // Client-side cache in sessionStorage for 1 hour
      const CACHE_KEY = "voicero:website:get";
      const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
      const now = Date.now();

      try {
        const cachedRaw = sessionStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached.expiresAt && now < cached.expiresAt && cached.data) {
            setExtendedWebsiteData(cached.data);
            setIsLoadingExtendedData(false);
            // Background refresh; when it completes, update UI and cache
            fetch("/api/website/get?bypassCache=true")
              .then((r) => r.json())
              .then((d) => {
                if (d?.success && d.websiteData) {
                  setExtendedWebsiteData(d.websiteData);
                  try {
                    sessionStorage.setItem(
                      CACHE_KEY,
                      JSON.stringify({
                        data: d.websiteData,
                        expiresAt: Date.now() + CACHE_TTL_MS,
                      }),
                    );
                  } catch {}
                }
              })
              .catch(() => {});
            return;
          }
        }
      } catch {}

      const response = await fetch("/api/website/get");
      const data = await response.json();
      console.log("websites/get data: ", data);

      if (data.success && data.websiteData) {
        setExtendedWebsiteData(data.websiteData);
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              data: data.websiteData,
              expiresAt: now + CACHE_TTL_MS,
            }),
          );
        } catch {}
      } else {
        console.error("Failed to fetch extended website data:", data.error);
      }
    } catch (error) {
      console.error("Error fetching extended website data:", error);
    } finally {
      setIsLoadingExtendedData(false);
    }
  };

  // Use effect to fetch extended data when we have an access key and valid website data
  useEffect(() => {
    if (
      accessKey &&
      fetcher.data?.success &&
      fetcher.data?.websiteData &&
      fetcher.data?.websiteData?.plan
    ) {
      fetchExtendedWebsiteData();
    }
  }, [accessKey, fetcher.data?.success]);

  // Helper to get training progress
  const getTrainingProgress = useCallback(() => {
    // If we have training data with a progress value, use it
    if (fetcher.data?.progress) {
      const progressValue = parseInt(fetcher.data.progress);
      if (!isNaN(progressValue)) {
        return progressValue;
      }
    }

    // Calculate progress based on total items and remaining untrained items
    let totalItemCount = 0;
    let remainingItemCount = 0;

    // Count total items (across all categories)
    Object.values(untrainedItems).forEach((items) => {
      if (Array.isArray(items)) {
        remainingItemCount += items.length;
      }
    });

    Object.values(itemsInTraining).forEach((items) => {
      if (Array.isArray(items)) {
        totalItemCount += items.length;
      }
    });

    // Add remaining items to total count
    totalItemCount += remainingItemCount;

    if (totalItemCount === 0) return 0;

    // Calculate completed items
    const completedItems = totalItemCount - remainingItemCount;

    // Calculate progress percentage
    const progress = Math.round((completedItems / totalItemCount) * 100);

    // Ensure progress is between 0 and 100
    return Math.min(Math.max(progress, 0), 100);
  }, [fetcher.data, untrainedItems, itemsInTraining]);

  // Add useEffect to update time remaining
  useEffect(() => {
    if (fetcher.data?.status === "processing") {
      // Calculate initial remaining time
      let remainingTime = calculateEstimatedTime(
        untrainedItems,
        fetcher.data.currentCategory,
      );

      // Set initial time remaining
      setTimeRemaining(remainingTime);

      // Only start the countdown if we have a valid remaining time
      if (remainingTime > 0) {
        const updateTime = () => {
          setTimeRemaining((prevTime) => {
            if (prevTime <= 0) return 0;
            return prevTime - 1;
          });
        };

        // Update every second
        const interval = setInterval(updateTime, 1000);

        return () => clearInterval(interval);
      }
    } else {
      // Reset time remaining when not processing
      setTimeRemaining(0);
    }
  }, [fetcher.data?.status, fetcher.data?.currentCategory, untrainedItems]);

  // Check for access_key in URL
  useEffect(() => {
    const url = new URL(window.location.href);
    const accessKeyParam = url.searchParams.get("access_key");

    if (accessKeyParam) {
      // Clean up the URL by removing the access_key parameter
      url.searchParams.delete("access_key");
      window.history.replaceState({}, document.title, url.toString());

      // Set the access key from the URL param
      setAccessKey(accessKeyParam);
    }
  }, []);

  // Get API key from saved key (from loader data)
  const apiKey = savedKey;

  // Static helper metrics and datasets (placeholder until wired to backend)
  const formatCurrency = (amount, currency = "USD") =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount || 0);

  // Removed static demo datasets; replaced by extendedWebsiteData.aiOverview

  // Modify the useEffect that handles successful connection
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data.accessKey) {
      setAccessKey(fetcher.data.accessKey);

      // Check if we got a response with namespace data
      if (fetcher.data?.namespace) {
        setNamespace(fetcher.data.namespace);
      }
      // Check if we have namespace in VectorDbConfig
      else if (fetcher.data?.websiteData?.VectorDbConfig?.namespace) {
        const websiteNamespace =
          fetcher.data?.websiteData?.VectorDbConfig?.namespace;

        setNamespace(websiteNamespace);
      }
    }
  }, [fetcher.data]);

  // Auto-connect when we have an access key
  useEffect(() => {
    if (accessKey && !fetcher.data?.success) {
      // Only connect if we haven't already

      setIsDataLoading(true);
      fetcher.submit(
        { accessKey, action: "manual_connect" },
        { method: "POST" },
      );
    }
  }, [accessKey]);

  // Reset data loading state when we get data back from fetcher
  useEffect(() => {
    if (fetcher.data) {
      setIsDataLoading(false);
      setIsConnecting(false);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (fetcher.data?.redirectUrl) {
      const newWindow = window.open("");
      if (newWindow) {
        newWindow.opener = null;
        newWindow.location = fetcher.data.redirectUrl;
      }
    }
  }, [fetcher.data]);

  const handleManualConnect = async () => {
    if (!accessKey) {
      setError("Please enter an access key");
      return;
    }

    setError("");
    setIsConnecting(true);

    try {
      // First, check if there's an existing key we need to delete

      const existingKeyResponse = await fetch("/api/accessKey", {
        method: "GET",
      });
      const existingKeyData = await existingKeyResponse.json();

      // If there's an existing key, delete it first
      if (existingKeyData.success && existingKeyData.accessKey) {
        const deleteResponse = await fetch("/api/accessKey", {
          method: "DELETE",
        });
        const deleteResult = await deleteResponse.json();
      }

      // Now set the new key

      const saveResponse = await fetch("/api/accessKey", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessKey: accessKey,
        }),
      });
      const saveResult = await saveResponse.json();

      if (!saveResult.success) {
        throw new Error(`Failed to save access key: ${saveResult.message}`);
      }

      // Now connect with the new key

      fetcher.submit(
        {
          accessKey,
          action: "manual_connect",
        },
        { method: "POST" },
      );
    } catch (error) {
      console.error("Error updating access key:", error);
      setError(`Failed to update access key: ${error.message}`);
      setIsConnecting(false);
    }
  };

  const handleQuickConnect = () => {
    fetcher.submit({ action: "quick_connect" }, { method: "POST" });
  };

  const handleDisconnect = () => {
    try {
      // Reset all state
      setAccessKey("");
      setNamespace(null);

      // Clear any in-memory data
      if (fetcher) {
        if (fetcher.data) fetcher.data = null;

        // Submit the disconnect action to the server
        fetcher.submit({ action: "disconnect" }, { method: "POST" });

        // Navigate to home page after sufficient delay to allow server to process
        setTimeout(() => {
          // Use absolute path to ensure we get a full page load
          window.location.href = "/app";
        }, 2000); // 2-second delay to allow server processing
      }
    } catch (error) {
      // Even if there's an error, try to reload
      window.location.href = "/app";
    }
  };

  const handleSync = async () => {
    try {
      // Check if there's an active plan first
      if (!fetcher.data?.websiteData?.plan) {
        setError(
          <Banner status="warning" onDismiss={() => setError("")}>
            <p>
              You need an active plan to sync content. Please upgrade to
              continue.
            </p>
          </Banner>,
        );
        return;
      }

      setIsSyncing(true);
      setSyncStatusText("Syncing content... Please wait.");
      setError("");

      // Step 1: Initial sync
      const syncInitResponse = await fetch("/api/sync", {
        method: "GET",
      });

      const responseText = await syncInitResponse.text();

      let data;
      try {
        data = JSON.parse(responseText);
        console.log("Sync API Response:", data);
        console.log("Pages data from sync:", data.pages);
        const policyPages = data.pages.filter((page) => page.isPolicy);
        console.log("Policy pages from sync:", policyPages);
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }

      if (!syncInitResponse.ok) {
        console.error("Initial sync failed:", syncInitResponse.status);
        throw new Error(
          `HTTP error! status: ${syncInitResponse.status}, details: ${
            data.details || "unknown error"
          }${
            data.graphQLErrors
              ? `, GraphQL errors: ${JSON.stringify(data.graphQLErrors)}`
              : ""
          }`,
        );
      }

      // Step 2: Send data to backend
      const syncResponse = await fetch(
        `https://train.voicero.ai/api/shopify/sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify({
            fullSync: true,
            data: data,
          }),
        },
      );

      if (!syncResponse.ok) {
        const errorData = await syncResponse.json();
        console.error("Backend sync error:", errorData);
        throw new Error(
          `Sync error! status: ${syncResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      // Step 3: Create or get assistant first
      setLoadingText("Setting up your AI assistant...");
      setSyncStatusText("Setting up your AI assistant...");
      const assistantResponse = await fetch(
        `${urls.voiceroApi}/api/shopify/assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
        },
      );

      if (!assistantResponse.ok) {
        const errorData = await assistantResponse.json();
        console.error("Assistant setup error:", errorData);
        throw new Error(
          `Assistant setup error! status: ${assistantResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      const assistantData = await assistantResponse.json();

      // Get website ID from the assistant response
      const websiteId = assistantData.websiteId;
      if (!websiteId) {
        throw new Error("No website ID found in assistant response");
      }

      // Step 4: Start vectorization (fire and forget)
      setLoadingText(
        "Vectorizing your store content... This may take a few minutes.",
      );
      setSyncStatusText(
        "Vectorizing your store content... This may take a few minutes.",
      );

      // Fire and forget approach - don't wait for completion
      fetch(`https://train.voicero.ai/api/shopify/vectorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
      }).catch((error) => {
        console.error("Vectorization request error:", error);
        // Continue with the process even if there's an error
      });

      // Don't wait for response - proceed directly
      setLoadingText("Vectorization in progress! Proceeding with next steps.");
      setSyncStatusText(
        "Vectorization in progress! Proceeding with next steps.",
      );

      // Step 5: Simulate training process with a 30-second timer
      setIsTraining(true);
      setLoadingText("Processing content... This may take a few minutes.");
      setSyncStatusText("Processing content... This may take a few minutes.");

      // Use the simulated training approach
      await simulateTrainingProcess(
        accessKey,
        assistantData.content,
        setUntrainedItems,
        assistantData.website,
        setItemsInTraining,
      );

      setLoadingText(
        "Training complete! Please refresh the page to see your changes.",
      );
      setSyncStatusText(
        "Training complete! Please refresh the page to see your changes.",
      );
      setIsSuccess(true);

      // Set syncing to false after a delay to ensure notifications are shown
      setTimeout(() => {
        setIsSyncing(false);
      }, 2000);

      // Create a banner with refresh instructions
      setError(
        <Banner status="success" onDismiss={() => setError("")}>
          <p>
            Training complete!{" "}
            <Button onClick={() => window.location.reload()} primary>
              Refresh Page
            </Button>{" "}
            to see your changes.
          </p>
        </Banner>,
      );

      // Show a full-page refresh notification overlay
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="refresh-overlay" style="
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.7);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            background-color: white;
            border-radius: 8px;
            padding: 32px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          ">
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 16px;">Training Complete!</div>
            <p style="font-size: 16px; margin-bottom: 24px;">Please refresh the page to see your updated content and AI assistant.</p>
            <button id="refresh-button" style="
              background-color: #008060;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 4px;
              font-size: 16px;
              font-weight: bold;
              cursor: pointer;
            ">Refresh Page</button>
          </div>
        </div>`,
      );

      // Add event listener to refresh button
      document
        .getElementById("refresh-button")
        .addEventListener("click", () => {
          window.location.reload();
        });
    } catch (error) {
      console.error("Sync process failed:", error);
      setError(
        <Banner status="critical" onDismiss={() => setError("")}>
          <p>Failed to sync content: {error.message}</p>
        </Banner>,
      );
      setSyncStatusText("");
      setIsSyncing(false);
    }
  };

  const handleToggleAI = async (feature, nextEnabled) => {
    try {
      // Optimistic UI update
      if (feature === "voice") setVoiceEnabled(nextEnabled);
      if (feature === "text") setTextEnabled(nextEnabled);

      const res = await fetch("/api/toggle-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, enabled: nextEnabled }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to toggle feature");
      }

      // Update extendedWebsiteData and client cache to reflect override
      setExtendedWebsiteData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...(feature === "voice"
            ? { showVoiceAI: nextEnabled }
            : { showTextAI: nextEnabled }),
        };
      });

      try {
        const CACHE_KEY = "voicero:website:get";
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.data) {
            parsed.data = {
              ...parsed.data,
              ...(feature === "voice"
                ? { showVoiceAI: nextEnabled }
                : { showTextAI: nextEnabled }),
            };
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
          }
        }
      } catch {}
    } catch (err) {
      // Revert optimistic update on failure
      if (feature === "voice") setVoiceEnabled(!nextEnabled);
      if (feature === "text") setTextEnabled(!nextEnabled);
      setError(
        <Banner status="critical" onDismiss={() => setError("")}>
          <p>{err.message || "Failed to toggle feature"}</p>
        </Banner>,
      );
    }
  };

  // Helper to get formatted training status message
  const getTrainingStatusMessage = useCallback(() => {
    if (!fetcher.data) return "No training data available";

    // If there's a message, use it
    if (fetcher.data.message) {
      return fetcher.data.message;
    }

    const { status, steps, currentCategory, categories } = fetcher.data;

    if (
      status === "complete" ||
      status === "done" ||
      status === "success" ||
      status === "finished"
    ) {
      // Show refresh notification if status is complete
      setTimeout(() => {
        // Create a banner with refresh instructions if it doesn't exist
        if (!document.getElementById("refresh-overlay")) {
          document.body.insertAdjacentHTML(
            "beforeend",
            `<div id="refresh-overlay" style="
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background-color: rgba(0, 0, 0, 0.7);
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <div style="
                background-color: white;
                border-radius: 8px;
                padding: 32px;
                max-width: 500px;
                text-align: center;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
              ">
                <div style="font-size: 24px; font-weight: bold; margin-bottom: 16px;">Training Complete!</div>
                <p style="font-size: 16px; margin-bottom: 24px;">Please refresh the page to see your updated content and AI assistant.</p>
                <button id="refresh-button-status" style="
                  background-color: #008060;
                  color: white;
                  border: none;
                  padding: 12px 24px;
                  border-radius: 4px;
                  font-size: 16px;
                  font-weight: bold;
                  cursor: pointer;
                ">Refresh Page</button>
              </div>
            </div>`,
          );

          // Add event listener
          document
            .getElementById("refresh-button-status")
            .addEventListener("click", () => {
              window.location.reload();
            });
        }
      }, 1000);

      return "Training process complete! Please refresh the page to see your changes.";
    }

    if (!steps || !steps.length) {
      // Calculate remaining items across all categories
      let remainingCount = 0;
      Object.values(untrainedItems).forEach((items) => {
        if (Array.isArray(items)) {
          remainingCount += items.length;
        }
      });

      if (remainingCount > 0) {
        // Format item breakdown by category if available
        let categoryBreakdown = "";
        const categoryNames = {
          products: "products",
          pages: "pages",
          posts: "posts",
          collections: "collections",
          discounts: "discounts",
        };

        const nonEmptyCategories = Object.entries(untrainedItems)
          .filter(([_, items]) => Array.isArray(items) && items.length > 0)
          .map(
            ([category, items]) => `${items.length} ${categoryNames[category]}`,
          );

        if (nonEmptyCategories.length > 0) {
          categoryBreakdown = ` (${nonEmptyCategories.join(", ")})`;
        }

        return `Processing items in batches of 10... ${remainingCount} items remaining${categoryBreakdown}.`;
      }

      return "Training in progress...";
    }

    // Get the latest step message
    const latestStep = steps[steps.length - 1];

    // Format a more descriptive message
    let progressMessage = latestStep.message;

    // Add category progress if available
    if (currentCategory !== undefined && categories && categories.length) {
      progressMessage += ` (${currentCategory + 1}/${categories.length} categories)`;
    }

    return progressMessage;
  }, [fetcher.data, untrainedItems]);

  const handleViewStatus = async () => {
    try {
      setIsDataLoading(true);
      setError("");

      // Check if we have the namespace

      if (!namespace) {
        setError("No namespace found. Please connect to your website first.");
        setIsDataLoading(false);
        return;
      }

      // Show current data in a banner if we have it
      if (fetcher.data) {
        // Display status in a banner
        setError(
          <Banner status="info" onDismiss={() => setError("")}>
            <p>Assistant Status:</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(fetcher.data, null, 2)}
            </pre>
          </Banner>,
        );
      } else {
        setError(
          <Banner status="info" onDismiss={() => setError("")}>
            <p>Checking status... Results will appear in 1-2 seconds.</p>
          </Banner>,
        );
      }
    } catch (error) {
      console.error("Error checking status:", error);
      setError(`Error checking status: ${error.message}`);
    } finally {
      setIsDataLoading(false);
    }
  };

  return (
    <Page>
      {/* Training Status Banner */}
      {fetcher.data?.status === "processing" && (
        <Box paddingBlockEnd="400">
          <div
            style={{
              backgroundColor: "#EBF5FF",
              borderRadius: "12px",
              padding: "20px",
              border: "1px solid #E1E8F0",
            }}
          >
            <BlockStack gap="400">
              <InlineStack align="space-between" wrap={false}>
                <InlineStack align="center" gap="300">
                  <Spinner size="small" />
                  <Text variant="headingMd" fontWeight="semibold">
                    AI Assistant Training in Progress
                  </Text>
                </InlineStack>
                <div
                  style={{
                    backgroundColor: "#2C5ECF",
                    color: "white",
                    padding: "4px 12px",
                    borderRadius: "20px",
                    fontSize: "13px",
                    fontWeight: "600",
                  }}
                >
                  {getTrainingProgress()}% Complete
                </div>
              </InlineStack>

              <BlockStack gap="200">
                <Text variant="bodyMd" color="subdued">
                  {getTrainingStatusMessage()}
                </Text>

                {/* Add detailed status information */}
                {loadingText && (
                  <Text variant="bodyMd" color="subdued">
                    {loadingText}
                  </Text>
                )}

                {/* Show item counts if available */}
                {untrainedItems && (
                  <div style={{ marginTop: "8px" }}>
                    <Text variant="bodyMd" color="subdued">
                      Items being processed:
                    </Text>
                    <InlineStack gap="400" wrap={false}>
                      {Object.entries(untrainedItems).map(([type, items]) => {
                        if (items.length > 0) {
                          return (
                            <div
                              key={type}
                              style={{
                                backgroundColor: "#F4F6F8",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "13px",
                              }}
                            >
                              {type.charAt(0).toUpperCase() + type.slice(1)}:{" "}
                              {items.length}
                            </div>
                          );
                        }
                        return null;
                      })}
                    </InlineStack>
                  </div>
                )}

                {/* Show estimated time remaining */}
                {timeRemaining > 0 && (
                  <Text variant="bodyMd" color="subdued">
                    Estimated time remaining:{" "}
                    {formatTimeRemaining(timeRemaining)}
                  </Text>
                )}
              </BlockStack>

              {/* Progress Bar */}
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  backgroundColor: "#E4E5E7",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${getTrainingProgress()}%`,
                    height: "100%",
                    background:
                      "linear-gradient(90deg, #008060 0%, #00A67E 100%)",
                    borderRadius: "4px",
                    transition: "width 0.5s ease-in-out",
                  }}
                />
              </div>
            </BlockStack>
          </div>
        </Box>
      )}

      <Layout>
        <Layout.Section>
          {/* Header */}
          <Box paddingBlockEnd="600">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="200">
                <Text variant="headingXl" as="h1">
                  Dashboard
                </Text>
                <Text variant="bodyMd" color="subdued">
                  Manage your AI-powered shopping assistant
                </Text>
              </BlockStack>
              {accessKey && fetcher.data?.success && (
                <Button
                  primary
                  size="large"
                  icon={ExternalIcon}
                  onClick={() => {
                    window.open(
                      `${urls.voiceroApi}/app/websites/website?id=${fetcher.data?.websiteData?.id}`,
                      "_blank",
                    );
                  }}
                >
                  Open Control Panel
                </Button>
              )}
            </InlineStack>
          </Box>

          {/* Error Messages */}
          {error && (
            <Box paddingBlockEnd="400">
              {typeof error === "string" ? (
                <div
                  style={{
                    backgroundColor: "#FFF5F5",
                    borderRadius: "12px",
                    padding: "16px",
                    border: "1px solid #FCE9E9",
                  }}
                >
                  <Text variant="bodyMd" tone="critical">
                    {error}
                  </Text>
                </div>
              ) : (
                error
              )}
            </Box>
          )}

          {/* No Plan Warning Banner */}
          {accessKey &&
            fetcher.data?.success &&
            !fetcher.data.websiteData.plan && (
              <Box paddingBlockEnd="400">
                <div
                  style={{
                    backgroundColor: "#FFF4E4",
                    borderRadius: "12px",
                    padding: "16px",
                    border: "1px solid #FFECCC",
                  }}
                >
                  <InlineStack gap="300" blockAlign="center">
                    <Icon source={InfoIcon} color="warning" />
                    <Text variant="bodyMd" tone="warning">
                      Your account doesn't have an active plan. Actions like
                      activating your assistant, syncing content, and refreshing
                      data are disabled. Please use the "Open Control Panel"
                      button above to upgrade your plan.
                    </Text>
                  </InlineStack>
                </div>
              </Box>
            )}

          {/* Main Content */}
          <BlockStack gap="600">
            {/* NEW: Contacts Card - Add this before the Content Overview section */}
            {accessKey ? (
              isDataLoading ? (
                /* Loading State */
                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "12px",
                    padding: "80px",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                    textAlign: "center",
                  }}
                >
                  <BlockStack gap="400" align="center">
                    <Spinner size="large" />
                    <Text variant="headingMd" alignment="center">
                      Loading your dashboard...
                    </Text>
                    <Text variant="bodyMd" color="subdued" alignment="center">
                      This may take a few moments
                    </Text>
                  </BlockStack>
                </div>
              ) : fetcher.data?.success ? (
                /* Connected State */
                <BlockStack gap="600">
                  {/* Website Status Card */}
                  <div
                    style={{
                      background: "linear-gradient(180deg,#F8FAFC,#FFFFFF)",
                      borderRadius: "16px",
                      padding: "24px",
                      boxShadow: "0 10px 20px rgba(16, 24, 40, 0.06)",
                      border: "1px solid #EEF2F7",
                    }}
                  >
                    <BlockStack gap="600">
                      {/* Header Section */}
                      <InlineStack align="space-between" blockAlign="start">
                        <InlineStack gap="400" blockAlign="center">
                          <div
                            style={{
                              width: "56px",
                              height: "56px",
                              borderRadius: "14px",
                              backgroundColor: fetcher.data?.websiteData?.active
                                ? "#E3F5E1"
                                : "#FFF4E4",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
                            }}
                          >
                            <Icon
                              source={
                                fetcher.data?.websiteData?.active
                                  ? CheckIcon
                                  : InfoIcon
                              }
                              color={
                                fetcher.data?.websiteData?.active
                                  ? "success"
                                  : "warning"
                              }
                            />
                          </div>
                          <BlockStack gap="100">
                            <Text variant="headingXl" fontWeight="bold">
                              {fetcher.data?.websiteData?.name}
                            </Text>
                            <Link
                              url={fetcher.data?.websiteData?.url}
                              external
                              monochrome
                            >
                              <Text variant="bodyMd" color="subdued">
                                {fetcher.data?.websiteData?.url}
                              </Text>
                            </Link>
                          </BlockStack>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <div
                            style={{
                              backgroundColor: fetcher.data?.websiteData?.active
                                ? "#E3F5E1"
                                : "#FFF4E4",
                              padding: "6px 14px",
                              borderRadius: "9999px",
                              border: "1px solid #D1D5DB",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                backgroundColor: fetcher.data?.websiteData
                                  ?.active
                                  ? "#16A34A"
                                  : "#D97706",
                                boxShadow: "0 0 0 3px rgba(22,163,74,0.15)",
                              }}
                            />
                            <Text
                              variant="bodySm"
                              fontWeight="semibold"
                              tone={
                                fetcher.data?.websiteData?.active
                                  ? "success"
                                  : "caution"
                              }
                            >
                              {fetcher.data?.websiteData?.active
                                ? "Active"
                                : "Inactive"}
                            </Text>
                          </div>
                          {!fetcher.data?.websiteData?.plan ? (
                            <Button
                              size="slim"
                              primary
                              onClick={() => {
                                window.open(
                                  `${urls.voiceroApi}/app/websites/website?id=${fetcher.data?.websiteData?.id}`,
                                  "_blank",
                                );
                              }}
                            >
                              Upgrade Now
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="slim"
                                onClick={() => {
                                  fetch("/api/toggle-status", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                      accessKey: accessKey.trim(),
                                    }),
                                  })
                                    .then((response) => {
                                      if (!response.ok) {
                                        throw new Error(
                                          `HTTP error! status: ${response.status}`,
                                        );
                                      }
                                      // If activating (not deactivating), show activation guide
                                      if (!fetcher.data?.websiteData?.active) {
                                        setShowActivationGuide(true);
                                      }
                                      fetcher.submit(
                                        { accessKey, action: "manual_connect" },
                                        { method: "POST" },
                                      );
                                    })
                                    .catch((error) => {
                                      console.error(
                                        "Error toggling status:",
                                        error,
                                      );
                                      setError(
                                        "Failed to toggle website status",
                                      );
                                    });
                                }}
                                disabled={
                                  !fetcher.data?.websiteData?.lastSyncedAt ||
                                  fetcher.data?.websiteData?.lastSyncedAt ===
                                    "Never" ||
                                  !fetcher.data?.websiteData?.plan
                                }
                              >
                                {fetcher.data?.websiteData?.active
                                  ? "Deactivate"
                                  : "Activate"}
                              </Button>
                              {(!fetcher.data?.websiteData?.lastSyncedAt ||
                                fetcher.data?.websiteData?.lastSyncedAt ===
                                  "Never") &&
                                !fetcher.data?.websiteData?.active && (
                                  <div
                                    style={{
                                      marginTop: "8px",
                                      backgroundColor: "#FFF4E4",
                                      padding: "4px 8px",
                                      borderRadius: "4px",
                                      fontSize: "12px",
                                    }}
                                  >
                                    <Text variant="bodySm" tone="warning">
                                      Sync your content before activating
                                    </Text>
                                  </div>
                                )}
                            </>
                          )}
                        </InlineStack>
                      </InlineStack>

                      <Divider />

                      {/* AI Features */}
                      <div
                        style={{
                          backgroundColor: "#FFFFFF",
                          borderRadius: 12,
                          padding: 16,
                          border: "1px solid #EEF2F7",
                        }}
                      >
                        <BlockStack gap="300">
                          <Text variant="headingSm" fontWeight="semibold">
                            AI Features
                          </Text>
                          {[
                            {
                              key: "voice",
                              title: "Voice AI",
                              description:
                                "Enable voice-based AI interactions on your website",
                              enabled: Boolean(voiceEnabled),
                            },
                            {
                              key: "text",
                              title: "Text AI",
                              description:
                                "Enable text-based AI chat on your website",
                              enabled: Boolean(textEnabled),
                            },
                          ].map((f) => (
                            <InlineStack
                              key={f.key}
                              align="space-between"
                              blockAlign="center"
                            >
                              <InlineStack gap="200" blockAlign="center">
                                <div
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 8,
                                    backgroundColor: "#EDE9FE",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Icon source={ChatIcon} color="highlight" />
                                </div>
                                <BlockStack gap="0">
                                  <Text variant="bodyMd" fontWeight="semibold">
                                    {f.title}
                                  </Text>
                                  <Text variant="bodySm" color="subdued">
                                    {f.description}
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                              <button
                                onClick={() =>
                                  handleToggleAI(f.key, !f.enabled)
                                }
                                disabled={!fetcher.data?.websiteData?.plan}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                  backgroundColor: f.enabled
                                    ? "#8B5CF6"
                                    : "#E5E7EB",
                                  color: f.enabled ? "white" : "#111827",
                                  border: "none",
                                  padding: "6px 12px",
                                  borderRadius: 9999,
                                  cursor: "pointer",
                                  fontWeight: 600,
                                }}
                              >
                                <Icon
                                  source={
                                    f.enabled ? ToggleOnIcon : ToggleOffIcon
                                  }
                                  color={f.enabled ? "base" : "subdued"}
                                />
                                {f.enabled ? "Live" : "Off"}
                              </button>
                            </InlineStack>
                          ))}
                        </BlockStack>
                      </div>

                      {/* Quick Stats Grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(240px, 1fr))",
                          gap: 16,
                        }}
                      >
                        {(() => {
                          const isActive = !!fetcher.data?.websiteData?.active;
                          const hasPlan = !!fetcher.data?.websiteData?.plan;
                          const plan = fetcher.data?.websiteData?.plan;
                          const monthlyQueries =
                            fetcher.data?.websiteData?.monthlyQueries || 0;
                          const queryLimit =
                            fetcher.data?.websiteData?.queryLimit || 0;
                          const lastSyncedRaw =
                            fetcher.data?.websiteData?.lastSyncedAt;
                          const isSynced =
                            !!lastSyncedRaw && lastSyncedRaw !== "Never";
                          const lastSyncedDisplay = lastSyncedRaw
                            ? lastSyncedRaw === "Never"
                              ? "Never"
                              : new Date(lastSyncedRaw).toLocaleDateString()
                            : "Never";

                          const limitLabel =
                            plan === "Beta"
                              ? "/ Unlimited"
                              : plan === "Enterprise"
                                ? "/ Pay per query"
                                : plan === "Starter"
                                  ? "/ 100"
                                  : `/ ${queryLimit}`;

                          const tiles = [
                            {
                              icon: isActive ? CheckIcon : InfoIcon,
                              label: "Status",
                              value: isActive ? "Active" : "Inactive",
                              sub: isActive ? "Live" : "Requires activation",
                              accent: isActive ? "#E8F5E9" : "#FFF4E4",
                            },
                            {
                              icon: DataPresentationIcon,
                              label: "Plan Type",
                              value: hasPlan ? plan : "No Active Plan",
                              sub: hasPlan ? "Active plan" : "Limited Access",
                              accent: hasPlan ? "#EEF6FF" : "#FFF4E4",
                            },
                            {
                              icon: ChatIcon,
                              label: "Monthly Queries",
                              value: monthlyQueries,
                              sub: limitLabel,
                              accent: "#F3E8FF",
                            },
                            {
                              icon: CalendarIcon,
                              label: "Last Synced",
                              value: lastSyncedDisplay,
                              sub: isSynced ? "Up to date" : "Never synced",
                              accent: isSynced ? "#E8F5E9" : "#FFF4E4",
                            },
                          ];

                          return tiles.map((tile, idx) => (
                            <div
                              key={idx}
                              style={{
                                backgroundColor: tile.accent,
                                borderRadius: 12,
                                padding: 16,
                                transition:
                                  "transform 0.15s ease, box-shadow 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform =
                                  "translateY(-2px)";
                                e.currentTarget.style.boxShadow =
                                  "0 8px 16px rgba(16,24,40,0.08)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform =
                                  "translateY(0)";
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
                                  <Icon source={tile.icon} color="base" />
                                </div>
                                <BlockStack gap="100">
                                  <Text variant="bodySm" color="subdued">
                                    {tile.label}
                                  </Text>
                                  <Text
                                    variant="headingMd"
                                    fontWeight="semibold"
                                  >
                                    {tile.value}
                                  </Text>
                                  {tile.sub && (
                                    <Text variant="bodySm" color="subdued">
                                      {tile.sub}
                                    </Text>
                                  )}
                                </BlockStack>
                              </InlineStack>
                            </div>
                          ));
                        })()}
                      </div>
                    </BlockStack>
                  </div>

                  {/* 1-Month Check-In Summary */}
                  {accessKey &&
                    fetcher.data?.success &&
                    (isLoadingExtendedData &&
                    !extendedWebsiteData?.aiOverview ? (
                      <div
                        style={{
                          backgroundColor: "white",
                          borderRadius: "12px",
                          padding: "24px",
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                        }}
                      >
                        <div style={{ padding: "32px", textAlign: "center" }}>
                          <BlockStack gap="400" align="center">
                            <Spinner size="large" />
                            <Text variant="bodyMd" color="subdued">
                              Loading AI overview...
                            </Text>
                          </BlockStack>
                        </div>
                      </div>
                    ) : extendedWebsiteData?.aiOverview ? (
                      <div
                        style={{
                          backgroundColor: "white",
                          borderRadius: "12px",
                          padding: "24px",
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                        }}
                      >
                        <BlockStack gap="600">
                          <InlineStack gap="300" blockAlign="center">
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                backgroundColor: "#F4F5F7",
                                borderRadius: 10,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Icon source={CalendarIcon} color="base" />
                            </div>
                            <BlockStack gap="100">
                              <Text variant="headingLg" fontWeight="semibold">
                                Month Past Performance
                              </Text>
                              <Text variant="bodySm" color="subdued">
                                {extendedWebsiteData?.aiOverview
                                  ?.period_label || "Based on the last 4 weeks"}
                              </Text>
                            </BlockStack>
                          </InlineStack>

                          {/* Top-line KPIs */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(240px, 1fr))",
                              gap: 16,
                            }}
                          >
                            {(() => {
                              const ai = extendedWebsiteData?.aiOverview || {};
                              const tri = ai.total_revenue_increase || {};
                              const breakdown = tri.breakdown || {};
                              const currency = tri.currency || "USD";
                              const kpis = [
                                {
                                  label: "Total Conversations",
                                  value: ai.total_message_threads ?? 0,
                                  accent: "#EEF6FF",
                                  icon: ChatIcon,
                                },
                                {
                                  label: "Total revenue added to cart",
                                  value: formatCurrency(
                                    tri.amount || 0,
                                    currency,
                                  ),
                                  sub: `${breakdown.threads || 0} threads • ${
                                    breakdown.percent_of_total_threads != null
                                      ? breakdown.percent_of_total_threads
                                      : 0
                                  }% • AOV ${formatCurrency(breakdown.aov || 0, currency)}`,
                                  accent: "#E8F5E9",
                                  icon: DataPresentationIcon,
                                },
                                {
                                  label: "Problem Resolution Rate",
                                  value: `${(ai.problem_resolution_rate?.percent ?? 0).toFixed(2)}%`,
                                  sub: `${ai.problem_resolution_rate?.resolved_threads ?? 0} of ${ai.problem_resolution_rate?.total_threads ?? 0} threads`,
                                  accent: "#FEF3C7",
                                  icon: CheckIcon,
                                },
                                {
                                  label: "Avg Messages/Thread",
                                  value: (
                                    ai.avg_messages_per_thread ?? 0
                                  ).toFixed(2),
                                  accent: "#F3E8FF",
                                  icon: ChatIcon,
                                },
                              ];
                              return kpis;
                            })().map((kpi, idx) => (
                              <div
                                key={idx}
                                style={{
                                  backgroundColor: kpi.accent,
                                  borderRadius: 12,
                                  padding: 16,
                                  transition:
                                    "transform 0.15s ease, box-shadow 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform =
                                    "translateY(-2px)";
                                  e.currentTarget.style.boxShadow =
                                    "0 8px 16px rgba(16,24,40,0.08)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform =
                                    "translateY(0)";
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
                                    <Icon source={kpi.icon} color="base" />
                                  </div>
                                  <BlockStack gap="100">
                                    <Text variant="bodySm" color="subdued">
                                      {kpi.label}
                                    </Text>
                                    <Text variant="headingXl" fontWeight="bold">
                                      {kpi.value}
                                    </Text>
                                    {kpi.sub ? (
                                      <Text variant="bodySm" color="subdued">
                                        {kpi.sub}
                                      </Text>
                                    ) : null}
                                  </BlockStack>
                                </InlineStack>
                              </div>
                            ))}
                          </div>

                          {/* Most Common Asked Questions from aiOverview */}
                          <div
                            style={{
                              backgroundColor: "#F9FAFB",
                              borderRadius: 12,
                              padding: 16,
                            }}
                          >
                            <Text variant="headingSm" fontWeight="semibold">
                              Most Common Asked Questions
                            </Text>
                            <div style={{ height: 12 }} />
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(260px, 1fr))",
                                gap: 12,
                              }}
                            >
                              {(
                                extendedWebsiteData?.aiOverview
                                  ?.most_common_questions || []
                              ).map((cat, i) => (
                                <div
                                  key={i}
                                  style={{
                                    backgroundColor: "white",
                                    borderRadius: 10,
                                    padding: 16,
                                    border: "1px solid #EEF2F7",
                                  }}
                                >
                                  <InlineStack
                                    align="space-between"
                                    blockAlign="center"
                                  >
                                    <Text
                                      variant="headingSm"
                                      fontWeight="semibold"
                                    >
                                      {cat.category}
                                    </Text>
                                    <div
                                      style={{
                                        backgroundColor: "#EEF6FF",
                                        padding: "2px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #B3D7FF",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: "#1E3A8A",
                                      }}
                                    >
                                      {cat.threads || 0} threads
                                    </div>
                                  </InlineStack>
                                  <div style={{ height: 8 }} />
                                  <Text variant="bodySm" color="subdued">
                                    {cat.description}
                                  </Text>
                                </div>
                              ))}
                            </div>
                          </div>
                        </BlockStack>
                      </div>
                    ) : null)}

                  {/* Recent Questions by Topic from aiOverview */}
                  {accessKey &&
                    fetcher.data?.success &&
                    (isLoadingExtendedData &&
                    !extendedWebsiteData?.aiOverview
                      ?.recent_questions_by_topic ? (
                      <div
                        style={{
                          backgroundColor: "white",
                          borderRadius: "12px",
                          padding: "24px",
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                        }}
                      >
                        <div style={{ padding: "32px", textAlign: "center" }}>
                          <BlockStack gap="400" align="center">
                            <Spinner size="large" />
                            <Text variant="bodyMd" color="subdued">
                              Loading recent questions...
                            </Text>
                          </BlockStack>
                        </div>
                      </div>
                    ) : extendedWebsiteData?.aiOverview
                        ?.recent_questions_by_topic ? (
                      <div
                        style={{
                          backgroundColor: "white",
                          borderRadius: "12px",
                          padding: "24px",
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                        }}
                      >
                        <BlockStack gap="600">
                          <BlockStack gap="200">
                            <Text variant="headingLg" fontWeight="semibold">
                              Recent Questions by Topic
                            </Text>
                            {extendedWebsiteData?.aiOverview?.period_label && (
                              <Text variant="bodyMd" color="subdued">
                                {extendedWebsiteData.aiOverview.period_label}
                              </Text>
                            )}
                          </BlockStack>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(220px, 1fr))",
                              gap: "16px",
                            }}
                          >
                            {(
                              extendedWebsiteData.aiOverview
                                .recent_questions_by_topic || []
                            ).map((topic, idx) => (
                              <div
                                key={idx}
                                style={{
                                  backgroundColor: "#F9FAFB",
                                  borderRadius: "12px",
                                  padding: "16px",
                                }}
                              >
                                <Text variant="headingSm" fontWeight="semibold">
                                  {topic.topic}
                                </Text>
                                <div style={{ height: 8 }} />
                                <BlockStack gap="200">
                                  {(topic.items || []).map((q, i) => {
                                    const isResolved =
                                      (q.status || "").toLowerCase() ===
                                      "resolved";
                                    return (
                                      <div
                                        key={i}
                                        style={{
                                          backgroundColor: "white",
                                          borderRadius: "10px",
                                          padding: "12px",
                                          border: "1px solid #EEF2F7",
                                        }}
                                      >
                                        <BlockStack gap="100">
                                          <Text variant="bodySm">
                                            {q.question}
                                          </Text>
                                          <InlineStack
                                            gap="200"
                                            blockAlign="center"
                                          >
                                            <div
                                              style={{
                                                backgroundColor: isResolved
                                                  ? "#E8F5E9"
                                                  : "#FEF3C7",
                                                border: `1px solid ${isResolved ? "#86EFAC" : "#FDE68A"}`,
                                                color: isResolved
                                                  ? "#065F46"
                                                  : "#92400E",
                                                padding: "2px 8px",
                                                borderRadius: 999,
                                                fontSize: 12,
                                                fontWeight: 600,
                                              }}
                                            >
                                              {isResolved
                                                ? "Resolved"
                                                : "Needs attention"}
                                            </div>
                                            {q.note && (
                                              <Text
                                                variant="bodySm"
                                                color="subdued"
                                              >
                                                {q.note}
                                              </Text>
                                            )}
                                          </InlineStack>
                                        </BlockStack>
                                      </div>
                                    );
                                  })}
                                </BlockStack>
                              </div>
                            ))}
                          </div>
                        </BlockStack>
                      </div>
                    ) : null)}

                  {/* NEW: Top Content Card - REPLACING with Action Statistics */}
                  {accessKey && fetcher.data?.success && (
                    <div
                      style={{
                        backgroundColor: "white",
                        borderRadius: "12px",
                        padding: "24px",
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                      }}
                    >
                      <BlockStack gap="600">
                        <BlockStack gap="200">
                          <InlineStack gap="300" blockAlign="center">
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                backgroundColor: "#EEF6FF",
                                borderRadius: 10,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Icon
                                source={DataPresentationIcon}
                                color="base"
                              />
                            </div>
                            <Text variant="headingLg" fontWeight="semibold">
                              Action Statistics
                            </Text>
                          </InlineStack>
                          <Text variant="bodyMd" color="subdued">
                            How customers are interacting with your AI assistant
                            (click on each one to see threads)
                          </Text>
                        </BlockStack>

                        {isLoadingExtendedData && !extendedWebsiteData ? (
                          <div style={{ padding: "32px", textAlign: "center" }}>
                            <BlockStack gap="400" align="center">
                              <Spinner size="large" />
                              <Text variant="bodyMd" color="subdued">
                                Loading action data...
                              </Text>
                            </BlockStack>
                          </div>
                        ) : extendedWebsiteData?.globalStats ? (
                          <div
                            style={{
                              backgroundColor: "#F9FAFB",
                              borderRadius: "12px",
                              padding: "20px",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(240px, 1fr))",
                                gap: 16,
                              }}
                            >
                              {[
                                {
                                  icon: DataPresentationIcon,
                                  value:
                                    extendedWebsiteData.globalStats
                                      ?.totalAiRedirects || 0,
                                  label: "Redirects",
                                  accent: "#EEF6FF",
                                  type: "redirect",
                                },
                                {
                                  icon: CheckIcon,
                                  value:
                                    extendedWebsiteData.globalStats
                                      ?.totalAiPurchases || 0,
                                  label: "Purchases",
                                  accent: "#E8F5E9",
                                  type: "purchase",
                                },
                                {
                                  icon: InfoIcon,
                                  value:
                                    extendedWebsiteData.globalStats
                                      ?.totalAiClicks || 0,
                                  label: "Clicks",
                                  accent: "#FEF3C7",
                                  type: "click",
                                },
                                {
                                  icon: RefreshIcon,
                                  value:
                                    extendedWebsiteData.globalStats
                                      ?.totalAiScrolls || 0,
                                  label: "Scrolls",
                                  accent: "#F3E8FF",
                                  type: "scroll",
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
                                    border:
                                      selectedActionType === stat.type
                                        ? "2px solid #1E3A8A"
                                        : "1px solid transparent",
                                    cursor: "pointer",
                                  }}
                                  onClick={() => {
                                    console.log(
                                      "Action button clicked:",
                                      stat.type,
                                      "current:",
                                      selectedActionType,
                                    );
                                    // Toggle selection; reset thread on change
                                    const newActionType =
                                      selectedActionType === stat.type
                                        ? null
                                        : stat.type;
                                    console.log(
                                      "Setting new action type:",
                                      newActionType,
                                    );
                                    setSelectedActionType(newActionType);
                                    // Always reset thread when action type changes
                                    console.log(
                                      "Resetting selectedThreadId to null",
                                    );
                                    setSelectedThreadId(null);
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.transform =
                                      "translateY(-2px)";
                                    e.currentTarget.style.boxShadow =
                                      "0 8px 16px rgba(16,24,40,0.08)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform =
                                      "translateY(0)";
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
                                        {stat.type === "purchase"
                                          ? "Add To Cart"
                                          : stat.label}
                                      </Text>
                                      <Text
                                        variant="headingXl"
                                        fontWeight="bold"
                                      >
                                        {stat.value}
                                      </Text>
                                    </BlockStack>
                                  </InlineStack>
                                </div>
                              ))}
                            </div>

                            {/* Action Details Drawer */}
                            {selectedActionType && (
                              <div
                                style={{
                                  marginTop: 16,
                                  backgroundColor: "white",
                                  border: "1px solid #EEF2F7",
                                  borderRadius: 12,
                                  padding: 16,
                                }}
                              >
                                <InlineStack
                                  align="space-between"
                                  blockAlign="center"
                                >
                                  <Text
                                    variant="headingMd"
                                    fontWeight="semibold"
                                  >
                                    {(() => {
                                      if (selectedActionType === "purchase") {
                                        return "Add to cart";
                                      }
                                      const label =
                                        selectedActionType
                                          .charAt(0)
                                          .toUpperCase() +
                                        selectedActionType.slice(1);
                                      return label;
                                    })()}{" "}
                                    Conversations
                                  </Text>
                                  <Button
                                    size="slim"
                                    onClick={() => {
                                      setSelectedActionType(null);
                                      setSelectedThreadId(null);
                                    }}
                                  >
                                    Close
                                  </Button>
                                </InlineStack>

                                <div style={{ height: 12 }} />

                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "minmax(240px, 360px) 1fr",
                                    gap: 16,
                                  }}
                                >
                                  {/* Left: Thread list */}
                                  <div
                                    style={{
                                      backgroundColor: "#F9FAFB",
                                      borderRadius: 10,
                                      border: "1px solid #EEF2F7",
                                      padding: 12,
                                      maxHeight: 360,
                                      overflow: "auto",
                                    }}
                                  >
                                    <BlockStack gap="100">
                                      {(() => {
                                        const threads =
                                          getThreadsForAction(
                                            selectedActionType,
                                          );

                                        console.log(
                                          "UI: Rendering threads for",
                                          selectedActionType,
                                          ":",
                                          threads.length,
                                        );

                                        // Debug log each thread's actions
                                        threads.forEach((t, idx) => {
                                          if (t.messages) {
                                            const actions = t.messages
                                              .map((m) => {
                                                const payload =
                                                  parseActionPayload(m.content);
                                                return payload
                                                  ? payload.action
                                                  : "no-action";
                                              })
                                              .filter((a) => a !== "no-action");
                                            console.log(
                                              `Thread ${idx} (${t.threadId || t.messageId}):`,
                                              actions,
                                            );
                                          }
                                        });

                                        if (!threads.length) {
                                          return (
                                            <Text
                                              variant="bodySm"
                                              color="subdued"
                                            >
                                              No conversations found for this
                                              action.
                                            </Text>
                                          );
                                        }
                                        return threads.map((t, i) => {
                                          const active =
                                            selectedThreadId ===
                                            (t.threadId || t.messageId);
                                          const created = new Date(
                                            t.createdAt,
                                          ).toLocaleString();
                                          return (
                                            <div
                                              key={
                                                (t.threadId ||
                                                  t.messageId ||
                                                  i) + "-row"
                                              }
                                              style={{
                                                backgroundColor: active
                                                  ? "#EEF6FF"
                                                  : "white",
                                                border: `1px solid ${active ? "#B3D7FF" : "#EEF2F7"}`,
                                                borderRadius: 8,
                                                padding: 10,
                                                cursor: "pointer",
                                              }}
                                              onClick={() =>
                                                setSelectedThreadId(
                                                  t.threadId || t.messageId,
                                                )
                                              }
                                            >
                                              <BlockStack gap="050">
                                                <Text
                                                  variant="bodySm"
                                                  fontWeight="semibold"
                                                >
                                                  Thread{" "}
                                                  {t.threadId?.slice(0, 8) ||
                                                    t.messageId?.slice(0, 8)}
                                                </Text>
                                                <Text
                                                  variant="bodySm"
                                                  color="subdued"
                                                >
                                                  {created}
                                                </Text>
                                              </BlockStack>
                                            </div>
                                          );
                                        });
                                      })()}
                                    </BlockStack>
                                  </div>

                                  {/* Right: Messages timeline */}
                                  <div
                                    style={{
                                      backgroundColor: "#F9FAFB",
                                      borderRadius: 10,
                                      border: "1px solid #EEF2F7",
                                      padding: 12,
                                      maxHeight: 360,
                                      overflow: "auto",
                                    }}
                                  >
                                    {(() => {
                                      const threads =
                                        getThreadsForAction(selectedActionType);

                                      console.log(
                                        "UI: Message timeline - threads for",
                                        selectedActionType,
                                        ":",
                                        threads.length,
                                      );
                                      console.log(
                                        "UI: Looking for selectedThreadId:",
                                        selectedThreadId,
                                      );

                                      const thread = threads.find(
                                        (t) =>
                                          (t.threadId || t.messageId) ===
                                          selectedThreadId,
                                      );

                                      console.log(
                                        "UI: Found thread:",
                                        thread
                                          ? thread.threadId || thread.messageId
                                          : "none",
                                      );

                                      // If no thread is selected or the selected thread doesn't exist in current action
                                      if (!thread || !selectedThreadId) {
                                        return (
                                          <Text
                                            variant="bodySm"
                                            color="subdued"
                                          >
                                            Select a conversation to view
                                            messages.
                                          </Text>
                                        );
                                      }

                                      // Validate that the thread actually contains messages for the selected action type
                                      const hasMatchingAction =
                                        thread.messages &&
                                        Array.isArray(thread.messages) &&
                                        thread.messages.some((m) => {
                                          const payload = parseActionPayload(
                                            m.content,
                                          );
                                          if (!payload) return false;
                                          const a = payload.action;
                                          const s = selectedActionType;
                                          if (s === "purchase") {
                                            return (
                                              a === "purchase" ||
                                              a === "add_to_cart" ||
                                              a === "add to cart"
                                            );
                                          }
                                          if (
                                            s === "add_to_cart" ||
                                            s === "add to cart"
                                          ) {
                                            return (
                                              a === "purchase" ||
                                              a === "add_to_cart" ||
                                              a === "add to cart"
                                            );
                                          }
                                          return a === s;
                                        });

                                      if (!hasMatchingAction) {
                                        return (
                                          <Text
                                            variant="bodySm"
                                            color="subdued"
                                          >
                                            No messages found for this action in
                                            the selected conversation.
                                          </Text>
                                        );
                                      }
                                      const messages = (thread.messages || [])
                                        .slice()
                                        .sort(
                                          (a, b) =>
                                            new Date(a.createdAt) -
                                            new Date(b.createdAt),
                                        );
                                      return (
                                        <BlockStack gap="150">
                                          {messages.map((m, idx) => {
                                            const payload = parseActionPayload(
                                              m.content,
                                            );
                                            const isActionMsg =
                                              payload &&
                                              payload.action ===
                                                selectedActionType;
                                            return (
                                              <div
                                                key={m.id || idx}
                                                style={{
                                                  backgroundColor: "white",
                                                  border: `2px solid ${isActionMsg ? "#16A34A" : "#EEF2F7"}`,
                                                  borderRadius: 8,
                                                  padding: 10,
                                                }}
                                              >
                                                <InlineStack
                                                  align="space-between"
                                                  blockAlign="center"
                                                >
                                                  <Text
                                                    variant="bodySm"
                                                    fontWeight="semibold"
                                                  >
                                                    {m.role === "assistant"
                                                      ? "Assistant"
                                                      : "User"}
                                                  </Text>
                                                  <Text
                                                    variant="bodySm"
                                                    color="subdued"
                                                  >
                                                    {new Date(
                                                      m.createdAt,
                                                    ).toLocaleString()}
                                                  </Text>
                                                </InlineStack>
                                                <div style={{ height: 6 }} />
                                                {!isActionMsg && (
                                                  <Text
                                                    variant="bodySm"
                                                    color="subdued"
                                                  >
                                                    {(() => {
                                                      if (
                                                        typeof m.content ===
                                                        "string"
                                                      ) {
                                                        // Try to parse as JSON first to extract just the answer
                                                        try {
                                                          const parsed =
                                                            JSON.parse(
                                                              m.content,
                                                            );
                                                          if (parsed.answer) {
                                                            return parsed.answer;
                                                          }
                                                          return m.content;
                                                        } catch {
                                                          return m.content;
                                                        }
                                                      }
                                                      try {
                                                        // If content is already an object, check for answer field
                                                        if (
                                                          m.content &&
                                                          typeof m.content ===
                                                            "object" &&
                                                          m.content.answer
                                                        ) {
                                                          return m.content
                                                            .answer;
                                                        }
                                                        return JSON.stringify(
                                                          m.content,
                                                        );
                                                      } catch {
                                                        return String(
                                                          m.content,
                                                        );
                                                      }
                                                    })()}
                                                  </Text>
                                                )}
                                                {isActionMsg && (
                                                  <div
                                                    style={{
                                                      marginTop: 8,
                                                      backgroundColor:
                                                        "#F0FDF4",
                                                      border:
                                                        "1px solid #86EFAC",
                                                      borderRadius: 8,
                                                      padding: 8,
                                                    }}
                                                  >
                                                    <Text
                                                      variant="bodySm"
                                                      fontWeight="semibold"
                                                    >
                                                      Action Details
                                                    </Text>
                                                    <div
                                                      style={{ height: 4 }}
                                                    />
                                                    <BlockStack gap="050">
                                                      {payload?.answer && (
                                                        <Text
                                                          variant="bodySm"
                                                          color="subdued"
                                                        >
                                                          Answer:{" "}
                                                          {payload.answer}
                                                        </Text>
                                                      )}
                                                      <Text
                                                        variant="bodySm"
                                                        color="subdued"
                                                      >
                                                        Action:{" "}
                                                        {payload?.action}
                                                      </Text>
                                                      {(() => {
                                                        const ctx =
                                                          payload?.context ||
                                                          {};
                                                        const extra =
                                                          ctx.url ||
                                                          ctx.product_name ||
                                                          ctx.button_text ||
                                                          ctx.exact_text;
                                                        if (!extra) return null;
                                                        const label = ctx.url
                                                          ? "URL"
                                                          : ctx.product_name
                                                            ? "Product"
                                                            : ctx.button_text
                                                              ? "Button"
                                                              : "Text";
                                                        return (
                                                          <Text
                                                            variant="bodySm"
                                                            color="subdued"
                                                          >
                                                            {label}: {extra}
                                                          </Text>
                                                        );
                                                      })()}
                                                    </BlockStack>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </BlockStack>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ padding: "32px", textAlign: "center" }}>
                            <Text variant="bodyMd" color="subdued">
                              No action data available
                            </Text>
                          </div>
                        )}
                      </BlockStack>
                    </div>
                  )}

                  {/* Content Overview Card - REDESIGNED for better display */}
                  <div
                    style={{
                      backgroundColor: "white",
                      borderRadius: "12px",
                      padding: "24px",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    <BlockStack gap="500">
                      {/* Header */}
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="200">
                          <Text variant="headingLg" fontWeight="semibold">
                            Content Overview
                          </Text>
                          <Text variant="bodyMd" color="subdued">
                            Your store's AI-ready content
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Select
                            labelHidden
                            label="Content type"
                            options={[
                              { label: "Products", value: "0" },
                              { label: "Pages", value: "1" },
                              { label: "Blog Posts", value: "2" },
                              { label: "Collections", value: "3" },
                              { label: "Discounts", value: "4" },
                            ]}
                            onChange={(v) => setSelectedContentTab(Number(v))}
                            value={String(selectedContentTab)}
                          />
                          <Button
                            onClick={handleSync}
                            loading={isSyncing}
                            icon={RefreshIcon}
                            primary={
                              !fetcher.data?.websiteData?.lastSyncedAt ||
                              fetcher.data?.websiteData?.lastSyncedAt ===
                                "Never"
                            }
                            disabled={!fetcher.data?.websiteData?.plan}
                          >
                            {isSyncing ? "Syncing..." : "Sync Content"}
                          </Button>
                        </InlineStack>
                        {isSyncing && (
                          <Text
                            variant="bodySm"
                            color="subdued"
                            style={{ marginTop: 8 }}
                          >
                            {syncStatusText ||
                              "Syncing content... Please wait."}
                          </Text>
                        )}
                      </InlineStack>

                      {/* Content Type Stats */}
                      <div
                        style={{
                          backgroundColor: "#F9FAFB",
                          borderRadius: "12px",
                          padding: "24px",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(240px, 1fr))",
                            gap: 16,
                          }}
                        >
                          {[
                            {
                              icon: ProductIcon,
                              count:
                                extendedWebsiteData?.content?.products
                                  ?.length || 0,
                              label: "Products",
                              id: "products",
                              accent: "#EEF6FF",
                            },
                            {
                              icon: PageIcon,
                              count:
                                extendedWebsiteData?.content?.pages?.length ||
                                0,
                              label: "Pages",
                              id: "pages",
                              accent: "#E8F5E9",
                            },
                            {
                              icon: BlogIcon,
                              count:
                                extendedWebsiteData?.content?.blogPosts
                                  ?.length || 0,
                              label: "Blog Posts",
                              id: "blogPosts",
                              accent: "#FEF3C7",
                            },
                            {
                              icon: CollectionIcon,
                              count:
                                extendedWebsiteData?.content?.collections
                                  ?.length || 0,
                              label: "Collections",
                              id: "collections",
                              accent: "#F3E8FF",
                            },
                            {
                              icon: DiscountIcon,
                              count:
                                extendedWebsiteData?.content?.discounts
                                  ?.length || 0,
                              label: "Discounts",
                              id: "discounts",
                              accent: "#E0F2FE",
                            },
                          ].map((item, index) => (
                            <div
                              key={index}
                              style={{
                                backgroundColor: item.accent,
                                borderRadius: 12,
                                padding: 16,
                                cursor: "pointer",
                                border:
                                  selectedContentTab === index
                                    ? "1px solid #B3D7FF"
                                    : "1px solid transparent",
                                transition:
                                  "transform 0.15s ease, box-shadow 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform =
                                  "translateY(-2px)";
                                e.currentTarget.style.boxShadow =
                                  "0 8px 16px rgba(16,24,40,0.08)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform =
                                  "translateY(0)";
                                e.currentTarget.style.boxShadow = "none";
                              }}
                              onClick={() => setSelectedContentTab(index)}
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
                                  <Icon source={item.icon} color="base" />
                                </div>
                                <BlockStack gap="100">
                                  <Text variant="bodySm" color="subdued">
                                    {item.label}
                                  </Text>
                                  <Text variant="headingXl" fontWeight="bold">
                                    {item.count}
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Content Details */}
                      {extendedWebsiteData?.content && (
                        <div
                          style={{
                            backgroundColor: "#F9FAFB",
                            borderRadius: "12px",
                            padding: "20px",
                          }}
                        >
                          {(() => {
                            // Content rendering function
                            const contentTypes = [
                              "products",
                              "pages",
                              "blogPosts",
                              "collections",
                              "discounts",
                            ];
                            const contentType =
                              contentTypes[selectedContentTab];
                            const contentItems =
                              extendedWebsiteData.content[contentType] || [];

                            if (contentItems.length === 0) {
                              return (
                                <div
                                  style={{
                                    padding: "32px",
                                    textAlign: "center",
                                    backgroundColor: "white",
                                    borderRadius: "8px",
                                  }}
                                >
                                  <BlockStack gap="300" align="center">
                                    <Icon source={InfoIcon} color="subdued" />
                                    <Text variant="bodyMd" color="subdued">
                                      No {contentType} data available
                                    </Text>
                                    {contentType === "discounts" && (
                                      <Text variant="bodySm" color="subdued">
                                        Create discounts in your Shopify admin
                                        to make them available to your AI
                                        assistant
                                      </Text>
                                    )}
                                  </BlockStack>
                                </div>
                              );
                            }

                            return (
                              <div
                                style={{
                                  display: "grid",
                                  gridGap: "16px",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(320px, 1fr))",
                                }}
                              >
                                {contentItems.map((item, index) => (
                                  <div
                                    key={index}
                                    style={{
                                      background:
                                        "linear-gradient(180deg,#FFFFFF,#F9FAFB)",
                                      borderRadius: "12px",
                                      padding: "16px",
                                      border: "1px solid #EEF2F7",
                                      transition:
                                        "transform 0.15s ease, box-shadow 0.15s ease",
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.transform =
                                        "translateY(-1px)";
                                      e.currentTarget.style.boxShadow =
                                        "0 8px 16px rgba(16,24,40,0.06)";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform =
                                        "translateY(0)";
                                      e.currentTarget.style.boxShadow = "none";
                                    }}
                                  >
                                    <BlockStack gap="300">
                                      <InlineStack
                                        gap="200"
                                        blockAlign="center"
                                      >
                                        {contentType === "products" && (
                                          <Icon
                                            source={ProductIcon}
                                            color="subdued"
                                          />
                                        )}
                                        {contentType === "pages" && (
                                          <Icon
                                            source={PageIcon}
                                            color="subdued"
                                          />
                                        )}
                                        {contentType === "blogPosts" && (
                                          <Icon
                                            source={BlogIcon}
                                            color="subdued"
                                          />
                                        )}
                                        {contentType === "collections" && (
                                          <Icon
                                            source={CollectionIcon}
                                            color="subdued"
                                          />
                                        )}
                                        {contentType === "discounts" && (
                                          <Icon
                                            source={DiscountIcon}
                                            color="subdued"
                                          />
                                        )}
                                        <Text
                                          variant="headingMd"
                                          fontWeight="semibold"
                                        >
                                          {item.title}
                                        </Text>
                                      </InlineStack>

                                      {/* Show description for products and collections, content for pages and blog posts */}
                                      {((contentType === "products" &&
                                        item.description) ||
                                        (contentType === "collections" &&
                                          item.description) ||
                                        (contentType === "pages" &&
                                          item.content) ||
                                        (contentType === "blogPosts" &&
                                          item.content) ||
                                        (contentType === "discounts" &&
                                          item.description)) && (
                                        <div
                                          style={{
                                            paddingLeft: "10px",
                                            borderLeft: "3px solid #E5E7EB",
                                          }}
                                        >
                                          <Text
                                            variant="bodyMd"
                                            color="subdued"
                                          >
                                            {contentType === "products" ||
                                            contentType === "collections"
                                              ? item.description.length > 100
                                                ? `${item.description.substring(0, 100)}...`
                                                : item.description
                                              : contentType === "discounts"
                                                ? item.description
                                                  ? item.description
                                                  : `Type: ${item.type}, Code: ${item.code || "Automatic"}`
                                                : item.content
                                                  ? item.content.replace(
                                                      /<[^>]*>/g,
                                                      "",
                                                    ).length > 100
                                                    ? `${item.content.replace(/<[^>]*>/g, "").substring(0, 100)}...`
                                                    : item.content.replace(
                                                        /<[^>]*>/g,
                                                        "",
                                                      )
                                                  : ""}
                                          </Text>
                                        </div>
                                      )}

                                      <InlineStack
                                        align="space-between"
                                        blockAlign="center"
                                      >
                                        <InlineStack gap="300">
                                          {item.handle && (
                                            <div
                                              style={{
                                                backgroundColor: "#F4F5F7",
                                                padding: "4px 8px",
                                                borderRadius: "4px",
                                              }}
                                            >
                                              <Text
                                                variant="bodySm"
                                                color="subdued"
                                              >
                                                {item.handle}
                                              </Text>
                                            </div>
                                          )}
                                          {contentType === "discounts" && (
                                            <>
                                              {item.code && (
                                                <div
                                                  style={{
                                                    backgroundColor: "#F0F7FF",
                                                    padding: "4px 8px",
                                                    borderRadius: "4px",
                                                    border: "1px solid #B3D7FF",
                                                  }}
                                                >
                                                  <Text
                                                    variant="bodySm"
                                                    color="highlight"
                                                  >
                                                    {item.code}
                                                  </Text>
                                                </div>
                                              )}
                                              {item.type && (
                                                <div
                                                  style={{
                                                    backgroundColor: "#F4F5F7",
                                                    padding: "4px 8px",
                                                    borderRadius: "4px",
                                                  }}
                                                >
                                                  <Text
                                                    variant="bodySm"
                                                    color="subdued"
                                                  >
                                                    {item.type
                                                      .replace("Discount", "")
                                                      .replace(
                                                        /([A-Z])/g,
                                                        " $1",
                                                      )
                                                      .trim()}
                                                  </Text>
                                                </div>
                                              )}
                                              {item.status && (
                                                <div
                                                  style={{
                                                    backgroundColor:
                                                      item.status === "ACTIVE"
                                                        ? "#E3F5E1"
                                                        : "#FFF4E4",
                                                    padding: "4px 8px",
                                                    borderRadius: "4px",
                                                  }}
                                                >
                                                  <Text
                                                    variant="bodySm"
                                                    tone={
                                                      item.status === "ACTIVE"
                                                        ? "success"
                                                        : "caution"
                                                    }
                                                  >
                                                    {item.status}
                                                  </Text>
                                                </div>
                                              )}
                                            </>
                                          )}
                                        </InlineStack>

                                        {item.url && (
                                          <Link
                                            url={(() => {
                                              // Try to get domain from multiple sources
                                              let domain = "";

                                              // Option 1: Try to get from websiteData.url
                                              if (
                                                fetcher.data?.websiteData?.url
                                              ) {
                                                try {
                                                  const websiteUrl = new URL(
                                                    fetcher.data?.websiteData?.url,
                                                  );
                                                  domain = websiteUrl.hostname;
                                                } catch (e) {
                                                  console.error(
                                                    "Failed to parse websiteData.url:",
                                                    e,
                                                  );
                                                }
                                              }

                                              // Option 2: Try to get from websiteData.domain
                                              if (
                                                !domain &&
                                                fetcher.data?.websiteData
                                                  ?.domain
                                              ) {
                                                domain =
                                                  fetcher.data?.websiteData
                                                    ?.domain;
                                              }

                                              // Option 3: Fall back to the shop URL if set in session
                                              if (
                                                !domain &&
                                                typeof window !== "undefined"
                                              ) {
                                                // Get the shop name from the URL if possible
                                                const shopParam =
                                                  new URLSearchParams(
                                                    window.location.search,
                                                  ).get("shop");
                                                if (shopParam) {
                                                  domain = shopParam;
                                                }
                                              }

                                              // If we still don't have a domain, log an error and use myshopify.com domain
                                              if (!domain) {
                                                console.error(
                                                  "WARNING: Could not determine shop domain for URL construction",
                                                );
                                                // Get the current path
                                                if (
                                                  typeof window !== "undefined"
                                                ) {
                                                  // Extract shop name from path if possible
                                                  const pathMatch =
                                                    window.location.pathname.match(
                                                      /\/([^\/]+)\/apps\//,
                                                    );
                                                  if (
                                                    pathMatch &&
                                                    pathMatch[1]
                                                  ) {
                                                    domain = `${pathMatch[1]}.myshopify.com`;
                                                  }
                                                }
                                              }

                                              // Final fallback
                                              if (!domain) {
                                                domain =
                                                  "your-shop-url.myshopify.com";
                                              }

                                              const handle =
                                                item.handle ||
                                                item.url.split("/").pop();
                                              console.log(
                                                "Using domain:",
                                                domain,
                                              );
                                              console.log(
                                                "Item URL:",
                                                item.url,
                                              );

                                              // Check for home page special case
                                              if (
                                                item.url === "/pages//" ||
                                                item.url === "/pages/"
                                              ) {
                                                return `https://${domain}/`;
                                              }

                                              // If the URL already starts with http, use it as is
                                              if (item.url.startsWith("http")) {
                                                return item.url;
                                              }

                                              // For blog posts, use the URL directly as it's already well-formed
                                              if (
                                                contentType === "blogPosts" &&
                                                item.url &&
                                                item.url.includes("/blogs/")
                                              ) {
                                                return `https://${domain}${item.url}`;
                                              }

                                              // Build URL based on content type
                                              switch (contentType) {
                                                case "blogPosts":
                                                  // For blog posts, prefer the full URL if available as it contains both blog handle and post handle
                                                  if (
                                                    item.url &&
                                                    item.url.includes("/blogs/")
                                                  ) {
                                                    return `https://${domain}${item.url}`;
                                                  }
                                                  return `https://${domain}/blogs/${item.blogHandle || "news"}/${handle}`;
                                                case "products":
                                                  return `https://${domain}/products/${handle}`;
                                                case "pages":
                                                  // Check if this is a policy page
                                                  const policyTerms = [
                                                    "privacy_policy",
                                                    "privacy-policy",
                                                    "return_policy",
                                                    "return-policy",
                                                    "refund_policy",
                                                    "refund-policy",
                                                    "contact_information",
                                                    "contact-information",
                                                    "terms_of_service",
                                                    "terms-of-service",
                                                    "shipping_policy",
                                                    "shipping-policy",
                                                    "data_sale_opt_out",
                                                    "data-sale-opt-out",
                                                  ];

                                                  // Check if it's a policy page (either with underscore or hyphen format)
                                                  if (
                                                    policyTerms.includes(handle)
                                                  ) {
                                                    // Convert underscores to hyphens for policy pages
                                                    const policyHandle =
                                                      handle.replace(/_/g, "-");
                                                    return `https://${domain}/policies/${policyHandle}`;
                                                  }

                                                  // Regular page
                                                  return `https://${domain}/pages/${handle}`;
                                                case "collections":
                                                  return `https://${domain}/collections/${handle}`;
                                                default:
                                                  // Fallback to original URL format
                                                  return `https://${domain}${item.url.startsWith("/") ? item.url : `/${item.url}`}`;
                                              }
                                            })()}
                                            external
                                          >
                                            <Button
                                              size="slim"
                                              icon={ExternalIcon}
                                            >
                                              View
                                            </Button>
                                          </Link>
                                        )}
                                      </InlineStack>
                                    </BlockStack>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </BlockStack>
                  </div>
                </BlockStack>
              ) : (
                /* Error State */
                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "12px",
                    padding: "24px",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                  }}
                >
                  <Banner status="critical">
                    <p>
                      Unable to connect:{" "}
                      {fetcher.data?.error || "Please try again"}
                    </p>
                  </Banner>
                </div>
              )
            ) : (
              /* Connection Options */
              <BlockStack gap="600">
                {/* Welcome Card */}
                <div
                  style={{
                    backgroundColor: "white",
                    borderRadius: "16px",
                    padding: "32px 32px 24px 32px",
                    boxShadow: "0 10px 20px rgba(16, 24, 40, 0.06)",
                    border: "1px solid #EEF2F7",
                  }}
                >
                  <BlockStack gap="500" align="center">
                    <div
                      style={{
                        width: "88px",
                        height: "88px",
                        borderRadius: "20px",
                        background:
                          "linear-gradient(135deg, #5C6AC4 0%, #202E78 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 10px 20px rgba(16,24,40,0.08)",
                      }}
                    >
                      <Icon source={ChatIcon} color="base" />
                    </div>
                    <BlockStack gap="100" align="center">
                      <Text
                        variant="headingXl"
                        fontWeight="bold"
                        alignment="center"
                      >
                        Connect Your AI Assistant
                      </Text>
                      <Text variant="bodyMd" color="subdued" alignment="center">
                        Choose how you'd like to connect your Voicero AI
                        assistant
                      </Text>
                    </BlockStack>

                    {/* Steps Overview */}
                    <div
                      style={{
                        width: "100%",
                        backgroundColor: "#F9FAFB",
                        borderRadius: 12,
                        padding: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: 12,
                        }}
                      >
                        {[
                          {
                            icon: GlobeIcon,
                            label: "1. Quick Connect",
                            sub: "Fastest setup",
                          },
                          {
                            icon: KeyIcon,
                            label: "2. Manual Key",
                            sub: "Use existing key",
                          },
                          {
                            icon: CheckIcon,
                            label: "3. Activate in Theme",
                            sub: "Enable embed",
                          },
                        ].map((step, i) => (
                          <div
                            key={i}
                            style={{
                              backgroundColor: "white",
                              borderRadius: 10,
                              padding: 12,
                              border: "1px solid #EEF2F7",
                              transition:
                                "transform 0.15s ease, box-shadow 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform =
                                "translateY(-2px)";
                              e.currentTarget.style.boxShadow =
                                "0 8px 16px rgba(16,24,40,0.08)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          >
                            <InlineStack gap="200" blockAlign="center">
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  backgroundColor: "#F4F5FA",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <Icon source={step.icon} color="subdued" />
                              </div>
                              <BlockStack gap="0">
                                <Text variant="bodyMd" fontWeight="semibold">
                                  {step.label}
                                </Text>
                                <Text variant="bodySm" color="subdued">
                                  {step.sub}
                                </Text>
                              </BlockStack>
                            </InlineStack>
                          </div>
                        ))}
                      </div>
                    </div>
                  </BlockStack>
                </div>

                {/* Connection Options */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 20,
                  }}
                >
                  <div
                    style={{
                      backgroundColor: "white",
                      borderRadius: 12,
                      padding: 24,
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                      border: "2px solid transparent",
                      position: "relative",
                      transition:
                        "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow =
                        "0 8px 16px rgba(16,24,40,0.08)";
                      e.currentTarget.style.borderColor = "#E3F5E1";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        "0 1px 3px rgba(0, 0, 0, 0.1)";
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "16px",
                        right: "16px",
                        backgroundColor: "#E3F5E1",
                        color: "#108043",
                        padding: "4px 12px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                    >
                      Recommended
                    </div>
                    <BlockStack gap="600">
                      <InlineStack gap="300" blockAlign="center">
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "12px",
                            backgroundColor: "#E3F5E1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon source={GlobeIcon} color="success" />
                        </div>
                        <Text variant="headingMd" fontWeight="semibold">
                          Quick Connect
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd">
                        The fastest way to get started. Connect with a single
                        click.
                      </Text>
                      <ul
                        style={{ margin: 0, paddingLeft: 18, color: "#6B7280" }}
                      >
                        <li style={{ marginBottom: 6 }}>
                          Auto‑installs required settings
                        </li>
                        <li style={{ marginBottom: 6 }}>
                          No code changes needed
                        </li>
                        <li>Takes under a minute</li>
                      </ul>
                      <Button
                        primary
                        fullWidth
                        size="large"
                        onClick={handleQuickConnect}
                        loading={
                          isLoading &&
                          fetcher.formData?.get("action") === "quick_connect"
                        }
                      >
                        Connect Automatically
                      </Button>
                    </BlockStack>
                  </div>

                  <div
                    style={{
                      backgroundColor: "white",
                      borderRadius: 12,
                      padding: 24,
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow =
                        "0 8px 16px rgba(16,24,40,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow =
                        "0 1px 3px rgba(0, 0, 0, 0.1)";
                    }}
                  >
                    <BlockStack gap="600">
                      <InlineStack gap="300" blockAlign="center">
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "12px",
                            backgroundColor: "#F4F5FA",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon source={KeyIcon} color="subdued" />
                        </div>
                        <Text variant="headingMd" fontWeight="semibold">
                          Manual Setup
                        </Text>
                      </InlineStack>
                      <Text variant="bodyMd">
                        Have an access key? Enter it manually to connect.
                      </Text>
                      <ul
                        style={{ margin: 0, paddingLeft: 18, color: "#6B7280" }}
                      >
                        <li style={{ marginBottom: 6 }}>
                          Use an existing access key
                        </li>
                        <li style={{ marginBottom: 6 }}>
                          Keeps full control over settings
                        </li>
                        <li>Great for advanced setups</li>
                      </ul>
                      <BlockStack gap="300">
                        <TextField
                          label="Access Key"
                          labelHidden
                          value={accessKey}
                          onChange={setAccessKey}
                          autoComplete="off"
                          placeholder="Enter your access key"
                          disabled={isConnecting}
                        />
                        <Button
                          fullWidth
                          size="large"
                          loading={isConnecting}
                          onClick={handleManualConnect}
                          disabled={!accessKey}
                        >
                          Connect with Key
                        </Button>
                        <Text
                          variant="bodySm"
                          color="subdued"
                          alignment="center"
                        >
                          Where to find your key? {""}
                          <Link
                            url="https://voicero.com/docs/access-key"
                            external
                          >
                            Read the guide
                          </Link>
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  </div>
                </div>

                {/* Help Section */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      backgroundColor: "#F9FAFB",
                      borderRadius: 12,
                      padding: 16,
                      border: "1px solid #E4E5E7",
                    }}
                  >
                    <InlineStack gap="200" blockAlign="center">
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          backgroundColor: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                        }}
                      >
                        <Icon source={QuestionCircleIcon} color="subdued" />
                      </div>
                      <BlockStack gap="0">
                        <Text variant="bodyMd" fontWeight="semibold">
                          Read the docs
                        </Text>
                        <Text variant="bodySm" color="subdued">
                          Step-by-step setup and troubleshooting
                        </Text>
                      </BlockStack>
                      <Button
                        size="slim"
                        onClick={() =>
                          window.open("https://voicero.com/docs", "_blank")
                        }
                      >
                        Open
                      </Button>
                    </InlineStack>
                  </div>
                  <div
                    style={{
                      backgroundColor: "#F9FAFB",
                      borderRadius: 12,
                      padding: 16,
                      border: "1px solid #E4E5E7",
                    }}
                  >
                    <InlineStack gap="200" blockAlign="center">
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          backgroundColor: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                        }}
                      >
                        <Icon source={InfoIcon} color="highlight" />
                      </div>
                      <BlockStack gap="0">
                        <Text variant="bodyMd" fontWeight="semibold">
                          Contact support
                        </Text>
                        <Text variant="bodySm" color="subdued">
                          We're here to help you get live
                        </Text>
                      </BlockStack>
                      <Button
                        size="slim"
                        onClick={() =>
                          window.open("https://voicero.com/support", "_blank")
                        }
                      >
                        Get help
                      </Button>
                    </InlineStack>
                  </div>
                </div>
              </BlockStack>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Activation Guide Banner */}
      {showActivationGuide && (
        <div
          style={{
            position: "fixed",
            top: "0",
            left: "0",
            right: "0",
            backgroundColor: "#F0F7FF",
            padding: "16px",
            zIndex: "100",
            borderBottom: "1px solid #B3D7FF",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <Icon source={InfoIcon} color="highlight" />
                <Text variant="bodyMd" fontWeight="semibold">
                  Complete Setup: Add the Assistant to Your Theme
                </Text>
              </InlineStack>
              <Button
                size="slim"
                plain
                onClick={() => setShowActivationGuide(false)}
                icon={
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M13.4143 6.58579C13.7043 6.29529 14.1791 6.29529 14.4696 6.58579C14.7601 6.87628 14.7601 7.35114 14.4696 7.64164L11.1157 10.9956L14.4696 14.3495C14.7601 14.64 14.7601 15.1149 14.4696 15.4054C14.1791 15.6959 13.7043 15.6959 13.4143 15.4054L10.0604 12.0515L6.70651 15.4054C6.41602 15.6959 5.94115 15.6959 5.65066 15.4054C5.36016 15.1149 5.36016 14.64 5.65066 14.3495L9.00457 10.9956L5.65066 7.64164C5.36016 7.35114 5.36016 6.87628 5.65066 6.58579C5.94115 6.29529 6.41602 6.29529 6.70651 6.58579L10.0604 9.93969L13.4143 6.58579Z"
                      fill="currentColor"
                    />
                  </svg>
                }
              />
            </InlineStack>

            <div style={{ marginTop: "12px" }}>
              <Text variant="bodyMd">
                To finish setup and display your AI assistant on your store,
                follow these steps:
              </Text>
              <ol style={{ marginTop: "12px", paddingLeft: "24px" }}>
                <li style={{ marginBottom: "8px" }}>
                  <Text variant="bodyMd">
                    Go to <strong>Online Store</strong> →{" "}
                    <strong>Themes</strong> in your Shopify admin
                  </Text>
                </li>
                <li style={{ marginBottom: "8px" }}>
                  <Text variant="bodyMd">
                    Click the <strong>Customize</strong> button on your active
                    theme
                  </Text>
                </li>
                <li style={{ marginBottom: "8px" }}>
                  <Text variant="bodyMd">
                    In the sidebar, click <strong>App embeds</strong>
                  </Text>
                </li>
                <li>
                  <Text variant="bodyMd">
                    Find <strong>Voicero AI Assistant</strong> and toggle it{" "}
                    <strong>ON</strong>
                  </Text>
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
