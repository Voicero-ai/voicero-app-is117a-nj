import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
export const dynamic = "force-dynamic";

/**
 * API endpoint to check if a customer is logged in
 * Returns customer data if available or authentication status
 */
export async function loader({ request }) {
  try {
    // Get the authenticated session if available
    const { admin, session } = await authenticate.public.appProxy(request);

    // Get shop from query params
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    if (!shop) {
      return json({ error: "Missing shop parameter" }, { status: 400 });
    }

    let customer = null;
    let isLoggedIn = false;

    // Check for customer session cookie in the request
    const cookies = request.headers.get("cookie") || "";
    const hasCustomerCookie =
      cookies.includes("_shopify_customer_") ||
      cookies.includes("cart") ||
      cookies.includes("_secure_session_id");

    if (hasCustomerCookie) {
      isLoggedIn = true;
      // You could fetch more customer details here if needed
    }

    return json({
      isLoggedIn,
      customer,
      shop,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error checking customer status:", error);
    return json({ error: error.message }, { status: 500 });
  }
}
