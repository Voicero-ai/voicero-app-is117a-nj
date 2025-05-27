import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

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
      return json({ error: "No access key found" }, { status: 400 });
    }

    // Get website data from our existing connection first to get the website ID
    const websiteDataResponse = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "voicero", key: "website_id") {
            value
          }
        }
      }
    `);

    const websiteIdData = await websiteDataResponse.json();
    let websiteId = websiteIdData.data.shop?.metafield?.value;

    // If no stored website ID, try to get it from the API
    if (!websiteId) {
      try {
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

        if (connectionResponse.ok) {
          const connectionData = await connectionResponse.json();
          websiteId = connectionData.website?.id;

          // Save the website ID to metafields for future use
          if (websiteId) {
            const shopResponse = await admin.graphql(`
              query {
                shop {
                  id
                }
              }
            `);

            const shopData = await shopResponse.json();
            const shopId = shopData.data.shop.id;

            await admin.graphql(
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
          }
        } else {
          throw new Error("Failed to get website ID from connection check");
        }
      } catch (error) {
        console.error("Error getting website ID:", error);
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
