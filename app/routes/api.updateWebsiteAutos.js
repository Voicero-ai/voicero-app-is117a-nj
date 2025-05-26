import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import urls from "../config/urls";

export const dynamic = "force-dynamic";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  try {
    // Get the request body
    const body = await request.json();
    const {
      allowAutoRedirect,
      allowAutoScroll,
      allowAutoHighlight,
      allowAutoClick,
      allowAutoCancel,
      allowAutoReturn,
      allowAutoExchange,
      allowAutoGetUserOrders,
      allowAutoUpdateUserInfo,
    } = body;

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
      return json({ error: "No access key found" }, { status: 400 });
    }

    // Get websiteId from metafields
    const websiteIdResponse = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "voicero", key: "website_id") {
            value
          }
        }
      }
    `);

    const websiteIdData = await websiteIdResponse.json();
    const websiteId = websiteIdData.data.shop?.metafield?.value;

    if (!websiteId) {
      return json({ error: "No website ID found" }, { status: 400 });
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
          allowAutoRedirect,
          allowAutoScroll,
          allowAutoHighlight,
          allowAutoClick,
          allowAutoCancel,
          allowAutoReturn,
          allowAutoExchange,
          allowAutoGetUserOrders,
          allowAutoUpdateUserInfo,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
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
        error: error.message,
      },
      { status: 500 },
    );
  }
}
