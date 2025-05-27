import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  // Verify session and shop exist
  if (!session) {
    console.error("No session found during authentication");
    return json(
      { success: false, error: "Authentication failed - no session" },
      { status: 401 },
    );
  }

  if (!session.shop) {
    console.error("No shop found in session:", session);
    return json(
      { success: false, error: "Authentication failed - no shop in session" },
      { status: 401 },
    );
  }

  try {
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
    const accessKey = metafieldData.data.shop.metafield?.value;

    if (!accessKey) {
      return json(
        { success: false, error: "No access key found" },
        { status: 400 },
      );
    }

    // Get shop ID for metafield operations
    const shopResponse = await admin.graphql(`
      query {
        shop {
          id
        }
      }
    `);

    const shopData = await shopResponse.json();
    const shopId = shopData.data.shop.id;

    // Get website data from our existing connection first to get the website ID
    const websiteDataResponse = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "voicero", key: "website_id") {
            id
            value
          }
        }
      }
    `);

    const websiteIdData = await websiteDataResponse.json();
    let websiteId = websiteIdData.data.shop?.metafield?.value;
    let websiteMetafieldId = websiteIdData.data.shop?.metafield?.id;
    let needToFetchFromConnect = false;

    // If we have a stored website ID, try to use it
    if (websiteId) {
      try {
        console.log(`Using stored website ID ${websiteId}`);

        // Try to fetch website data using the stored ID
        const websiteResponse = await fetch(
          `${urls.voiceroApi}/api/websites/get?id=${websiteId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${accessKey}`,
            },
          },
        );

        // If the request fails, the ID might be outdated
        if (!websiteResponse.ok) {
          console.log(
            `Failed to fetch website with stored ID ${websiteId} - status: ${websiteResponse.status}`,
          );
          needToFetchFromConnect = true;

          // If we have a metafield ID, delete the outdated website ID
          if (websiteMetafieldId) {
            console.log(
              `Deleting outdated website ID metafield: ${websiteMetafieldId}`,
            );

            const deleteResponse = await admin.graphql(`
              mutation {
                metafieldDelete(input: {
                  id: "${websiteMetafieldId}"
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
                "Warning: Issues deleting old website ID:",
                deleteResult.data.metafieldDelete.userErrors,
              );
            } else {
              console.log("Successfully deleted outdated website ID metafield");
              websiteId = null; // Reset websiteId since we deleted it
            }
          }
        } else {
          // Request was successful, use this data
          const websiteData = await websiteResponse.json();
          return json({ success: true, websiteData });
        }
      } catch (error) {
        console.error("Error fetching with stored website ID:", error);
        needToFetchFromConnect = true;
      }
    } else {
      // No stored website ID, need to fetch from connect
      needToFetchFromConnect = true;
    }

    // If no stored website ID or it's outdated, try to get it from the API
    if (needToFetchFromConnect || !websiteId) {
      try {
        console.log("Fetching website ID from connect API");
        // Try to get the website ID from a connection check
        const connectionResponse = await fetch(
          `${urls.voiceroApi}/api/connect`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${accessKey}`,
            },
          },
        );

        if (!connectionResponse.ok) {
          const errorText = await connectionResponse.text();
          console.error(
            `Connection response error: ${connectionResponse.status} ${errorText}`,
          );
          throw new Error(
            `Failed to get website ID from connection check: ${connectionResponse.status} ${errorText}`,
          );
        }

        const connectionData = await connectionResponse.json();
        console.log("Connect API response:", connectionData);

        websiteId = connectionData.website?.id;

        if (!websiteId) {
          console.error("No website ID found in connect API response");
          throw new Error("No website ID found in connect API response");
        }

        console.log(`Got new website ID from connect: ${websiteId}`);

        // Save the website ID to metafields for future use
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
                key: "website_id",
                type: "single_line_text_field",
                value: websiteId,
                ownerId: shopId,
              },
            },
          },
        );

        const saveResult = await saveResponse.json();

        if (saveResult.data?.metafieldsSet?.userErrors?.length > 0) {
          console.error(
            "Error saving new website ID:",
            saveResult.data.metafieldsSet.userErrors,
          );
        } else {
          console.log(`Successfully saved new website ID: ${websiteId}`);
        }

        // Now use the website ID from connect directly
        return json({
          success: true,
          websiteData: connectionData.website,
          message: "Using website data from connect API directly",
        });
      } catch (error) {
        console.error("Error getting website ID from connect:", error);
        return json(
          {
            success: false,
            error:
              "Could not determine website ID. Please refresh the page or reconnect your store.",
          },
          { status: 400 },
        );
      }
    }

    if (!websiteId) {
      return json(
        {
          success: false,
          error:
            "Could not determine website ID. Please refresh the page or reconnect your store.",
        },
        { status: 400 },
      );
    }

    // Fetch website data from the API using the website ID
    const websiteResponse = await fetch(
      `${urls.voiceroApi}/api/websites/get?id=${websiteId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
      },
    );

    if (!websiteResponse.ok) {
      const errorData = await websiteResponse.json();
      throw new Error(
        `Failed to fetch website data: ${errorData.error || websiteResponse.statusText}`,
      );
    }

    const websiteData = await websiteResponse.json();
    return json({ success: true, websiteData });
  } catch (error) {
    console.error("API website get error:", error);
    return json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
