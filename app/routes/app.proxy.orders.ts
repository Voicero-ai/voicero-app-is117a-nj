import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { authenticate } from "app/shopify.server";
import { addCorsHeaders } from "app/proxy/utils";

export const dynamic = "force-dynamic";

// GET /app/proxy/orders -> list recent orders (20 days, paginated across all)
export async function loader({ request }: LoaderFunctionArgs) {
  // Handle preflight
  if (request.method.toLowerCase() === "options") {
    return new Response(null, addCorsHeaders({ status: 204 }));
  }

  try {
    const { session, admin } = await authenticate.public.appProxy(request);
    if (!session || !admin) {
      return json(
        { error: "Unauthorized or app not installed" },
        addCorsHeaders({ status: 401 }),
      );
    }

    const now = new Date();
    const twentyDaysAgo = new Date();
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

    const minDate = twentyDaysAgo.toISOString();
    const maxDate = now.toISOString();

    let hasNextPage = true;
    let cursor: string | null = null;
    let allOrderEdges: Array<{ cursor: string; node: any }> = [];
    let pageCount = 0;
    const PAGE_SIZE = 50;

    while (hasNextPage) {
      pageCount++;
      const paginationParams: string = cursor
        ? `first: ${PAGE_SIZE}, after: "${cursor}"`
        : `first: ${PAGE_SIZE}`;

      const query: string = `
        query {
          orders(${paginationParams}, query: "created_at:>='${minDate}' AND created_at:<='${maxDate}'") {
            edges {
              cursor
              node {
                id
                name
                createdAt
                totalPriceSet { shopMoney { amount currencyCode } }
                customer { firstName lastName email }
                displayFulfillmentStatus
                lineItems(first: 5) { edges { node { name quantity variant { price title } } } }
              }
            }
            pageInfo { hasNextPage }
          }
        }
      `;

      const response: any = await (admin as any).graphql(query);
      const responseJson: any = await response.json();
      const { orders } = responseJson.data;

      if (orders.edges.length > 0) {
        allOrderEdges = [...allOrderEdges, ...orders.edges];
      }

      hasNextPage = orders.pageInfo.hasNextPage;
      if (hasNextPage && orders.edges.length > 0) {
        cursor = orders.edges[orders.edges.length - 1].cursor;
      } else {
        break;
      }
    }

    return json(
      {
        success: true,
        orders: { edges: allOrderEdges },
        totalCount: allOrderEdges.length,
        pageCount,
      },
      addCorsHeaders(),
    );
  } catch (error) {
    return json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch orders",
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      addCorsHeaders({ status: 500 }),
    );
  }
}

// POST /app/proxy/orders -> currently noop placeholder
export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toLowerCase() === "options") {
    return new Response(null, addCorsHeaders({ status: 204 }));
  }
  return json(
    { success: true, message: "Orders action processed" },
    addCorsHeaders(),
  );
}
