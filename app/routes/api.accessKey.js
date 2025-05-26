import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

export const dynamic = "force-dynamic";

async function getShopId(admin) {
  try {
    const shopResponse = await admin.graphql(`
      query {
        shop {
          id
        }
      }
    `);
    const shopData = await shopResponse.json();
    return shopData.data.shop.id;
  } catch (error) {
    console.error("Error fetching shop ID:", error);
    throw error;
  }
}

async function getMetafieldInfo(admin) {
  try {
    const metafieldResponse = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "voicero", key: "access_key") {
            id
            value
          }
        }
      }
    `);

    const metafieldData = await metafieldResponse.json();
    return {
      id: metafieldData.data.shop.metafield?.id,
      value: metafieldData.data.shop.metafield?.value,
    };
  } catch (error) {
    console.error("Error fetching metafield info:", error);
    throw error;
  }
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Get method from request
    const method = request.method;

    // Handle DELETE operation
    if (method === "DELETE") {
      const { id: rawMetafieldId, value } = await getMetafieldInfo(admin);

      // If no metafield exists, nothing to delete
      if (!rawMetafieldId) {
        return json({
          success: true,
          message: "Access key not found, nothing to delete",
        });
      }

      const shopId = await getShopId(admin);

      // First try: Clear the metafield using metafieldsSet with empty value
      try {
        console.log("Attempting to clear metafield value using metafieldsSet");
        const clearResponse = await admin.graphql(`
          mutation {
            metafieldsSet(metafields: [{
              namespace: "voicero",
              key: "access_key",
              ownerId: "${shopId}",
              type: "single_line_text_field",
              value: ""
            }]) {
              metafields {
                id
                namespace
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `);

        const clearResult = await clearResponse.json();

        if (
          clearResult.data?.metafieldsSet?.userErrors &&
          clearResult.data.metafieldsSet.userErrors.length > 0
        ) {
          console.error(
            "Errors clearing metafield:",
            clearResult.data.metafieldsSet.userErrors,
          );
        } else {
          console.log("Successfully cleared metafield value");
          return json({
            success: true,
            message: "Access key cleared successfully",
          });
        }
      } catch (error) {
        console.error("Error clearing metafield using metafieldsSet:", error);
      }

      // Second try: Update the metafield with empty value using metafieldUpdate
      try {
        console.log("Attempting to clear metafield using metafieldUpdate");
        const updateResponse = await admin.graphql(`
          mutation {
            metafieldUpdate(input: {
              id: "${rawMetafieldId}",
              value: "",
              type: "single_line_text_field"
            }) {
              metafield {
                id
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `);

        const updateResult = await updateResponse.json();

        if (
          updateResult.data?.metafieldUpdate?.userErrors &&
          updateResult.data.metafieldUpdate.userErrors.length > 0
        ) {
          console.error(
            "Errors updating metafield:",
            updateResult.data.metafieldUpdate.userErrors,
          );
        } else {
          console.log("Successfully updated metafield value to empty");
          return json({
            success: true,
            message: "Access key cleared successfully via update",
          });
        }
      } catch (error) {
        console.error("Error updating metafield to empty:", error);
      }

      // Third try: Delete the metafield completely using metafieldDelete
      try {
        console.log("Attempting to delete metafield using metafieldDelete");
        const deleteResponse = await admin.graphql(`
          mutation {
            metafieldDelete(input: {
              id: "${rawMetafieldId}"
            }) {
              deletedId
              userErrors {
                field
                message
              }
            }
          }
        `);

        const deleteResult = await deleteResponse.json();

        if (
          deleteResult.data?.metafieldDelete?.userErrors &&
          deleteResult.data.metafieldDelete.userErrors.length > 0
        ) {
          console.error(
            "Errors deleting metafield:",
            deleteResult.data.metafieldDelete.userErrors,
          );
        } else {
          console.log("Successfully deleted metafield");
          return json({
            success: true,
            message: "Access key deleted successfully",
          });
        }
      } catch (error) {
        console.error("Error deleting metafield using GraphQL:", error);
      }

      // Fourth try: Delete metafield using raw REST API call as fallback
      try {
        console.log("Attempting to delete metafield using REST API");

        // Extract numeric ID from the GID format
        const metafieldId = rawMetafieldId.split("/").pop();
        const shopDomain = session.shop;

        // Construct full URL for server-side fetch
        const url = `https://${shopDomain}/admin/api/2025-01/metafields/${metafieldId}.json`;

        const response = await fetch(url, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": session.accessToken,
          },
        });

        if (response.ok) {
          console.log("Successfully deleted metafield using REST API");
          return json({
            success: true,
            message: "Access key deleted successfully using REST API",
          });
        } else {
          const errorData = await response.text();
          console.error("REST API deletion failed:", errorData);
        }
      } catch (error) {
        console.error("Error with REST API metafield deletion:", error);
      }

      // If all attempts fail, return error
      return json(
        {
          success: false,
          message:
            "Failed to delete access key after multiple attempts. Please contact support.",
        },
        { status: 500 },
      );
    }

    // Handle GET operation - retrieve current access key
    if (method === "GET") {
      const { value } = await getMetafieldInfo(admin);
      return json({
        success: true,
        accessKey: value || null,
      });
    }

    // Handle POST operation - create or update access key
    if (method === "POST") {
      const data = await request.json();
      const { accessKey } = data;

      if (!accessKey) {
        return json(
          {
            success: false,
            message: "Access key is required",
          },
          { status: 400 },
        );
      }

      const shopId = await getShopId(admin);
      const { id: existingId } = await getMetafieldInfo(admin);

      // If we have an existing metafield, use metafieldUpdate
      if (existingId) {
        console.log("Updating existing metafield");
        const updateResponse = await admin.graphql(`
          mutation {
            metafieldUpdate(input: {
              id: "${existingId}",
              value: "${accessKey}",
              type: "single_line_text_field"
            }) {
              metafield {
                id
                namespace
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `);

        const updateResult = await updateResponse.json();

        if (
          updateResult.data?.metafieldUpdate?.userErrors &&
          updateResult.data.metafieldUpdate.userErrors.length > 0
        ) {
          return json(
            {
              success: false,
              message: "Failed to update access key",
              errors: updateResult.data.metafieldUpdate.userErrors,
            },
            { status: 500 },
          );
        }

        return json({
          success: true,
          message: "Access key updated successfully",
          metafield: updateResult.data.metafieldUpdate.metafield,
        });
      }
      // Otherwise, create a new metafield
      else {
        console.log("Creating new metafield");
        const createResponse = await admin.graphql(`
          mutation {
            metafieldCreate(input: {
              namespace: "voicero",
              key: "access_key",
              ownerId: "${shopId}",
              value: "${accessKey}",
              type: "single_line_text_field"
            }) {
              metafield {
                id
                namespace
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `);

        const createResult = await createResponse.json();

        if (
          createResult.data?.metafieldCreate?.userErrors &&
          createResult.data.metafieldCreate.userErrors.length > 0
        ) {
          return json(
            {
              success: false,
              message: "Failed to create access key",
              errors: createResult.data.metafieldCreate.userErrors,
            },
            { status: 500 },
          );
        }

        return json({
          success: true,
          message: "Access key created successfully",
          metafield: createResult.data.metafieldCreate.metafield,
        });
      }
    }

    // Default response for unsupported methods
    return json(
      {
        success: false,
        message: "Method not supported",
      },
      { status: 405 },
    );
  } catch (error) {
    console.error("Error in access key operation:", error);
    return json(
      {
        success: false,
        message: "An error occurred while processing your request",
        error: error.message,
      },
      { status: 500 },
    );
  }
}

// For documentation purposes when accessed directly
export const loader = async ({ request }) => {
  return json({
    message:
      "This is the access key API endpoint. Use POST to set, GET to retrieve, and DELETE to remove the access key.",
    endpoints: {
      get: "GET /api/accessKey - Retrieve the current access key",
      set: "POST /api/accessKey - Set a new access key",
      delete: "DELETE /api/accessKey - Delete the access key",
    },
  });
};
