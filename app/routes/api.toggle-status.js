import { json } from "@remix-run/node";
import urls from "../config/urls";

export async function action({ request }) {
  // Get the access key from the request body
  const body = await request.json();
  const accessKey = body.accessKey;

  if (!accessKey) {
    return json(
      { success: false, error: "No access key provided" },
      { status: 400 },
    );
  }

  try {
    // Forward the request to the voicero API
    const response = await fetch(
      `${urls.voiceroApi}/api/websites/toggle-status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey.trim()}`,
        },
        body: JSON.stringify({
          accessKey: accessKey.trim(),
        }),
      },
    );

    // Get the response as JSON
    const data = await response.json();

    // Return the response
    return json(data, { status: response.status });
  } catch (error) {
    console.error("Error toggling website status:", error);
    return json(
      { success: false, error: "Failed to toggle website status" },
      { status: 500 },
    );
  }
}
