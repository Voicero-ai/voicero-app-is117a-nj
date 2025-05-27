import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export async function loader({ request }) {
  try {
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
          const errorText = await connectionResponse.text();
          console.error(
            "Connection response error:",
            connectionResponse.status,
            errorText,
          );
          throw new Error(
            `Failed to get website ID from connection check: ${connectionResponse.status} ${errorText}`,
          );
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

    // Fetch contacts data from the API using the website ID
    const contactsResponse = await fetch(`${urls.voiceroApi}/api/contacts`, {
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

    if (!contactsResponse.ok) {
      const errorText = await contactsResponse.text();
      let errorMessage;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || contactsResponse.statusText;
      } catch (e) {
        errorMessage = errorText || contactsResponse.statusText;
      }

      throw new Error(`Failed to fetch contacts data: ${errorMessage}`);
    }

    const contactsData = await contactsResponse.json();

    // Ensure contactsData is an array before returning
    const formattedContacts = Array.isArray(contactsData)
      ? contactsData
      : Array.isArray(contactsData.contacts)
        ? contactsData.contacts
        : [];

    return json({ success: true, contactsData: formattedContacts });
  } catch (error) {
    console.error("API contacts get error:", error);
    return json(
      {
        success: false,
        error: error.message || "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
