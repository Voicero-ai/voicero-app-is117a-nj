import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

/**
 * Health check endpoint to verify the application is running
 */
export function loader({ request }: LoaderFunctionArgs) {
  // Check if API secret is configured (don't return the actual value!)
  const hasApiSecret = Boolean(process.env.SHOPIFY_API_SECRET);

  return json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV,
      hasApiSecret,
      appUrl: process.env.SHOPIFY_APP_URL || "not set",
    },
  });
}
