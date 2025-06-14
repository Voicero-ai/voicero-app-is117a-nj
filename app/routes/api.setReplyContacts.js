export const dynamic = "force-dynamic";

import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import { urls } from "~/utils/urls";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  try {
    // Get the request body
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return json({ error: "Contact ID is required" }, { status: 400 });
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
      return json({ error: "No access key found" }, { status: 400 });
    }

    // Call the API to set reply status
    const response = await fetch(
      `${urls.voiceroApi}/api/shopify/setReplyContacts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
        body: JSON.stringify({ id }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Failed to set reply status: ${errorData.error || response.statusText}`,
      );
    }

    const data = await response.json();
    return json({ success: true, data });
  } catch (error) {
    console.error("API set reply error:", error);
    return json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
