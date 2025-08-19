import { json } from "@remix-run/node";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export async function loader({ request }) {
  try {
    const url = new URL(request.url);
    const accessKey =
      url.searchParams.get("accessKey") ||
      request.headers.get("Authorization")?.replace("Bearer ", "");

    if (!accessKey) {
      return json(
        { success: false, error: "Access key is required" },
        { status: 400 },
      );
    }

    // Call the external news API
    const response = await fetch(
      `https://c276bc3ac2fd.ngrok-free.app/api/news`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
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
        "Error from news API:",
        response.status,
        response.statusText,
        data,
      );
      return json(data, { status: response.status });
    }

    console.log("News API response:", data);
    return json(data);
  } catch (error) {
    console.error("Error fetching news data:", error);
    return json(
      { success: false, error: error.message || "Failed to fetch news data" },
      { status: 500 },
    );
  }
}

export async function action({ request }) {
  try {
    // Get the data from the request body
    const body = await request.json();
    const { accessKey } = body;

    if (!accessKey) {
      return json(
        { success: false, error: "Access key is required" },
        { status: 400 },
      );
    }

    // Call the external news API
    const response = await fetch(`https://c276bc3ac2fd.ngrok-free.app/api/news`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
      body: JSON.stringify(body),
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
        "Error from news API:",
        response.status,
        response.statusText,
        data,
      );
      return json(data, { status: response.status });
    }

    console.log("News API response:", data);
    return json(data);
  } catch (error) {
    console.error("Error posting to news API:", error);
    return json(
      { success: false, error: error.message || "Failed to post news data" },
      { status: 500 },
    );
  }
}
