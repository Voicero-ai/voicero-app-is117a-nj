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

// Add new helper function to check training status
const checkTrainingStatus = async (
  accessKey,
  setUntrainedItems,
  setItemsInTraining,
) => {
  const response = await fetch(`${urls.voiceroApi}/api/shopify/train/status`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessKey}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Failed to check training status: ${errorData.error || "Unknown error"}`,
    );
  }

  const data = await response.json();

  // Separate items into untrained and in-training
  const untrained = {
    products: [],
    pages: [],
    posts: [], // Changed from blogPosts to posts
    collections: [],
    discounts: [],
  };

  const inTraining = {
    products: [],
    pages: [],
    posts: [], // Changed from blogPosts to posts
    collections: [],
    discounts: [],
  };

  // Process each category
  Object.keys(data).forEach((category) => {
    data[category].forEach((item) => {
      if (item.isTraining) {
        inTraining[category].push(item);
      } else if (!item.trained) {
        untrained[category].push(item);
      }
    });
  });

  // Update items in training state
  setItemsInTraining(inTraining);

  // Check if any items are currently being trained or need training
  const hasItemsInTraining = Object.values(inTraining).some(
    (items) => items.length > 0,
  );
  const hasUntrainedItems = Object.values(untrained).some(
    (items) => items.length > 0,
  );

  // Show training banner if we have either items in training or untrained items
  if (hasItemsInTraining || hasUntrainedItems) {
    setTrainingData({
      status: "processing",
      progress: 0,
      message: hasItemsInTraining
        ? "Content training in progress..."
        : "Content needs training...",
      steps: [],
      currentCategory: 0,
      categories: ["products", "pages", "posts", "collections", "discounts"],
    });
    setIsTraining(true);

    // If we have untrained items and no items in training, start the training process
    if (hasUntrainedItems && !hasItemsInTraining) {
      try {
        await trainUntrainedItems(
          fetcher.data.accessKey,
          untrained,
          setTrainingData,
          setUntrainedItems,
          fetcher.data.websiteData, // Pass websiteData as a parameter
        );
      } catch (error) {
        console.error("Error training untrained items:", error);
        setError(`Failed to train items: ${error.message}`);
      }
    }

    // Set up polling to check status every 15 seconds
    const pollStatus = async () => {
      try {
        const statusResponse = await fetch(
          `${urls.voiceroApi}/api/shopify/train/status`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${fetcher.data.accessKey}`,
            },
          },
        );

        if (!statusResponse.ok) {
          throw new Error(
            `Failed to check training status: ${statusResponse.status}`,
          );
        }

        const statusData = await statusResponse.json();

        // Process the status data
        const polledUntrained = {
          products: [],
          pages: [],
          posts: [], // Changed from blogPosts to posts
          collections: [],
          discounts: [],
        };

        const polledInTraining = {
          products: [],
          pages: [],
          posts: [], // Changed from blogPosts to posts
          collections: [],
          discounts: [],
        };

        Object.keys(statusData).forEach((category) => {
          statusData[category].forEach((item) => {
            if (item.isTraining) {
              polledInTraining[category].push(item);
            } else if (!item.trained) {
              polledUntrained[category].push(item);
            }
          });
        });

        // Update states
        setItemsInTraining(polledInTraining);
        setUntrainedItems(polledUntrained);

        // Check if everything is done
        const stillInTraining = Object.values(polledInTraining).some(
          (items) => items.length > 0,
        );
        const stillUntrained = Object.values(polledUntrained).some(
          (items) => items.length > 0,
        );

        if (stillInTraining || stillUntrained) {
          setTimeout(pollStatus, 15000);
        } else {
          setTrainingData({
            status: "success",
            progress: 100,
            message: `Training complete! Your AI assistant is ready to use. Last synced: ${fetcher.data.websiteData.lastSyncedAt ? new Date(fetcher.data.websiteData.lastSyncedAt).toLocaleString() : "Never"}`,
            currentCategory: 5,
          });
          setIsTraining(false);

          // Reload the page after training completes
          setTimeout(() => {
            window.location.href = "/app";
          }, 2000);
        }
      } catch (error) {
        console.error("Error polling training status:", error);
        setError(`Failed to check training status: ${error.message}`);
      }
    };

    // Start polling
    setTimeout(pollStatus, 15000);
  } else {
    // Only set success state if there are no items in training AND no untrained items

    setTrainingData({
      status: "success",
      progress: 100,
      message: `Training complete! Your AI assistant is ready to use. Last synced: ${fetcher.data.websiteData.lastSyncedAt ? new Date(fetcher.data.websiteData.lastSyncedAt).toLocaleString() : "Never"}`,
      currentCategory: 5,
    });
    setIsTraining(false);
  }

  // Log the current state

  return untrained;
};

