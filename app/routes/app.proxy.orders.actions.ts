import { type ActionFunctionArgs } from "@remix-run/node";
import { processOrderAction as processOrderActionServer } from "app/proxy/handlers/ordersActions.server";

export const dynamic = "force-dynamic";

export async function action({ request }: ActionFunctionArgs) {
  console.log("⚡ Order action request received:", request.url);
  console.log("⚡ Request method:", request.method);

  // Log the request body for debugging
  try {
    const bodyText = await request.clone().text();
    console.log("⚡ Order action request body:", bodyText);

    // If it's valid JSON, parse and log it more readably
    try {
      const bodyJson = JSON.parse(bodyText);
      console.log("⚡ Parsed request body:", bodyJson);
    } catch {}
  } catch (e) {
    console.error("Could not log request body:", e);
  }

  return processOrderActionServer(request);
}
