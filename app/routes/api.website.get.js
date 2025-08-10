import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

// In-memory cache with 1-hour TTL
const WEBSITE_CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  try {
    const urlObj = new URL(request.url);
    const bypassCache = urlObj.searchParams.get("bypassCache");
    const clearCache = urlObj.searchParams.get("clearCache");
    const clearAllCache = urlObj.searchParams.get("clearAllCache");

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

    // Allow clearing cache entries
    if (clearAllCache) WEBSITE_CACHE.clear();
    const cacheKey = websiteId;
    if (clearCache) WEBSITE_CACHE.delete(cacheKey);

    // Serve from cache unless bypassed
    const now = Date.now();
    if (!bypassCache) {
      const cached = WEBSITE_CACHE.get(cacheKey);
      if (cached && now < cached.expiresAt) {
        return json({ success: true, websiteData: cached.data, cached: true });
      }
    }

    // Fetch website data from the API using the website ID
    const websiteResponse = await fetch(
      `https://1d3818d4ade1.ngrok-free.app/api/websites/get?id=${websiteId}`,
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

    // Log the full JSON output from the websites/get endpoint
    console.log(
      "Full websites/get response:",
      JSON.stringify(websiteData, null, 2),
    );

    // Store in cache
    WEBSITE_CACHE.set(cacheKey, {
      data: websiteData,
      storedAt: now,
      expiresAt: now + CACHE_TTL_MS,
    });

    return json({ success: true, websiteData, cached: false });
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
