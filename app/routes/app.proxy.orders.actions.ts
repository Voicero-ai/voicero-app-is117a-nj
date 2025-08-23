import { type ActionFunctionArgs } from "@remix-run/node";
import { processOrderAction as processOrderActionServer } from "app/proxy/handlers/ordersActions.server";

export const dynamic = "force-dynamic";

export async function action({ request }: ActionFunctionArgs) {
  console.log("⚡ Order action request received:", request.url);
  console.log("⚡ Request method:", request.method);
  return processOrderActionServer(request);
}
