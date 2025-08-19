import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

// In-memory cache with 1-hour TTL
const WEBSITE_CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
// Map shop domain -> { websiteId, data, storedAt, expiresAt }
const SHOP_CACHE = new Map();

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  try {
    const urlObj = new URL(request.url);
    const bypassCache = urlObj.searchParams.get("bypassCache");
    const bypass =
      bypassCache === "true" ||
      bypassCache === "1" ||
      bypassCache === "yes" ||
      bypassCache === "on";
    const clearCache = urlObj.searchParams.get("clearCache");
    const clearAllCache = urlObj.searchParams.get("clearAllCache");
    const shop = session?.shop;

    // Allow clearing cache entries
    if (clearAllCache) {
      WEBSITE_CACHE.clear();
      SHOP_CACHE.clear();
    }
    if (clearCache && shop) {
      const shopEntry = SHOP_CACHE.get(shop);
      if (shopEntry?.websiteId) WEBSITE_CACHE.delete(shopEntry.websiteId);
      SHOP_CACHE.delete(shop);
    }

    const now = Date.now();

    // If we have a cached entry for this shop, return it immediately and
    // trigger a background revalidation.
    const shopCached = shop ? SHOP_CACHE.get(shop) : null;
    if (shopCached) {
      // Fire-and-forget revalidation to keep cache fresh
      void (async () => {
        try {
          // Get access key from metafields
          const mfResp = await admin.graphql(`
            query {
              shop {
                metafield(namespace: "voicero", key: "access_key") {
                  value
                }
              }
            }
          `);
          const mfData = await mfResp.json();
          const bgAccessKey = mfData.data.shop.metafield?.value;
          if (!bgAccessKey) return;

          // Use websiteId from cache if present; otherwise resolve via connect
          let bgWebsiteId = shopCached.websiteId;
          if (!bgWebsiteId) {
            const connResp = await fetch(`${urls.voiceroApi}/api/connect`, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${bgAccessKey}`,
              },
            });
            if (!connResp.ok) return;
            const connData = await connResp.json();
            bgWebsiteId = connData.website?.id;
            if (!bgWebsiteId) return;
          }

          const websiteResponse = await fetch(
            `https://www.voicero.ai/api/websites/get?id=${bgWebsiteId}`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${bgAccessKey}`,
              },
            },
          );
          if (!websiteResponse.ok) return;
          const latest = await websiteResponse.json();
          WEBSITE_CACHE.set(bgWebsiteId, {
            data: latest,
            storedAt: Date.now(),
            expiresAt: Date.now() + CACHE_TTL_MS,
          });
          if (shop) {
            SHOP_CACHE.set(shop, {
              websiteId: bgWebsiteId,
              data: latest,
              storedAt: Date.now(),
              expiresAt: Date.now() + CACHE_TTL_MS,
            });
          }
        } catch (e) {
          console.error("Background revalidation failed:", e);
        }
      })();

      return json({
        success: true,
        websiteData: shopCached.data,
        cached: true,
        revalidating: true,
        lastUpdatedAt: shopCached.storedAt,
      });
    }

    // No usable cache or bypass requested: fetch fresh, update caches, and return
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

    const cacheKey = websiteId;

    // If we have website-level cache, return it immediately and revalidate in background
    const websiteCached = WEBSITE_CACHE.get(cacheKey);
    if (websiteCached) {
      void (async () => {
        try {
          const websiteResponse = await fetch(
            `https://www.voicero.ai/api/websites/get?id=${cacheKey}`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${accessKey}`,
              },
            },
          );
          if (!websiteResponse.ok) return;
          const latest = await websiteResponse.json();
          WEBSITE_CACHE.set(cacheKey, {
            data: latest,
            storedAt: Date.now(),
            expiresAt: Date.now() + CACHE_TTL_MS,
          });
          if (shop) {
            SHOP_CACHE.set(shop, {
              websiteId: cacheKey,
              data: latest,
              storedAt: Date.now(),
              expiresAt: Date.now() + CACHE_TTL_MS,
            });
          }
        } catch (e) {
          console.error("Background revalidation (by websiteId) failed:", e);
        }
      })();

      if (shop) {
        SHOP_CACHE.set(shop, {
          websiteId: cacheKey,
          data: websiteCached.data,
          storedAt: websiteCached.storedAt,
          expiresAt: websiteCached.expiresAt,
        });
      }

      return json({
        success: true,
        websiteData: websiteCached.data,
        cached: true,
        revalidating: true,
        lastUpdatedAt: websiteCached.storedAt,
      });
    }

    // Fetch website data from the API using the website ID
    const websiteResponse = await fetch(
      `https://www.voicero.ai/api/websites/get?id=${websiteId}`,
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
    if (shop) {
      SHOP_CACHE.set(shop, {
        websiteId: cacheKey,
        data: websiteData,
        storedAt: now,
        expiresAt: now + CACHE_TTL_MS,
      });
    }

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
