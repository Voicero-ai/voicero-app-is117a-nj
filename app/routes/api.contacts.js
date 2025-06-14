import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { urls } from "~/utils/urls";

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

    // Get website ID from /api/connect endpoint
    const connectionResponse = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!connectionResponse.ok) {
      throw new Error("Failed to get website ID from connection check");
    }

    const connectionData = await connectionResponse.json();
    const websiteId = connectionData.website?.id;

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

    // Fetch contacts from the API using the website ID
    const contactsResponse = await fetch(
      `${urls.voiceroApi}/api/contacts?websiteId=${websiteId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
      },
    );

    if (!contactsResponse.ok) {
      const errorData = await contactsResponse.json();
      throw new Error(
        `Failed to fetch contacts: ${errorData.error || contactsResponse.statusText}`,
      );
    }

    const contactsData = await contactsResponse.json();

    return json({ success: true, contacts: contactsData });
  } catch (error) {
    console.error("API contacts error:", error);
    return json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
