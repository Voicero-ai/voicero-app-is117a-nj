export const dynamic = "force-dynamic";

import { authenticate } from "../shopify.server";
import { json, redirect } from "@remix-run/node";
import { urls } from "~/utils/urls";

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Parse the form data from the request
    const formData = await request.formData();
    const accessKey = formData.get("access_key");

    if (!accessKey) {
      console.error("No access key received in callback");
      return json({
        success: false,
        error: "No access key provided",
      });
    }

    // Return to main app with the access key
    return redirect(`/app?access_key=${encodeURIComponent(accessKey)}`);
  } catch (error) {
    console.error("Error in quickConnectCallback:", error);
    return json({
      success: false,
      error: error.message,
    });
  }
}

// Default handler to explain this is a callback endpoint
export async function loader({ request }) {
  return json({
    message:
      "This is the quick connect callback endpoint. It should be called with POST and an access_key parameter.",
  });
}
