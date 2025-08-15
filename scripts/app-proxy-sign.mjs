#!/usr/bin/env node
// ESM CLI to generate a signed Shopify App Proxy URL for calling your Remix proxy routes directly

import crypto from "node:crypto";
import { URL, URLSearchParams } from "node:url";

function toInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv) {
  const args = new Map();
  const extras = [];
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--extra" || token === "-e") {
      const kv = argv[++i];
      if (!kv || !kv.includes("=")) continue;
      const [k, v] = kv.split("=");
      extras.push([k, v]);
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      args.set(key, value);
    }
  }
  return { args, extras };
}

function buildSignaturePayload(params) {
  // Shopify app proxy signature: remove signature param, for each k=v (arrays as comma-joined), sort by key, then concatenate with no delimiter
  const copy = { ...params };
  delete copy.signature;
  const fragments = Object.keys(copy)
    .sort()
    .map((key) => {
      const value = copy[key];
      return `${key}=${Array.isArray(value) ? value.join(",") : String(value ?? "")}`;
    });
  return fragments.join("");
}

function hmacSHA256Hex(secret, message) {
  return crypto
    .createHmac("sha256", secret)
    .update(message, "utf8")
    .digest("hex");
}

function generateSignedUrl({
  baseUrl,
  shop,
  pathPrefix,
  secret,
  extraQueryPairs,
  loggedInCustomerId,
  timestamp,
}) {
  const url = new URL(baseUrl);

  const params = Object.fromEntries(new URLSearchParams(url.search));
  // Required app proxy params
  params.shop = shop;
  params.path_prefix = pathPrefix;
  params.timestamp = String(timestamp);
  params.logged_in_customer_id = loggedInCustomerId ?? "";

  // Extras
  for (const [k, v] of extraQueryPairs) {
    if (k in params) {
      // normalize to array -> comma-joined in signature payload
      const existing = params[k];
      if (Array.isArray(existing)) params[k] = [...existing, v];
      else params[k] = [existing, v];
    } else {
      params[k] = v;
    }
  }

  const payload = buildSignaturePayload(params);
  const signature = hmacSHA256Hex(secret, payload);
  params.signature = signature;

  // Apply to URL
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

async function main() {
  const { args, extras } = parseArgs(process.argv);

  const secret = args.get("secret") || process.env.SHOPIFY_API_SECRET;
  const shop = args.get("shop") || process.env.SHOP;
  const baseUrl = args.get("base") || process.env.APP_PROXY_BASE_URL; // e.g. https://voicero-app-is117a-nj.vercel.app/app/proxy
  const pathPrefix =
    args.get("path-prefix") ||
    process.env.APP_PROXY_PATH_PREFIX ||
    "/apps/proxy";
  const timestamp = toInt(
    args.get("timestamp") || Date.now() / 1000,
    Math.floor(Date.now() / 1000),
  );
  const loggedInCustomerId = args.get("customer-id") || "";

  if (!secret) {
    console.error("Missing --secret or SHOPIFY_API_SECRET");
    process.exit(2);
  }
  if (!shop) {
    console.error("Missing --shop or SHOP");
    process.exit(2);
  }
  if (!baseUrl) {
    console.error("Missing --base or APP_PROXY_BASE_URL");
    process.exit(2);
  }

  const signed = generateSignedUrl({
    baseUrl,
    shop,
    pathPrefix,
    secret,
    extraQueryPairs: extras,
    loggedInCustomerId,
    timestamp,
  });
  process.stdout.write(signed + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { generateSignedUrl };
