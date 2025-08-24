import { json } from "@remix-run/node";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export async function action({ request }) {
  // Get the data from the request body
  const body = await request.json();
  const { websiteId, accessKey } = body;

  if (!websiteId) {
    return json(
      { success: false, error: "Website ID is required" },
      { status: 400 },
    );
  }

  if (!accessKey) {
    return json(
      { success: false, error: "Access key is required" },
      { status: 400 },
    );
  }

  try {
    // Forward the request to the external API
    const response = await fetch(
      `https://90fd72f59232.ngrok-free.app/api/aiHistory`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
        body: JSON.stringify({ websiteId }),
      },
    );

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      // Non-JSON response
      data = { success: false, error: text || "Upstream response not JSON" };
    }

    if (!response.ok) {
      console.error(
        "Error from external API:",
        response.status,
        response.statusText,
        data,
      );
      return json(data, { status: response.status });
    }

    return json(data);
  } catch (error) {
    console.error("Error fetching AI history:", error);
    return json(
      { success: false, error: error.message || "Failed to fetch AI history" },
      { status: 500 },
    );
  }
}

// Also support GET requests for easier testing
export async function loader({ request }) {
  const url = new URL(request.url);
  const websiteId = url.searchParams.get("websiteId");
  const accessKey = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "");

  if (!websiteId) {
    return json(
      { success: false, error: "Website ID is required" },
      { status: 400 },
    );
  }

  try {
    // Forward the request to the external API
    const response = await fetch(
      `https://90fd72f59232.ngrok-free.app/api/aiHistory?websiteId=${websiteId}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(accessKey && { Authorization: `Bearer ${accessKey}` }),
        },
      },
    );

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { success: false, error: text || "Upstream response not JSON" };
    }

    if (!response.ok) {
      console.error(
        "Error from external API:",
        response.status,
        response.statusText,
        data,
      );
      return json(data, { status: response.status });
    }

    return json(data);
  } catch (error) {
    console.error("Error fetching AI history:", error);
    return json(
      { success: false, error: error.message || "Failed to fetch AI history" },
      { status: 500 },
    );
  }
}
