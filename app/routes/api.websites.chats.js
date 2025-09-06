import { authenticate } from "../shopify.server";

export const dynamic = "force-dynamic";

async function getAccessKey(admin) {
  try {
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
    return metafieldData.data.shop.metafield?.value;
  } catch (error) {
    console.error("Error fetching access key:", error);
    return null;
  }
}

export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);

    // Get access key from Shopify metafield
    const accessKey = await getAccessKey(admin);
    if (!accessKey) {
      return new Response(JSON.stringify({ error: "No access key found" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const url = new URL(request.url);
    const websiteId = url.searchParams.get("websiteId");
    const action = url.searchParams.get("action");
    const sort = url.searchParams.get("sort") || "recent";
    const page = url.searchParams.get("page") || "1";
    const limit = url.searchParams.get("limit") || "10";

    // Build query parameters for external API
    const queryParams = new URLSearchParams({
      websiteId: websiteId || "",
      page,
      limit,
      sort,
    });

    if (action) {
      queryParams.append("action", action);
    }

    // Call external API at localhost:3000 with access key
    const response = await fetch(
      `https://www.voicero.ai/api/websites/chats?${queryParams}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[API_WEBSITES_CHATS]", error);
    return new Response(JSON.stringify({ error: "Failed to fetch chats" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
