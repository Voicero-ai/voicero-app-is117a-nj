import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";
import { setOverride, WEBSITE_CACHE, SHOP_CACHE } from "../cache/websiteCache";

export const dynamic = "force-dynamic";

export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const body = await request.json();
    const feature = (body.feature || "").toString(); // "voice" | "text"
    const enabled = Boolean(body.enabled);

    if (!feature || (feature !== "voice" && feature !== "text")) {
      return json(
        { success: false, error: "Invalid feature. Use 'voice' or 'text'" },
        { status: 400 },
      );
    }

    // Resolve access key
    const metafieldResponse = await admin.graphql(`
      query {
        shop { metafield(namespace: "voicero", key: "access_key") { value } }
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

    // Call upstream to toggle feature
    // Expecting upstream path: /api/websites/toggle-feature with { feature, enabled }
    // If your upstream differs, update the URL accordingly.
    const upstream = await fetch(
      `https://www.voicero.ai/api/websites/toggle-feature`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
        body: JSON.stringify({ feature, enabled }),
      },
    );

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return json(
        data || { success: false, error: "Failed to toggle feature" },
        { status: upstream.status },
      );
    }

    // Determine websiteId from response or cached mapping; fallback to connect
    let websiteId = data?.websiteId || data?.website?.id || null;
    if (!websiteId) {
      // Try to infer from caches (first site in WEBSITE_CACHE)
      for (const [id] of WEBSITE_CACHE.entries()) {
        websiteId = id;
        break;
      }
    }
    if (!websiteId) {
      try {
        const conn = await fetch(`${urls.voiceroApi}/api/connect`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${accessKey}`,
          },
        });
        if (conn.ok) {
          const c = await conn.json();
          websiteId = c?.website?.id || websiteId;
        }
      } catch {}
    }

    // Apply local override so our cache serves the edited value even if revalidation returns stale flag state
    if (websiteId) {
      setOverride(
        websiteId,
        feature === "voice"
          ? { showVoiceAI: enabled }
          : { showTextAI: enabled },
      );
    }

    return json({
      success: true,
      websiteId,
      feature,
      enabled,
      ...(data || {}),
    });
  } catch (error) {
    console.error("toggle-ai error", error);
    return json(
      { success: false, error: error?.message || "Failed to toggle feature" },
      { status: 500 },
    );
  }
}
