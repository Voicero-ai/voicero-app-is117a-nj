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

    // First, always try to fetch from connect API to get the latest website ID
    console.log("Fetching data from connect API");
    const connectionResponse = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!connectionResponse.ok) {
      const errorText = await connectionResponse.text();
      console.error(
        `Connection response error: ${connectionResponse.status} ${errorText}`,
      );
      throw new Error(
        `Failed to connect: ${connectionResponse.status} ${errorText}`,
      );
    }

    const connectionData = await connectionResponse.json();
    console.log("Connect API response received");

    const websiteId = connectionData.website?.id;

    if (!websiteId) {
      console.error("No website ID found in connect API response");
      return json(
        {
          success: false,
          error: "No website ID found in API response",
        },
        { status: 400 },
      );
    }

    console.log(`Using website ID from connect: ${websiteId}`);

    // Get website data directly from the connect response
    const websiteData = connectionData.website;

    // Update the website_id metafield for future use
    try {
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

      // Update the metafield with the new website ID
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
        console.warn(
          "Warning: Issues updating website ID metafield:",
          saveResult.data.metafieldsSet.userErrors,
        );
      } else {
        console.log(
          `Successfully updated website ID metafield to: ${websiteId}`,
        );
      }
    } catch (metafieldError) {
      // Just log the error and continue - we already have the website data
      console.warn("Failed to update website ID metafield:", metafieldError);
    }

    // Return the website data from the connect API
    return json({
      success: true,
      websiteData,
    });
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
