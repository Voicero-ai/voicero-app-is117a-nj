import { json } from "@remix-run/node";

export const dynamic = "force-dynamic";

export async function loader({ request }) {
  try {
    const url = new URL(request.url);
    const accessKey =
      url.searchParams.get("accessKey") ||
      request.headers.get("Authorization")?.replace("Bearer ", "");
    const websiteId = url.searchParams.get("websiteId");

    if (!accessKey) {
      return json(
        { success: false, error: "Access key is required" },
        { status: 400 },
      );
    }

    const upstreamUrl = `https://90fd72f59232.ngrok-free.app/api/helpCenter/get${
      websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ""
    }`;

    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { success: false, error: text || "Upstream response not JSON" };
    }

    if (!response.ok) {
      return json(data, { status: response.status });
    }

    return json(data);
  } catch (error) {
    return json(
      { success: false, error: error.message || "Failed to fetch help center" },
      { status: 500 },
    );
  }
}

export async function action({ request }) {
  try {
    const body = await request.json();
    const { accessKey, websiteId } = body || {};

    if (!accessKey) {
      return json(
        { success: false, error: "Access key is required" },
        { status: 400 },
      );
    }

    const upstreamUrl = `https://90fd72f59232.ngrok-free.app/api/helpCenter/get${
      websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ""
    }`;

    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { success: false, error: text || "Upstream response not JSON" };
    }

    if (!response.ok) {
      return json(data, { status: response.status });
    }

    return json(data);
  } catch (error) {
    return json(
      { success: false, error: error.message || "Failed to fetch help center" },
      { status: 500 },
    );
  }
}
