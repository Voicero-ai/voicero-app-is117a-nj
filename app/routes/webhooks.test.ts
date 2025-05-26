import { ActionFunctionArgs, json } from "@remix-run/node";
import crypto from "crypto";

/**
 * Simple test endpoint to verify webhook HMAC validation logic
 */
export async function action({ request }: ActionFunctionArgs) {

  try {
    // Get the raw request body
    const rawBody = await request.text();

    // Get the HMAC signature
    const hmac = request.headers.get("x-shopify-hmac-sha256");

    if (!hmac) {
      console.error("Missing HMAC signature");
      return json({ message: "Missing signature" }, { status: 401 });
    }

    // Get the API secret (from environment variable)
    const secret = process.env.SHOPIFY_API_SECRET;

    // Generate our own HMAC for comparison
    const generatedHmac = crypto
      .createHmac("sha256", secret || "")
      .update(rawBody, "utf8")
      .digest("base64");


    // Check if the HMACs match
    if (hmac !== generatedHmac) {
      console.error("Invalid HMAC signature - HMACs don't match");
      return json(
        {
          message: "Invalid signature",
          received: hmac,
          generated: generatedHmac,
        },
        { status: 401 },
      );
    }

    // If we get here, HMAC validation passed

    // Extract topic and shop for logging
    const topic = request.headers.get("x-shopify-topic");
    const shop = request.headers.get("x-shopify-shop-domain");

    return json(
      {
        success: true,
        message: "HMAC validation passed",
        topic,
        shop,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error processing test webhook:", error);
    return json({ error: "Test webhook processing failed" }, { status: 500 });
  }
}
