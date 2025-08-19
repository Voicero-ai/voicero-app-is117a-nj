// Centralized in-memory cache and override utilities for website data
// Note: These caches are per-server-process in memory and reset on deploys

export const WEBSITE_CACHE = new Map();
export const SHOP_CACHE = new Map();
export const LOCAL_OVERRIDES = new Map(); // websiteId -> { showVoiceAI?, showTextAI?, updatedAt }

export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function applyOverrides(websiteId, data) {
  if (!websiteId || !data) return data;
  const overrides = LOCAL_OVERRIDES.get(websiteId);
  if (!overrides) return data;
  return {
    ...data,
    ...(overrides.showVoiceAI !== undefined
      ? { showVoiceAI: overrides.showVoiceAI }
      : {}),
    ...(overrides.showTextAI !== undefined
      ? { showTextAI: overrides.showTextAI }
      : {}),
  };
}

export function updateCachesAfterFetch({
  shop,
  websiteId,
  data,
  now = Date.now(),
}) {
  if (!websiteId || !data) return;
  const merged = applyOverrides(websiteId, data);
  WEBSITE_CACHE.set(websiteId, {
    data: merged,
    storedAt: now,
    expiresAt: now + CACHE_TTL_MS,
  });
  if (shop) {
    SHOP_CACHE.set(shop, {
      websiteId,
      data: merged,
      storedAt: now,
      expiresAt: now + CACHE_TTL_MS,
    });
  }
}

export function setOverride(websiteId, overrides) {
  if (!websiteId || !overrides) return;
  const existing = LOCAL_OVERRIDES.get(websiteId) || {};
  const next = {
    ...existing,
    ...overrides,
    updatedAt: Date.now(),
  };
  LOCAL_OVERRIDES.set(websiteId, next);

  // Also update any existing cache entries to reflect the override immediately
  const siteCache = WEBSITE_CACHE.get(websiteId);
  if (siteCache?.data) {
    const merged = applyOverrides(websiteId, siteCache.data);
    WEBSITE_CACHE.set(websiteId, {
      ...siteCache,
      data: merged,
      storedAt: Date.now(),
    });
  }

  // Update any shop caches that point to this websiteId
  for (const [shop, entry] of SHOP_CACHE.entries()) {
    if (entry?.websiteId === websiteId && entry?.data) {
      const merged = applyOverrides(websiteId, entry.data);
      SHOP_CACHE.set(shop, {
        ...entry,
        data: merged,
        storedAt: Date.now(),
      });
    }
  }
}
