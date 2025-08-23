import { type ActionFunctionArgs } from "@remix-run/node";
import { processCustomerAction as processCustomerActionServer } from "app/proxy/handlers/customers.server";

export const dynamic = "force-dynamic";

export async function action({ request }: ActionFunctionArgs) {
  console.log("👤 Customer action request received:", request.url);
  console.log("👤 Request method:", request.method);
  return processCustomerActionServer(request);
}
