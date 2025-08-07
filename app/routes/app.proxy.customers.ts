import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "app/shopify.server";
import {
  addCorsHeaders,
  validateCustomerFields,
  getFriendlyErrorMessage,
} from "app/proxy/utils";

export const dynamic = "force-dynamic";

// Handles POST from frontend: { action: "updateCustomer", customer: {...} }
export async function processCustomerAction(request: Request) {
  if (request.method.toLowerCase() === "options") {
    return new Response(null, addCorsHeaders({ status: 204 }));
  }

  try {
    const { session, admin } = await authenticate.public.appProxy(request);
    if (!session || !admin) {
      return json(
        { error: "Unauthorized or app not installed" },
        addCorsHeaders({ status: 401 }),
      );
    }

    const data = await request.json();
    if (!(data?.action === "updateCustomer" && data.customer)) {
      return json(
        { success: false, error: "Unsupported action for customers route" },
        addCorsHeaders({ status: 400 }),
      );
    }

    const customerId = data.customer.id;
    const hasAddressUpdate = !!data.customer.defaultAddress;
    const addressData = data.customer.defaultAddress;

    const customerInput = { ...data.customer };
    delete (customerInput as any).id;
    delete (customerInput as any).defaultAddress;

    if (Object.keys(customerInput).length === 0 && !hasAddressUpdate) {
      return json(
        { success: false, error: "No valid fields to update" },
        addCorsHeaders(),
      );
    }

    const validationErrors = validateCustomerFields({
      ...customerInput,
      ...(hasAddressUpdate ? { defaultAddress: addressData } : {}),
    });
    if (validationErrors.length > 0) {
      return json(
        {
          success: false,
          error: validationErrors.join(". "),
          validationErrors,
        },
        addCorsHeaders(),
      );
    }

    let responseData;

    if (hasAddressUpdate) {
      // Query for default address
      const customerQuery = `
        query getCustomer($customerId: ID!) {
          customer(id: $customerId) { defaultAddress { id } }
        }
      `;
      const customerResponse = await (admin as any).graphql(customerQuery, {
        variables: { customerId: `gid://shopify/Customer/${customerId}` },
      });
      const customerData = await customerResponse.json();

      const addressInput = {
        address1: addressData.address1,
        address2: addressData.address2 || "",
        city: addressData.city,
        province: addressData.province,
        zip: addressData.zip,
        country: addressData.country,
        phone: addressData.phone || "",
      };

      const defaultAddressId = customerData.data.customer.defaultAddress?.id;
      if (defaultAddressId) {
        const updateAddressMutation = `
          mutation customerAddressUpdate($address: MailingAddressInput!, $addressId: ID!, $customerId: ID!, $setAsDefault: Boolean) {
            customerAddressUpdate(address: $address, addressId: $addressId, customerId: $customerId, setAsDefault: $setAsDefault) {
              address { id formatted }
              userErrors { field message }
            }
          }
        `;
        const updateResponse = await (admin as any).graphql(
          updateAddressMutation,
          {
            variables: {
              address: addressInput,
              addressId: defaultAddressId,
              customerId: `gid://shopify/Customer/${customerId}`,
              setAsDefault: true,
            },
          },
        );
        const updateResult = await updateResponse.json();
        if (
          updateResult.data.customerAddressUpdate.userErrors &&
          updateResult.data.customerAddressUpdate.userErrors.length > 0
        ) {
          const errors = updateResult.data.customerAddressUpdate.userErrors;
          const friendlyErrors = errors.map(
            (e: { field: string; message: string }) =>
              getFriendlyErrorMessage(e.field, e.message),
          );
          return json(
            {
              success: false,
              error: friendlyErrors.join(". "),
              details: errors,
            },
            addCorsHeaders(),
          );
        }
      } else {
        const createAddressMutation = `
          mutation customerAddressCreate($address: MailingAddressInput!, $customerId: ID!, $setAsDefault: Boolean) {
            customerAddressCreate(address: $address, customerId: $customerId, setAsDefault: $setAsDefault) {
              address { id formatted }
              userErrors { field message }
            }
          }
        `;
        const createResponse = await (admin as any).graphql(
          createAddressMutation,
          {
            variables: {
              address: addressInput,
              customerId: `gid://shopify/Customer/${customerId}`,
              setAsDefault: true,
            },
          },
        );
        const createResult = await createResponse.json();
        if (
          createResult.data.customerAddressCreate.userErrors &&
          createResult.data.customerAddressCreate.userErrors.length > 0
        ) {
          const errors = createResult.data.customerAddressCreate.userErrors;
          const friendlyErrors = errors.map(
            (e: { field: string; message: string }) =>
              getFriendlyErrorMessage(e.field, e.message),
          );
          return json(
            {
              success: false,
              error: friendlyErrors.join(". "),
              details: errors,
            },
            addCorsHeaders(),
          );
        }
      }

      // Fetch final customer data
      const finalQuery = `
        query getUpdatedCustomer($customerId: ID!) {
          customer(id: $customerId) {
            id firstName lastName email phone
            defaultAddress { id address1 address2 city province provinceCode zip country countryCode phone formatted }
            addresses(first: 10) { edges { node { id address1 city province zip country formatted default } } }
          }
        }
      `;
      const finalResponse = await (admin as any).graphql(finalQuery, {
        variables: { customerId: `gid://shopify/Customer/${customerId}` },
      });
      const finalResult = await finalResponse.json();
      responseData = finalResult.data.customer;
    } else {
      // Update basic fields only
      const updateMutation = `
        mutation customerUpdate($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer {
              id firstName lastName email phone
              defaultAddress { id address1 address2 city province provinceCode zip country countryCode phone formatted }
            }
            userErrors { field message }
          }
        }
      `;
      const response = await (admin as any).graphql(updateMutation, {
        variables: {
          input: {
            id: `gid://shopify/Customer/${customerId}`,
            ...customerInput,
          },
        },
      });
      const result = await response.json();
      if (
        result.data.customerUpdate.userErrors &&
        result.data.customerUpdate.userErrors.length > 0
      ) {
        const errors = result.data.customerUpdate.userErrors;
        const friendlyErrors = errors.map(
          (e: { field: string; message: string }) =>
            getFriendlyErrorMessage(e.field, e.message),
        );
        return json(
          { success: false, error: friendlyErrors.join(". "), details: errors },
          addCorsHeaders(),
        );
      }
      responseData = result.data.customerUpdate.customer;
    }

    return json({ success: true, customer: responseData }, addCorsHeaders());
  } catch (error) {
    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? `Unable to update your account at this time. Please wait a moment and try again later. Technical details: ${error.message}`
            : "We're unable to update your account right now. Please wait a few minutes and try again later.",
      },
      addCorsHeaders({ status: 500 }),
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return processCustomerAction(request);
}
