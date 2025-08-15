#!/usr/bin/env node
// Simple test client: generates a signed URL, then performs GET or POST using fetch

import { generateSignedUrl } from "./app-proxy-sign.mjs";
import crypto from "node:crypto";

const fetchFn = globalThis.fetch || (await import("node-fetch")).default;

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

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function main() {
  const { args, extras } = parseArgs(process.argv);
  const secret = args.get("secret") || process.env.SHOPIFY_API_SECRET;
  const shop = args.get("shop") || process.env.SHOP;
  const baseUrl = args.get("base") || process.env.APP_PROXY_BASE_URL;
  const pathPrefix =
    args.get("path-prefix") ||
    process.env.APP_PROXY_PATH_PREFIX ||
    "/apps/proxy";
  const method = (args.get("method") || "GET").toUpperCase();
  const customerId = args.get("customer-id") || "";
  const timestamp = Number(args.get("timestamp") || nowSeconds());

  if (!secret || !shop || !baseUrl) {
    console.error(
      "Usage: node scripts/app-proxy-test.mjs --secret <api_secret> --shop <shop.myshopify.com> --base <proxy_base_url> [--method GET|POST] [-e key=value]...",
    );
    process.exit(2);
  }

  const signedUrl = generateSignedUrl({
    baseUrl,
    shop,
    pathPrefix,
    secret,
    extraQueryPairs: extras,
    loggedInCustomerId: customerId,
    timestamp,
  });

  const body = args.get("body");
  const headers = { "Content-Type": "application/json" };

  const res = await fetchFn(signedUrl, {
    method,
    headers,
    body: method === "POST" && body ? body : undefined,
  });

  const text = await res.text();
  process.stdout.write(`HTTP ${res.status}\n`);
  process.stdout.write(text + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