// Modify trainUntrainedItems to accept setTrainingData
const trainUntrainedItems = async (
  accessKey,
  untrainedItems,
  setTrainingData,
  setUntrainedItems,
  websiteData, // Add websiteData parameter
) => {
  // Get websiteId from any untrained item (they all belong to the same website)
  const websiteId =
    untrainedItems.products?.[0]?.websiteId ||
    untrainedItems.pages?.[0]?.websiteId ||
    untrainedItems.posts?.[0]?.websiteId ||
    untrainedItems.collections?.[0]?.websiteId ||
    untrainedItems.discounts?.[0]?.websiteId;

  // Check if there are any untrained items
  const hasUntrainedItems = Object.values(untrainedItems).some(
    (items) => items.length > 0,
  );

  // Initialize training state
  setTrainingData({
    status: "processing",
    progress: 0,
    message: "Starting training of all content...",
    steps: [],
    currentCategory: 0,
    categories: ["products", "pages", "posts", "collections", "discounts"],
  });

  let totalItems = 0;
  Object.values(untrainedItems).forEach((items) => {
    totalItems += items.length;
  });
  // Add 1 for general training if needed
  if (hasUntrainedItems && websiteId) {
    totalItems += 1;
  }

  try {
    // Create arrays of promises for each category
    const trainingPromises = [];
    let itemsStarted = 0;

    // Add product training promises
    untrainedItems.products?.forEach((product) => {
      trainingPromises.push(
        trainContentItem(accessKey, "product", product).then(() => {
          itemsStarted++;
          const progress = Math.round((itemsStarted / totalItems) * 100);
          setTrainingData((prev) => ({
            ...prev,
            progress,
            message: `Training in progress: ${itemsStarted}/${totalItems} items complete`,
          }));
        }),
      );
    });

    // Add page training promises
    untrainedItems.pages?.forEach((page) => {
      trainingPromises.push(
        trainContentItem(accessKey, "page", page).then(() => {
          itemsStarted++;
          const progress = Math.round((itemsStarted / totalItems) * 100);
          setTrainingData((prev) => ({
            ...prev,
            progress,
            message: `Training in progress: ${itemsStarted}/${totalItems} items complete`,
          }));
        }),
      );
    });

    // Add blog post training promises
    untrainedItems.posts?.forEach((post) => {
      // Changed from blogPosts to posts
      trainingPromises.push(
        trainContentItem(accessKey, "post", post).then(() => {
          itemsStarted++;
          const progress = Math.round((itemsStarted / totalItems) * 100);
          setTrainingData((prev) => ({
            ...prev,
            progress,
            message: `Training in progress: ${itemsStarted}/${totalItems} items complete`,
          }));
        }),
      );
    });

    // Add collection training promises
    untrainedItems.collections?.forEach((collection) => {
      trainingPromises.push(
        trainContentItem(accessKey, "collection", collection).then(() => {
          itemsStarted++;
          const progress = Math.round((itemsStarted / totalItems) * 100);
          setTrainingData((prev) => ({
            ...prev,
            progress,
            message: `Training in progress: ${itemsStarted}/${totalItems} items complete`,
          }));
        }),
      );
    });

    // Add discount training promises
    untrainedItems.discounts?.forEach((discount) => {
      trainingPromises.push(
        trainContentItem(accessKey, "discount", discount).then(() => {
          itemsStarted++;
          const progress = Math.round((itemsStarted / totalItems) * 100);
          setTrainingData((prev) => ({
            ...prev,
            progress,
            message: `Training in progress: ${itemsStarted}/${totalItems} items complete`,
          }));
        }),
      );
    });

    // Wait for all training promises to complete
    await Promise.all(trainingPromises);

    // After all individual items are trained, train general if needed
    if (hasUntrainedItems && websiteId) {
      setTrainingData((prev) => ({
        ...prev,
        message: "Training general QAs...",
        progress: 95,
      }));

      await fetch(`${urls.voiceroApi}/api/shopify/train/general`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
        body: JSON.stringify({
          websiteId: websiteId,
        }),
      });
    }

    // Clear all untrained items since training is complete
    setUntrainedItems({
      products: [],
      pages: [],
      posts: [], // Changed from blogPosts to posts
      collections: [],
      discounts: [],
    });

    // Set final success state
    setTrainingData((prev) => ({
      ...prev,
      status: "success",
      progress: 100,
      message: `Training complete! Your AI assistant is ready to use. Last synced: ${websiteData?.lastSyncedAt ? new Date(websiteData.lastSyncedAt).toLocaleString() : "Never"}`,
      currentCategory: 5,
    }));

    // Reload the page after training is complete
    setTimeout(() => {
      window.location.href = "/app";
    }, 2000);
  } catch (error) {
    console.error("Error during parallel training:", error);
    setTrainingData((prev) => ({
      ...prev,
      status: "error",
      message: `Training error: ${error.message}`,
    }));
    throw error;
  }
};

