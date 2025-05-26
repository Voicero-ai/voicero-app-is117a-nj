import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server"; // <-- keep your path

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { topic, shop, payload } = await authenticate.webhook(request);
    // ✅ HMAC already verified at this point

    switch (topic) {
      case "APP_UNINSTALLED":
        // …clean‑up logic…
        break;
      case "APP_SCOPES_UPDATE":
        // …scope handling…
        break;
      case "CUSTOMERS_DATA_REQUEST":
      case "CUSTOMERS_REDACT":
      case "SHOP_REDACT":
        // …GDPR handling…
        break;
      default:
        console.log(`Unhandled topic ${topic}`);
    }

    // Respond quickly – the heavy work can be queued
    return json({ ok: true });
  } catch (error) {
    // Any signature / parse error lands here
    return json({ error: "Invalid webhook signature" }, { status: 401 });
  }
}
