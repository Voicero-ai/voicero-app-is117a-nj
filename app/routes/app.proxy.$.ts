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
    const { cors } = await authenticate.public.appProxy(request);
    const rest = params["*"] ?? "";
    return cors(json({ ok: true, fallback: true, rest }));
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
