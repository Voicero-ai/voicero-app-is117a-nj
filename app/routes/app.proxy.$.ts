import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "app/shopify.server";
import { addCorsHeaders } from "app/proxy/utils";

export const dynamic = "force-dynamic";

/**
 * Splat route catches anything after /app/proxy/*
 * params["*"] is the entire remaining path (e.g. "foo/bar")
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method.toLowerCase() === "options") {
    return new Response(null, addCorsHeaders({ status: 204 }));
  }

  try {
    const { cors, admin, session } =
      await authenticate.public.appProxy(request);
    const rest = params["*"] ?? "";

    // Endpoint: /apps/proxy/access-key → returns the Voicero access key metafield
    if (rest === "access-key" || rest === "accessKey") {
      try {
        const metafieldResponse = await admin.graphql(`
          query {
            shop {
              metafield(namespace: "voicero", key: "access_key") {
                id
                value
              }
            }
          }
        `);
        const metafieldData = await metafieldResponse.json();
        const accessKey = metafieldData?.data?.shop?.metafield?.value || null;

        return cors(
          json(
            {
              success: true,
              accessKey,
              shop: session?.shop || null,
            },
            addCorsHeaders(),
          ),
        );
      } catch (e) {
        return cors(
          json(
            {
              success: false,
              error:
                e instanceof Error ? e.message : "Failed to fetch access key",
            },
            addCorsHeaders({ status: 500 }),
          ),
        );
      }
    }

    // Default fallback for other GETs under /apps/proxy/*
    return cors(json({ ok: true, fallback: true, rest }, addCorsHeaders()));
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      addCorsHeaders({ status: 500 }),
    );
  }
}
