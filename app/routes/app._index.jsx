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

  // State for UI and data
  const fetcher = useFetcher();
  const app = useAppBridge();
  const isLoading = fetcher.state === "submitting";

  // Add this state for contacts data
  const [contactsData, setContactsData] = useState([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [contactsError, setContactsError] = useState(null);

  // Add function to fetch contacts data
  const fetchContacts = async () => {
    if (!accessKey) return;

    try {
      setIsLoadingContacts(true);
      setContactsError(null);

      const response = await fetch("/api/contacts");
      const data = await response.json();

      if (data.success && data.contactsData) {
        setContactsData(data.contactsData);
      } else {
        setContactsError(data.error || "Failed to fetch contacts");
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
      setContactsError("Failed to fetch contacts");
    } finally {
      setIsLoadingContacts(false);
    }
  };

  // Add useEffect to fetch contacts when component mounts or accessKey changes
  useEffect(() => {
    if (accessKey && fetcher.data?.success) {
      fetchContacts();
    }
  }, [accessKey, fetcher.data?.success]);

  // Add useEffect to trigger auto-sync when page loads and connection is established
  useEffect(() => {
    if (
      accessKey && 
      fetcher.data?.success && 
      fetcher.data?.websiteData
    ) {
      // Trigger auto-sync in the background
      const performAutoSync = async () => {
        try {
          console.log("Auto-sync: Triggering background sync...");
          const response = await fetch("/api/autoSync");
          const data = await response.json();
          
          if (data.success) {
            console.log("Auto-sync: Successfully completed");
          } else {
            console.log("Auto-sync: Failed -", data.error);
          }
        } catch (error) {
          console.log("Auto-sync: Error -", error.message);
          // Silent failure - don't show user errors for background sync
        }
      };

      // Add a small delay to ensure page is fully loaded
      const timeoutId = setTimeout(performAutoSync, 2000);
      
      // Cleanup timeout on unmount
      return () => clearTimeout(timeoutId);
    }
  }, [accessKey, fetcher.data?.success, fetcher.data?.websiteData]);

  // Calculate unread contacts
  const unreadContacts = contactsData.filter((contact) => !contact.read).length;

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
      const response = await fetch("/api/website/get");
      const data = await response.json();
      console.log("websites/get data: ", data);

      if (data.success && data.websiteData) {
        setExtendedWebsiteData(data.websiteData);
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
            {accessKey && fetcher.data?.success && contactsData.length > 0 && (
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "12px",
                  padding: "24px",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                  marginBottom: "16px",
                }}
              >
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="200">
                    <Text variant="headingLg" fontWeight="semibold">
                      Customer Contacts
                    </Text>
                    <Text variant="bodyMd" color="subdued">
                      Messages from your store visitors
                    </Text>
                  </BlockStack>

                  <InlineStack gap="400" blockAlign="center">
                    {isLoadingContacts ? (
                      <Spinner size="small" />
                    ) : (
                      <>
                        {unreadContacts > 0 && (
                          <div
                            style={{
                              backgroundColor: "#FCF1CD",
                              borderRadius: "20px",
                              padding: "4px 12px",
                              border: "1px solid #EEC200",
                            }}
                          >
                            <Text
                              variant="bodySm"
                              fontWeight="semibold"
                              tone="warning"
                            >
                              {unreadContacts} unread message
                              {unreadContacts !== 1 ? "s" : ""}
                            </Text>
                          </div>
                        )}
                        <Link url="https://www.voicero.ai/app/contacts">
                          <Button primary={unreadContacts > 0} icon={ChatIcon}>
                            View Contacts
                          </Button>
                        </Link>
                      </>
                    )}
                  </InlineStack>
                </InlineStack>
              </div>
            )}
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
                      backgroundColor: "white",
                      borderRadius: "12px",
                      padding: "24px",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    <BlockStack gap="600">
                      {/* Header Section */}
                      <InlineStack align="space-between" blockAlign="start">
                        <InlineStack gap="400" blockAlign="center">
                          <div
                            style={{
                              width: "48px",
                              height: "48px",
                              borderRadius: "12px",
                              backgroundColor: fetcher.data?.websiteData?.active
                                ? "#E3F5E1"
                                : "#FFF4E4",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
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
                            <Text variant="headingLg" fontWeight="semibold">
                              {fetcher.data?.websiteData?.name}
                            </Text>
                            <Link
                              url={fetcher.data?.websiteData?.url}
                              external
                              monochrome
                            >
                              <Text variant="bodySm" color="subdued">
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
                              padding: "6px 16px",
                              borderRadius: "20px",
                            }}
                          >
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

                      {/* Quick Stats Grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: "20px",
                        }}
                      >
                        <BlockStack gap="200">
                          <Text variant="bodySm" color="subdued">
                            Plan Type
                          </Text>
                          <Text variant="headingMd" fontWeight="semibold">
                            {fetcher.data?.websiteData?.plan || (
                              <InlineStack gap="200" blockAlign="center">
                                <Text
                                  variant="headingMd"
                                  fontWeight="semibold"
                                  tone="warning"
                                >
                                  No Active Plan
                                </Text>
                                <div
                                  style={{
                                    backgroundColor: "#FFF4E4",
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    border: "1px solid #FFECCC",
                                  }}
                                >
                                  <Text variant="bodySm" tone="warning">
                                    Limited Access
                                  </Text>
                                </div>
                              </InlineStack>
                            )}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="200">
                          <Text variant="bodySm" color="subdued">
                            Monthly Queries
                          </Text>
                          <InlineStack gap="200" blockAlign="baseline">
                            <Text variant="headingMd" fontWeight="semibold">
                              {fetcher.data?.websiteData?.monthlyQueries || 0}
                            </Text>
                            <Text variant="bodySm" color="subdued">
                              {fetcher.data?.websiteData?.plan === "Beta"
                                ? "/ Unlimited"
                                : fetcher.data?.websiteData?.plan ===
                                    "Enterprise"
                                  ? "/ Pay per query"
                                  : fetcher.data?.websiteData?.plan ===
                                      "Starter"
                                    ? "/ 1000"
                                    : `/ ${fetcher.data?.websiteData?.queryLimit || 0}`}
                            </Text>
                          </InlineStack>
                        </BlockStack>
                        <BlockStack gap="200">
                          <Text variant="bodySm" color="subdued">
                            Last Synced
                          </Text>
                          <Text
                            variant="headingMd"
                            fontWeight="semibold"
                            tone={
                              fetcher.data?.websiteData?.lastSyncedAt &&
                              fetcher.data?.websiteData?.lastSyncedAt !==
                                "Never"
                                ? "success"
                                : "caution"
                            }
                          >
                            {fetcher.data?.websiteData?.lastSyncedAt
                              ? fetcher.data?.websiteData?.lastSyncedAt ===
                                "Never"
                                ? "Never"
                                : new Date(
                                    fetcher.data?.websiteData?.lastSyncedAt,
                                  ).toLocaleDateString()
                              : "Never"}
                          </Text>
                        </BlockStack>
                      </div>
                    </BlockStack>
                  </div>

                  {/* NEW: Extended Analytics Card
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
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="200">
                            <Text variant="headingLg" fontWeight="semibold">
                              Conversation Analytics
                            </Text>
                            <Text variant="bodyMd" color="subdued">
                              Insights into how customers interact with your AI
                              assistant
                            </Text>
                          </BlockStack>
                          <Button
                            onClick={fetchExtendedWebsiteData}
                            loading={isLoadingExtendedData}
                            icon={RefreshIcon}
                            disabled={!fetcher.data?.websiteData?.plan}
                          >
                            Refresh Data
                          </Button>
                        </InlineStack>

                        {isLoadingExtendedData && !extendedWebsiteData ? (
                          <div style={{ padding: "32px", textAlign: "center" }}>
                            <BlockStack gap="400" align="center">
                              <Spinner size="large" />
                              <Text variant="bodyMd" color="subdued">
                                Loading analytics data...
                              </Text>
                            </BlockStack>
                          </div>
                        ) : extendedWebsiteData ? (
                          <div
                            style={{
                              backgroundColor: "#F9FAFB",
                              borderRadius: "12px",
                              padding: "20px",
                              display: "grid",
                              gridTemplateColumns: "repeat(4, 1fr)",
                              gap: "20px",
                            }}
                          >
                            {[
                              {
                                icon: DataPresentationIcon,
                                count:
                                  extendedWebsiteData.stats?.totalRedirects ||
                                  0,
                                label: "Total Redirects",
                              },
                              {
                                icon: CalendarIcon,
                                count: Math.round(
                                  extendedWebsiteData.stats?.redirectRate || 0,
                                ),
                                label: "Redirect Rate %",
                                isPercentage: true,
                              },
                              {
                                icon: ChatIcon,
                                count:
                                  extendedWebsiteData.globalStats
                                    ?.totalTextChats || 0,
                                label: "Text Chats",
                              },
                              {
                                icon: ToggleOnIcon,
                                count:
                                  extendedWebsiteData.globalStats
                                    ?.totalVoiceChats || 0,
                                label: "Voice Chats",
                              },
                            ].map((item, index) => (
                              <div key={index} style={{ textAlign: "center" }}>
                                <BlockStack gap="300" align="center">
                                  <div
                                    style={{
                                      width: "48px",
                                      height: "48px",
                                      backgroundColor: "white",
                                      borderRadius: "12px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      margin: "0 auto",
                                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                                    }}
                                  >
                                    <Icon source={item.icon} color="base" />
                                  </div>
                                  <Text variant="heading2xl" fontWeight="bold">
                                    {item.count}
                                    {item.isPercentage ? "%" : ""}
                                  </Text>
                                  <Text variant="bodySm" color="subdued">
                                    {item.label}
                                  </Text>
                                </BlockStack>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ padding: "32px", textAlign: "center" }}>
                            <Text variant="bodyMd" color="subdued">
                              No analytics data available
                            </Text>
                          </div>
                        )}
                      </BlockStack>
                    </div>
                  )} */}

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
                          <Text variant="headingLg" fontWeight="semibold">
                            Action Statistics
                          </Text>
                          <Text variant="bodyMd" color="subdued">
                            How customers are interacting with your AI assistant
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
                              display: "grid",
                              gridTemplateColumns: "repeat(4, 1fr)",
                              gap: "20px",
                            }}
                          >
                            {[
                              {
                                icon: DataPresentationIcon,
                                count:
                                  extendedWebsiteData.globalStats
                                    ?.totalAiRedirects || 0,
                                label: "Redirects",
                              },
                              {
                                icon: CheckIcon,
                                count:
                                  extendedWebsiteData.globalStats
                                    ?.totalAiPurchases || 0,
                                label: "Purchases",
                              },
                              {
                                icon: InfoIcon,
                                count:
                                  extendedWebsiteData.globalStats
                                    ?.totalAiClicks || 0,
                                label: "Clicks",
                              },
                              {
                                icon: RefreshIcon,
                                count:
                                  extendedWebsiteData.globalStats
                                    ?.totalAiScrolls || 0,
                                label: "Scrolls",
                              },
                            ].map((item, index) => (
                              <div key={index} style={{ textAlign: "center" }}>
                                <BlockStack gap="300" align="center">
                                  <div
                                    style={{
                                      width: "48px",
                                      height: "48px",
                                      backgroundColor: "white",
                                      borderRadius: "12px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      margin: "0 auto",
                                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                                    }}
                                  >
                                    <Icon source={item.icon} color="base" />
                                  </div>
                                  <Text variant="heading2xl" fontWeight="bold">
                                    {item.count}
                                  </Text>
                                  <Text variant="bodySm" color="subdued">
                                    {item.label}
                                  </Text>
                                </BlockStack>
                              </div>
                            ))}
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
                        <Button
                          onClick={handleSync}
                          loading={isSyncing}
                          icon={RefreshIcon}
                          primary={
                            !fetcher.data?.websiteData?.lastSyncedAt ||
                            fetcher.data?.websiteData?.lastSyncedAt === "Never"
                          }
                          disabled={!fetcher.data?.websiteData?.plan}
                        >
                          {isSyncing ? "Syncing..." : "Sync Content"}
                        </Button>
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
                            gridTemplateColumns: "repeat(5, 1fr)",
                            gap: "16px",
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
                            },
                            {
                              icon: PageIcon,
                              count:
                                extendedWebsiteData?.content?.pages?.length ||
                                0,
                              label: "Pages",
                              id: "pages",
                            },
                            {
                              icon: BlogIcon,
                              count:
                                extendedWebsiteData?.content?.blogPosts
                                  ?.length || 0,
                              label: "Blog Posts",
                              id: "blogPosts",
                            },
                            {
                              icon: CollectionIcon,
                              count:
                                extendedWebsiteData?.content?.collections
                                  ?.length || 0,
                              label: "Collections",
                              id: "collections",
                            },
                            {
                              icon: DiscountIcon,
                              count:
                                extendedWebsiteData?.content?.discounts
                                  ?.length || 0,
                              label: "Discounts",
                              id: "discounts",
                            },
                          ].map((item, index) => (
                            <div
                              key={index}
                              style={{
                                backgroundColor:
                                  selectedContentTab === index
                                    ? "#EBF5FF"
                                    : "white",
                                borderRadius: "8px",
                                padding: "16px",
                                cursor: "pointer",
                                border:
                                  selectedContentTab === index
                                    ? "1px solid #B3D7FF"
                                    : "1px solid #E4E5E7",
                                transition: "all 0.2s ease",
                              }}
                              onClick={() => setSelectedContentTab(index)}
                            >
                              <BlockStack gap="300" align="center">
                                <div
                                  style={{
                                    width: "40px",
                                    height: "40px",
                                    backgroundColor:
                                      selectedContentTab === index
                                        ? "#DEEBFF"
                                        : "#F4F5F7",
                                    borderRadius: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Icon
                                    source={item.icon}
                                    color={
                                      selectedContentTab === index
                                        ? "highlight"
                                        : "base"
                                    }
                                  />
                                </div>
                                <Text variant="heading2xl" fontWeight="bold">
                                  {item.count}
                                </Text>
                                <Text
                                  variant="bodySm"
                                  color={
                                    selectedContentTab === index
                                      ? "highlight"
                                      : "subdued"
                                  }
                                >
                                  {item.label}
                                </Text>
                              </BlockStack>
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
                              <div style={{ display: "grid", gridGap: "16px" }}>
                                {contentItems.map((item, index) => (
                                  <div
                                    key={index}
                                    style={{
                                      backgroundColor: "white",
                                      borderRadius: "8px",
                                      padding: "16px",
                                      boxShadow:
                                        "0 1px 2px rgba(0, 0, 0, 0.05)",
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
                                            paddingLeft: "4px",
                                            borderLeft: "3px solid #F4F5F7",
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
                    borderRadius: "12px",
                    padding: "48px",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                    textAlign: "center",
                  }}
                >
                  <BlockStack gap="600" align="center">
                    <div
                      style={{
                        width: "80px",
                        height: "80px",
                        borderRadius: "50%",
                        background:
                          "linear-gradient(135deg, #5C6AC4 0%, #202E78 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto",
                      }}
                    >
                      <Icon source={ChatIcon} color="base" />
                    </div>
                    <BlockStack gap="200" align="center">
                      <Text
                        variant="headingXl"
                        fontWeight="bold"
                        alignment="center"
                      >
                        Connect Your AI Assistant
                      </Text>
                      <Text variant="bodyLg" color="subdued" alignment="center">
                        Choose how you'd like to connect your Voicero AI
                        assistant
                      </Text>
                    </BlockStack>
                  </BlockStack>
                </div>

                {/* Connection Options */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "20px",
                  }}
                >
                  <div
                    style={{
                      backgroundColor: "white",
                      borderRadius: "12px",
                      padding: "24px",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                      border: "2px solid transparent",
                      position: "relative",
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
                      borderRadius: "12px",
                      padding: "24px",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
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
                      </BlockStack>
                    </BlockStack>
                  </div>
                </div>

                {/* Help Section */}
                <div
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    border: "1px solid #E4E5E7",
                  }}
                >
                  <InlineStack align="center" gap="300">
                    <Icon source={QuestionCircleIcon} color="subdued" />
                    <Text variant="bodyMd" color="subdued">
                      Need help? Check out our{" "}
                      <Link url="https://voicero.com/docs" external>
                        documentation
                      </Link>{" "}
                      or{" "}
                      <Link url="https://voicero.com/support" external>
                        contact support
                      </Link>
                    </Text>
                  </InlineStack>
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
