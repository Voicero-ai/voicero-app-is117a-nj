import { json } from "@remix-run/node";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export async function action({ request }) {
  try {
    // Get the data from the request body
    const body = await request.json();
    const { accessKey, websiteId, postId, hot } = body;

    if (!accessKey) {
      return json(
        { success: false, error: "Access key is required" },
        { status: 400 },
      );
    }

    if (!postId) {
      return json(
        { success: false, error: "Post ID is required" },
        { status: 400 },
      );
    }

    // Call the external news hot API
    const response = await fetch(`https://www.voicero.ai/api/news/hot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        websiteId,
        postId,
        hot,
      }),
    });

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
        "Error from news hot API:",
        response.status,
        response.statusText,
        data,
      );
      return json(data, { status: response.status });
    }

    console.log("News hot API response:", data);
    return json(data);
  } catch (error) {
    console.error("Error updating hot status:", error);
    return json(
      { success: false, error: error.message || "Failed to update hot status" },
      { status: 500 },
    );
  }
}
