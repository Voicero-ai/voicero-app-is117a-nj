import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { addDocumentResponseHeaders } from "./shopify.server";

// Simplified timeout
export const streamTimeout = 5000;

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  remixContext,
) {
  // Add Shopify headers - this already includes appropriate CSP headers
  // that are compatible with Shopify's admin interface
  addDocumentResponseHeaders(request, responseHeaders);

  // We're no longer setting a custom CSP header
  // This allows Shopify's default CSP to take effect
  // Which should properly handle their analytics and telemetry systems

  return new Promise((resolve, reject) => {
    let didError = false;

    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        onShellReady() {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: didError ? 500 : responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          didError = true;
          console.error("Shell error:", error);
          reject(error);
        },
        onError(error) {
          didError = true;
          console.error("Rendering error:", error);
        },
      },
    );

    // Simple timeout
    setTimeout(abort, streamTimeout);
  });
}
