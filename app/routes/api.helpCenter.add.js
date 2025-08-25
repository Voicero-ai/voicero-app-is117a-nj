import { json } from "@remix-run/node";

export const dynamic = "force-dynamic";

export async function action({ request }) {
  try {
    const body = await request.json();
    const {
      accessKey,
      websiteId,
      question,
      documentAnswer,
      number,
      type,
      status,
    } = body || {};

    if (!accessKey) {
      return json(
        { success: false, error: "Access key is required" },
        { status: 400 },
      );
    }

    const response = await fetch(`https://www.voicero.ai/api/helpCenter/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
      body: JSON.stringify({
        websiteId,
        question,
        documentAnswer,
        number,
        type,
        status,
      }),
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
      { success: false, error: error.message || "Failed to add help module" },
      { status: 500 },
    );
  }
}
