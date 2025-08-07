import { type ActionFunctionArgs } from "@remix-run/node";
import { processCustomerAction as processCustomerActionServer } from "app/proxy/handlers/customers.server";

export const dynamic = "force-dynamic";

export async function action({ request }: ActionFunctionArgs) {
  return processCustomerActionServer(request);
}