// Add new helper function for training individual content
const trainContentItem = async (accessKey, contentType, item) => {
  const response = await fetch(
    `${urls.voiceroApi}/api/shopify/train/${contentType}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        id: item.id,
        vectorId: item.vectorId,
        shopifyId: item.shopifyId,
      }),
    },
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Training failed for ${contentType} ${item.shopifyId}: ${errorData.error || "Unknown error"}`,
    );
  }

  return response.json();
};

// Helper to calculate total items
const calculateTotalItems = (data) => {
  if (!data) return 0;
  const counts = {
    products: data.products?.length || 0,
    pages: data.pages?.length || 0,
    posts: data.posts?.length || 0, // Changed from blogPosts to posts
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
    posts: untrainedItems.posts?.length || 0, // Changed from blogPosts to posts
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
  const [trainingData, setTrainingData] = useState(null);
  const [untrainedItems, setUntrainedItems] = useState({
    products: [],
    pages: [],
    posts: [], // Changed from blogPosts to posts
    collections: [],
    discounts: [],
  });
  const [timeRemaining, setTimeRemaining] = useState(0);
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
    posts: [], // Changed from blogPosts to posts
    collections: [],
    discounts: [],
  });
  const [extendedWebsiteData, setExtendedWebsiteData] = useState(null);
  const [isLoadingExtendedData, setIsLoadingExtendedData] = useState(false);
  const [selectedContentTab, setSelectedContentTab] = useState(0);

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

  // Calculate unread contacts
  const unreadContacts = contactsData.filter((contact) => !contact.read).length;

  // Add function to fetch extended website data
  const fetchExtendedWebsiteData = async () => {
    try {
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
    if (accessKey && fetcher.data?.success && fetcher.data.websiteData) {
      fetchExtendedWebsiteData();
    }
  }, [accessKey, fetcher.data?.success]);

  // Helper to get training progress
  const getTrainingProgress = useCallback(() => {
    // If we have training data with a progress value, use it
    if (trainingData?.progress) {
      const progressValue = parseInt(trainingData.progress);
      if (!isNaN(progressValue)) {
        return progressValue;
      }
    }

    // Calculate progress based on untrained items and items in training
    const totalItems =
      calculateTotalItems(untrainedItems) +
      calculateTotalItems(itemsInTraining);
    const remainingItems = calculateUntrainedItems(untrainedItems);

    if (totalItems === 0) return 0;

    // Calculate progress percentage
    const progress = Math.round(
      ((totalItems - remainingItems) / totalItems) * 100,
    );

    // Ensure progress is between 0 and 100
    return Math.min(Math.max(progress, 0), 100);
  }, [trainingData, untrainedItems, itemsInTraining]);

  // Add useEffect to update time remaining
  useEffect(() => {
    if (trainingData?.status === "processing") {
      // Calculate initial remaining time
      let remainingTime = calculateEstimatedTime(
        untrainedItems,
        trainingData.currentCategory,
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
  }, [trainingData?.status, trainingData?.currentCategory, untrainedItems]);

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

      // Only check status on initial load
      const checkInitialStatus = async () => {
        try {
          const response = await fetch(
            `${urls.voiceroApi}/api/shopify/train/status`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${fetcher.data.accessKey}`,
              },
            },
          );

          if (!response.ok) {
            throw new Error(
              `Failed to check training status: ${response.status}`,
            );
          }

          const data = await response.json();

          // Separate items into untrained and in-training
          const untrained = {
            products: [],
            pages: [],
            posts: [], // Changed from blogPosts to posts
            collections: [],
            discounts: [],
          };

          const inTraining = {
            products: [],
            pages: [],
            posts: [], // Changed from blogPosts to posts
            collections: [],
            discounts: [],
          };

          // Process each category
          Object.keys(data).forEach((category) => {
            data[category].forEach((item) => {
              if (item.isTraining) {
                inTraining[category].push(item);
              } else if (!item.trained) {
                untrained[category].push(item);
              }
            });
          });

          // Update items in training state
          setItemsInTraining(inTraining);
          setUntrainedItems(untrained);

          // Check if any items are currently being trained or need training
          const hasItemsInTraining = Object.values(inTraining).some(
            (items) => items.length > 0,
          );
          const hasUntrainedItems = Object.values(untrained).some(
            (items) => items.length > 0,
          );

          // Show training banner if we have either items in training or untrained items
          if (hasItemsInTraining || hasUntrainedItems) {
            setTrainingData({
              status: "processing",
              progress: 0,
              message: hasItemsInTraining
                ? "Content training in progress..."
                : "Content needs training...",
              steps: [],
              currentCategory: 0,
              categories: [
                "products",
                "pages",
                "posts",
                "collections",
                "discounts",
              ],
            });
            setIsTraining(true);

            // If we have untrained items and no items in training, start the training process
            if (hasUntrainedItems && !hasItemsInTraining) {
              try {
                await trainUntrainedItems(
                  fetcher.data.accessKey,
                  untrained,
                  setTrainingData,
                  setUntrainedItems,
                  fetcher.data.websiteData, // Pass websiteData as a parameter
                );
              } catch (error) {
                console.error("Error training untrained items:", error);
                setError(`Failed to train items: ${error.message}`);
              }
            }

            // Set up polling to check status every 15 seconds
            const pollStatus = async () => {
              try {
                const statusResponse = await fetch(
                  `${urls.voiceroApi}/api/shopify/train/status`,
                  {
                    method: "GET",
                    headers: {
                      "Content-Type": "application/json",
                      Accept: "application/json",
                      Authorization: `Bearer ${fetcher.data.accessKey}`,
                    },
                  },
                );

                if (!statusResponse.ok) {
                  throw new Error(
                    `Failed to check training status: ${statusResponse.status}`,
                  );
                }

                const statusData = await statusResponse.json();

                // Process the status data
                const polledUntrained = {
                  products: [],
                  pages: [],
                  posts: [], // Changed from blogPosts to posts
                  collections: [],
                  discounts: [],
                };

                const polledInTraining = {
                  products: [],
                  pages: [],
                  posts: [], // Changed from blogPosts to posts
                  collections: [],
                  discounts: [],
                };

                Object.keys(statusData).forEach((category) => {
                  statusData[category].forEach((item) => {
                    if (item.isTraining) {
                      polledInTraining[category].push(item);
                    } else if (!item.trained) {
                      polledUntrained[category].push(item);
                    }
                  });
                });

                // Update states
                setItemsInTraining(polledInTraining);
                setUntrainedItems(polledUntrained);

                // Check if everything is done
                const stillInTraining = Object.values(polledInTraining).some(
                  (items) => items.length > 0,
                );
                const stillUntrained = Object.values(polledUntrained).some(
                  (items) => items.length > 0,
                );

                if (stillInTraining || stillUntrained) {
                  setTimeout(pollStatus, 15000);
                } else {
                  setTrainingData({
                    status: "success",
                    progress: 100,
                    message: `Training complete! Your AI assistant is ready to use. Last synced: ${fetcher.data.websiteData.lastSyncedAt ? new Date(fetcher.data.websiteData.lastSyncedAt).toLocaleString() : "Never"}`,
                    currentCategory: 5,
                  });
                  setIsTraining(false);

                  // Reload the page after training completes
                  setTimeout(() => {
                    window.location.href = "/app";
                  }, 2000);
                }
              } catch (error) {
                console.error("Error polling training status:", error);
                setError(`Failed to check training status: ${error.message}`);
              }
            };

            // Start polling
            setTimeout(pollStatus, 15000);
          } else {
            // Only set success state if there are no items in training AND no untrained items

            setTrainingData({
              status: "success",
              progress: 100,
              message: `Training complete! Your AI assistant is ready to use. Last synced: ${fetcher.data.websiteData.lastSyncedAt ? new Date(fetcher.data.websiteData.lastSyncedAt).toLocaleString() : "Never"}`,
              currentCategory: 5,
            });
            setIsTraining(false);
          }

          // Log the current state
        } catch (error) {
          console.error("Error checking initial training status:", error);
          setError(`Failed to check training status: ${error.message}`);
        }
      };

      // Only check status once on initial load
      checkInitialStatus();
    }

    // Check if we got a response with namespace data
    if (fetcher.data?.namespace) {
      setNamespace(fetcher.data.namespace);
    }
    // Check if we have namespace in VectorDbConfig
    else if (fetcher.data?.websiteData?.VectorDbConfig?.namespace) {
      const websiteNamespace =
        fetcher.data.websiteData.VectorDbConfig.namespace;

      setNamespace(websiteNamespace);
    }

    // Log the complete website data in a clean format
    if (fetcher.data?.websiteData) {
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
      setTrainingData(null);

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
      setIsSyncing(true);
      setError("");

      // Step 1: Initial sync

      const syncInitResponse = await fetch("/api/sync", {
        method: "GET",
      });

      const responseText = await syncInitResponse.text();

      let data;
      try {
        data = JSON.parse(responseText);

        // Log the complete data in a clean format
        console.log("Sync API Response:", data);

        // Specifically log the pages data
        console.log("Pages data from sync:", data.pages);

        // Log policy pages specifically
        const policyPages = data.pages.filter((page) => page.isPolicy);
        console.log("Policy pages from sync:", policyPages);

        // If there's an error, log it in a more readable format
        if (data.error) {
        }
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

      const syncResponse = await fetch(`${urls.voiceroApi}/api/shopify/sync`, {
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
      });

      if (!syncResponse.ok) {
        const errorData = await syncResponse.json();
        console.error("Backend sync error:", errorData);
        throw new Error(
          `Sync error! status: ${syncResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      // Step 3: Start vectorization

      setLoadingText(
        "Vectorizing your store content... This may take a few minutes.",
      );

      const vectorizeResponse = await fetch(
        `${urls.voiceroApi}/api/shopify/vectorize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
        },
      );

      if (!vectorizeResponse.ok) {
        const errorData = await vectorizeResponse.json();
        console.error("Vectorization error:", errorData);
        throw new Error(
          `Vectorization error! status: ${vectorizeResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      // Process the regular JSON response
      const vectorizeData = await vectorizeResponse.json();

      // Check if the vectorization was successful
      if (!vectorizeData.success) {
        console.error("Vectorization failed:", vectorizeData.error);
        throw new Error(
          `Vectorization failed: ${vectorizeData.error || "Unknown error"}`,
        );
      }

      // Show some stats if available
      if (vectorizeData.stats) {
        setLoadingText(
          `Vectorization complete! Added ${vectorizeData.stats.added} items to the vector database.`,
        );
      } else {
        setLoadingText("Vectorization completed successfully!");
      }

      // Step 4: Create or get assistant

      setLoadingText("Setting up your AI assistant...");
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

      // After assistant setup, start individual training

      setIsTraining(true);
      setLoadingText("Starting content training process...");

      // Initialize training state
      setTrainingData({
        status: "processing",
        progress: 0,
        message: "Preparing to train content...",
        steps: [],
        currentCategory: 0,
        categories: ["products", "pages", "posts", "collections", "discounts"],
      });

      // Use the parallel training approach
      await trainUntrainedItems(
        accessKey,
        assistantData.content,
        setTrainingData,
        setUntrainedItems,
        assistantData.website,
      );

      // Step 5: Train general QAs

      setLoadingText("Training general QAs...");
      setTrainingData((prev) => ({
        ...prev,
        status: "processing",
        message: "Training general QAs...",
        currentCategory: 5,
      }));

      const generalTrainingResponse = await fetch(
        `${urls.voiceroApi}/api/shopify/train/general`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
          body: JSON.stringify({
            websiteId: websiteId,
          }),
        },
      );

      if (!generalTrainingResponse.ok) {
        const errorData = await generalTrainingResponse.json();
        console.error("General training error:", errorData);
        throw new Error(
          `General training error! status: ${generalTrainingResponse.status}, details: ${
            errorData.error || "unknown error"
          }`,
        );
      }

      const generalTrainingData = await generalTrainingResponse.json();

      // Update training data to show completion
      setTrainingData((prev) => ({
        ...prev,
        status: "success",
        progress: 100,
        message: `Training complete! Your AI assistant is ready to use. Last synced: ${fetcher.data.websiteData.lastSyncedAt ? new Date(fetcher.data.websiteData.lastSyncedAt).toLocaleString() : "Never"}`,
        currentCategory: 6,
      }));

      setLoadingText("Training complete! Your AI assistant is ready to use.");
      setIsSuccess(true);
      setIsSyncing(false);
    } catch (error) {
      console.error("Sync process failed:", error);
      setError(
        <Banner status="critical" onDismiss={() => setError("")}>
          <p>Failed to sync content: {error.message}</p>
        </Banner>,
      );
      setIsSyncing(false);
    }
  };

  // Helper to get formatted training status message
  const getTrainingStatusMessage = useCallback(() => {
    if (!trainingData) return "No training data available";

    // If there's a message, use it
    if (trainingData.message) {
      return trainingData.message;
    }

    const { status, steps, currentCategory, categories } = trainingData;

    if (
      status === "complete" ||
      status === "done" ||
      status === "success" ||
      status === "finished"
    ) {
      return "Training process complete! Your AI assistant is ready.";
    }

    if (!steps || !steps.length) return "Training in progress...";

    // Get the latest step message
    const latestStep = steps[steps.length - 1];

    // Format a more descriptive message
    let progressMessage = latestStep.message;

    // Add category progress if available
    if (currentCategory !== undefined && categories && categories.length) {
      progressMessage += ` (${currentCategory + 1}/${categories.length} categories)`;
    }

    return progressMessage;
  }, [trainingData]);

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
      if (trainingData) {
        // Display status in a banner
        setError(
          <Banner status="info" onDismiss={() => setError("")}>
            <p>Assistant Status:</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(trainingData, null, 2)}
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
      {trainingData && trainingData.status === "processing" && (
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

              <Text variant="bodyMd" color="subdued">
                {getTrainingStatusMessage()}
              </Text>

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

              <InlineStack align="space-between">
                <Text variant="bodySm" color="subdued">
                  Estimated time remaining: {formatTimeRemaining(timeRemaining)}
                </Text>
                <Text variant="bodySm" color="subdued">
                  Please keep this page open
                </Text>
              </InlineStack>
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
                      `${urls.voiceroApi}/app/websites/website?id=${fetcher.data.websiteData.id}`,
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

          {/* Main Content */}
          <BlockStack gap="600">
            {/* NEW: Contacts Card - Add this before the Content Overview section */}
            {accessKey && fetcher.data?.success && (
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
                    ) : contactsError ? (
                      <Text variant="bodyMd" color="critical">
                        Error loading contacts
                      </Text>
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
                              backgroundColor: fetcher.data.websiteData.active
                                ? "#E3F5E1"
                                : "#FFF4E4",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Icon
                              source={
                                fetcher.data.websiteData.active
                                  ? CheckIcon
                                  : InfoIcon
                              }
                              color={
                                fetcher.data.websiteData.active
                                  ? "success"
                                  : "warning"
                              }
                            />
                          </div>
                          <BlockStack gap="100">
                            <Text variant="headingLg" fontWeight="semibold">
                              {fetcher.data.websiteData.name}
                            </Text>
                            <Link
                              url={fetcher.data.websiteData.url}
                              external
                              monochrome
                            >
                              <Text variant="bodySm" color="subdued">
                                {fetcher.data.websiteData.url}
                              </Text>
                            </Link>
                          </BlockStack>
                        </InlineStack>
                        <InlineStack gap="300" blockAlign="center">
                          <div
                            style={{
                              backgroundColor: fetcher.data.websiteData.active
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
                                fetcher.data.websiteData.active
                                  ? "success"
                                  : "caution"
                              }
                            >
                              {fetcher.data.websiteData.active
                                ? "Active"
                                : "Inactive"}
                            </Text>
                          </div>
                          <Button
                            size="slim"
                            onClick={() => {
                              fetch("/api/toggle-status", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
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
                                  setError("Failed to toggle website status");
                                });
                            }}
                            disabled={
                              !fetcher.data.websiteData.lastSyncedAt ||
                              fetcher.data.websiteData.lastSyncedAt === "Never"
                            }
                          >
                            {fetcher.data.websiteData.active
                              ? "Deactivate"
                              : "Activate"}
                          </Button>
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
                            {fetcher.data.websiteData.plan}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="200">
                          <Text variant="bodySm" color="subdued">
                            Monthly Queries
                          </Text>
                          <InlineStack gap="200" blockAlign="baseline">
                            <Text variant="headingMd" fontWeight="semibold">
                              {fetcher.data.websiteData.monthlyQueries}
                            </Text>
                            <Text variant="bodySm" color="subdued">
                              / {fetcher.data.websiteData.queryLimit}
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
                              fetcher.data.websiteData.lastSyncedAt &&
                              fetcher.data.websiteData.lastSyncedAt !== "Never"
                                ? "success"
                                : "caution"
                            }
                          >
                            {fetcher.data.websiteData.lastSyncedAt
                              ? fetcher.data.websiteData.lastSyncedAt ===
                                "Never"
                                ? "Never"
                                : new Date(
                                    fetcher.data.websiteData.lastSyncedAt,
                                  ).toLocaleDateString()
                              : "Never"}
                          </Text>
                        </BlockStack>
                      </div>
                    </BlockStack>
                  </div>

                  {/* NEW: Extended Analytics Card */}
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
                  )}

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
                        >
                          {isSyncing ? "Syncing..." : "Sync Content"}
                        </Button>
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

                                              // Try to get domain from multiple sources
                                              let domain = "";

                                              // Option 1: Try to get from websiteData.url
                                              if (
                                                fetcher.data?.websiteData?.url
                                              ) {
                                                try {
                                                  const websiteUrl = new URL(
                                                    fetcher.data.websiteData.url,
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
                                                  fetcher.data.websiteData
                                                    .domain;
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
    </Page>
  );
}
