import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export async function loader({ request }) {
  // Get the access key from the session
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
    return json({ error: "Access key not found" }, { status: 401 });
  }

  try {
    // Get website data to obtain the websiteId
    const websiteResponse = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!websiteResponse.ok) {
      return json(
        { error: "Failed to fetch website data" },
        { status: websiteResponse.status },
      );
    }

    const websiteData = await websiteResponse.json();
    const websiteId = websiteData.website?.id;

    if (!websiteId) {
      return json({ error: "Website ID not found" }, { status: 404 });
    }

    // Fetch user data from the Voicero API with websiteId
    const response = await fetch(
      `${urls.voiceroApi}/api/user/me?websiteId=${websiteId}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      return json(
        { error: errorData.error || "Failed to fetch user data" },
        { status: response.status },
      );
    }

    const userData = await response.json();
    return json({ user: userData });
  } catch (error) {
    console.error("Error fetching user data:", error);
    return json(
      { error: error.message || "Failed to fetch user data" },
      { status: 500 },
    );
  }
}
