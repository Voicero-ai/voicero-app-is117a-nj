import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  try {
    // Get the request body
    const body = await request.json();

    // Ensure all required auto features have a boolean value (default to false if missing)
    const autoFeatures = {
      allowAutoRedirect: !!body.allowAutoRedirect,
      allowAutoScroll: !!body.allowAutoScroll,
      allowAutoHighlight: !!body.allowAutoHighlight,
      allowAutoClick: !!body.allowAutoClick,
      allowAutoCancel: !!body.allowAutoCancel,
      allowAutoReturn: !!body.allowAutoReturn,
      allowAutoExchange: !!body.allowAutoExchange,
      allowAutoGetUserOrders: !!body.allowAutoGetUserOrders,
      allowAutoUpdateUserInfo: !!body.allowAutoUpdateUserInfo,
      allowAutoFillForm: !!body.allowAutoFillForm,
      allowAutoTrackOrder: !!body.allowAutoTrackOrder,
      allowAutoLogout: !!body.allowAutoLogout,
      allowAutoLogin: !!body.allowAutoLogin,
      allowAutoGenerateImage: !!body.allowAutoGenerateImage,
    };

    console.log("Auto features to update:", autoFeatures);

    // Get access key from metafields
    const metafieldResponse = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "voicero", key: "access_key") {
            value
          }
        }
      }
    `);

    const metafieldData = await metafieldResponse.json();
    const accessKey = metafieldData.data.shop.metafield?.value;

    if (!accessKey) {
      return json(
        { success: false, error: "No access key found" },
        { status: 400 },
      );
    }

    // Get website ID from /api/connect endpoint
    const connectionResponse = await fetch(`${urls.voiceroApi}/api/connect`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessKey}`,
      },
    });

    if (!connectionResponse.ok) {
      throw new Error("Failed to get website ID from connection check");
    }

    const connectionData = await connectionResponse.json();
    const websiteId = connectionData.website?.id;

    if (!websiteId) {
      return json(
        {
          success: false,
          error:
            "Could not determine website ID. Please refresh the page or reconnect your store.",
        },
        { status: 400 },
      );
    }

    // Call the API to update auto features
    const response = await fetch(
      `${urls.voiceroApi}/api/shopify/updateWebsiteAutos`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessKey}`,
        },
        body: JSON.stringify({
          websiteId,
          ...autoFeatures,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: response.statusText }));
      throw new Error(
        `Failed to update auto features: ${errorData.error || response.statusText}`,
      );
    }

    const data = await response.json();
    return json({ success: true, data });
  } catch (error) {
    console.error("API update auto features error:", error);
    return json(
      {
        success: false,
        error: error.message || "Failed to update AI auto features",
      },
      { status: 500 },
    );
  }
}
