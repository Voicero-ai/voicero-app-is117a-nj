import { ActionFunction, LoaderFunction, json } from "@remix-run/node";
import {
  addCorsHeaders,
  RETURN_REASON_OPTIONS,
  normalizeReturnReason,
} from "app/proxy/utils";
import { loader as listOrdersLoader } from "./app.proxy.orders";
import { processCustomerAction } from "app/proxy/handlers/customers.server";
import { processOrderAction } from "app/proxy/handlers/ordersActions.server";

export const dynamic = "force-dynamic";

// CORS helper moved to app/proxy/utils

export const loader: LoaderFunction = async (args) => {
  return listOrdersLoader(args as any);
};

export const action: ActionFunction = async ({ request }) => {
  console.log("🔥 APP PROXY ACTION HIT 🔥");
  console.log("Request URL:", request.url);
  console.log("Request method:", request.method);

  // Handle preflight requests
  if (request.method.toLowerCase() === "options") {
    return new Response(null, addCorsHeaders({ status: 204 }));
  }

  // Early delegation to split handlers so we can keep this file thin
  try {
    const dataPreview = await request
      .clone()
      .json()
      .catch(() => ({}));
    if (dataPreview?.action === "updateCustomer" && dataPreview.customer) {
      return processCustomerAction(request);
    }
    if (
      [
        "refund",
        "cancel",
        "return",
        "exchange",
        "verify_order",
        "order_details",
        "return_order",
      ].includes(dataPreview?.action)
    ) {
      return processOrderAction(request);
    }
  } catch (_) {
    // ignore and fall back to legacy logic below
  }

  try {
    // Authenticate the app proxy request
    const { authenticate } = await import("app/shopify.server");
    const { session, admin } = await authenticate.public.appProxy(request);

    if (!session || !admin) {
      console.log("⚠️ No session or admin API client available in action");
      return json(
        { error: "Unauthorized or app not installed" },
        addCorsHeaders({ status: 401 }),
      );
    }

    console.log("✅ Action session authenticated successfully");
    console.log("Shop domain:", session.shop);

    // Handle POST/PUT/DELETE requests here
    const data = await request.json();
    console.log("Received data:", data);

    // Additional logging for return-related actions
    if (data.action === "return" || data.returnReason || data.reason) {
      console.log("🔄 RETURN ACTION DETECTED! Details:", {
        action: data.action,
        returnReason: data.returnReason,
        reason: data.reason,
        order_id: data.order_id,
        email: data.email,
      });
    }

    // Handle customer update action
    if (data.action === "updateCustomer" && data.customer) {
      console.log("Processing customer update:", data.customer);

      try {
        // Get the customer ID and address data
        const customerId = data.customer.id;
        const hasAddressUpdate = !!data.customer.defaultAddress;
        const addressData = data.customer.defaultAddress;

        // Create a copy of customer data without the ID and address for basic customer updates
        const customerInput = { ...data.customer };
        delete customerInput.id;
        delete customerInput.defaultAddress;

        // Check if we have any data to update
        if (Object.keys(customerInput).length === 0 && !hasAddressUpdate) {
          return json(
            { success: false, error: "No valid fields to update" },
            addCorsHeaders(),
          );
        }

        // Validate the data before proceeding
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

        // CASE 1: We're updating the customer's address
        if (hasAddressUpdate) {
          console.log("Updating customer address");

          // Step 1: Check if customer has a default address
          const customerQuery = `
            query getCustomer($customerId: ID!) {
              customer(id: $customerId) {
                defaultAddress {
                  id
                }
              }
            }
          `;

          const customerResponse = await admin.graphql(customerQuery, {
            variables: {
              customerId: `gid://shopify/Customer/${customerId}`,
            },
          });

          const customerData = await customerResponse.json();
          console.log("Customer data:", customerData);

          // Format address data
          const addressInput = {
            address1: addressData.address1,
            address2: addressData.address2 || "",
            city: addressData.city,
            province: addressData.province,
            zip: addressData.zip,
            country: addressData.country,
            phone: addressData.phone || "",
          };

          // Check if customer has a default address to update
          const defaultAddressId =
            customerData.data.customer.defaultAddress?.id;

          if (defaultAddressId) {
            // Step 2A: Update existing default address
            console.log("Updating existing default address:", defaultAddressId);

            const updateAddressMutation = `
              mutation customerAddressUpdate(
                $address: MailingAddressInput!, 
                $addressId: ID!, 
                $customerId: ID!, 
                $setAsDefault: Boolean
              ) {
                customerAddressUpdate(
                  address: $address, 
                  addressId: $addressId, 
                  customerId: $customerId, 
                  setAsDefault: $setAsDefault
                ) {
                  address {
                    id
                    formatted
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            const updateResponse = await admin.graphql(updateAddressMutation, {
              variables: {
                address: addressInput,
                addressId: defaultAddressId,
                customerId: `gid://shopify/Customer/${customerId}`,
                setAsDefault: true,
              },
            });

            const updateResult = await updateResponse.json();
            console.log("Address update result:", updateResult);

            // Check for errors
            if (
              updateResult.data.customerAddressUpdate.userErrors &&
              updateResult.data.customerAddressUpdate.userErrors.length > 0
            ) {
              const errors = updateResult.data.customerAddressUpdate.userErrors;
              const friendlyErrors = errors.map(
                (e: { field: string; message: string }) => {
                  return getFriendlyErrorMessage(e.field, e.message);
                },
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
            // Step 2B: Create new address
            console.log("Creating new address for customer");

            const createAddressMutation = `
              mutation customerAddressCreate(
                $address: MailingAddressInput!, 
                $customerId: ID!, 
                $setAsDefault: Boolean
              ) {
                customerAddressCreate(
                  address: $address, 
                  customerId: $customerId, 
                  setAsDefault: $setAsDefault
                ) {
                  address {
                    id
                    formatted
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            const createResponse = await admin.graphql(createAddressMutation, {
              variables: {
                address: addressInput,
                customerId: `gid://shopify/Customer/${customerId}`,
                setAsDefault: true,
              },
            });

            const createResult = await createResponse.json();
            console.log("Address create result:", createResult);

            // Check for errors
            if (
              createResult.data.customerAddressCreate.userErrors &&
              createResult.data.customerAddressCreate.userErrors.length > 0
            ) {
              const errors = createResult.data.customerAddressCreate.userErrors;
              const friendlyErrors = errors.map(
                (e: { field: string; message: string }) => {
                  return getFriendlyErrorMessage(e.field, e.message);
                },
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

            // Step 3: Get the newly created address ID
            const newAddressId =
              createResult.data.customerAddressCreate.address.id;
            console.log("New address created:", newAddressId);

            // We don't need to set as default separately since we're using setAsDefault: true in the create mutation
          }

          // Step 4: Get updated customer data
          const finalQuery = `
            query getUpdatedCustomer($customerId: ID!) {
              customer(id: $customerId) {
                id
                firstName
                lastName
                email
                phone
                defaultAddress {
                  id
                  address1
                  address2
                  city
                  province
                  provinceCode
                  zip
                  country
                  countryCode
                  phone
                  formatted
                }
                addresses(first: 10) {
                  edges {
                    node {
                      id
                      address1
                      city
                      province
                      zip
                      country
                      formatted
                      default
                    }
                  }
                }
              }
            }
          `;

          const finalResponse = await admin.graphql(finalQuery, {
            variables: {
              customerId: `gid://shopify/Customer/${customerId}`,
            },
          });

          const finalResult = await finalResponse.json();
          console.log("Final customer data:", finalResult);

          responseData = finalResult.data.customer;
        }
        // CASE 2: Just updating customer details
        else {
          console.log("Updating customer details (no address)");

          const updateMutation = `
            mutation customerUpdate($input: CustomerInput!) {
              customerUpdate(input: $input) {
                customer {
                  id
                  firstName
                  lastName
                  email
                  phone
                  defaultAddress {
                    id
                    address1
                    address2
                    city
                    province
                    provinceCode
                    zip
                    country
                    countryCode
                    phone
                    formatted
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const response = await admin.graphql(updateMutation, {
            variables: {
              input: {
                id: `gid://shopify/Customer/${customerId}`,
                ...customerInput,
              },
            },
          });

          const result = await response.json();
          console.log("Customer update result:", result);

          // Check for errors
          if (
            result.data.customerUpdate.userErrors &&
            result.data.customerUpdate.userErrors.length > 0
          ) {
            const errors = result.data.customerUpdate.userErrors;
            const friendlyErrors = errors.map(
              (e: { field: string; message: string }) => {
                return getFriendlyErrorMessage(e.field, e.message);
              },
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

          responseData = result.data.customerUpdate.customer;
        }

        // Success!
        return json(
          {
            success: true,
            customer: responseData,
          },
          addCorsHeaders(),
        );
      } catch (error) {
        console.error("Error updating customer:", error);
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

    // Handle order management actions
    if (
      [
        "refund",
        "cancel",
        "return",
        "exchange",
        "verify_order",
        "order_details",
      ].includes(data.action)
    ) {
      console.log(`Processing ${data.action} request:`, data);

      // Get the order_id or number (support various client formats and action_context)
      const orderIdentifier =
        data.order_id ||
        data.orderNumber ||
        data.order_number ||
        (data.action_context && data.action_context.order_id);
      const email =
        data.email ||
        data.order_email ||
        (data.action_context && data.action_context.order_email);

      if (!orderIdentifier) {
        return json(
          { success: false, error: "Missing order identifier" },
          addCorsHeaders(),
        );
      }

      if (!email) {
        return json(
          { success: false, error: "Missing email address" },
          addCorsHeaders(),
        );
      }

      // First verify the order exists and belongs to this customer
      try {
        // Query to find the order
        const orderQuery = `
          query getOrderByNumber($query: String!) {
            orders(first: 1, query: $query) {
              edges {
                node {
                  id
                  name
                  processedAt
                  cancelledAt
                  displayFulfillmentStatus
                  displayFinancialStatus
                  refundable
                  customer {
                    email
                  }
                  lineItems(first: 10) {
                    edges {
                      node {
                        id
                        name
                        quantity
                        refundableQuantity
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        // Build the query condition - try to match by order number and email
        const queryCondition = `name:${orderIdentifier} AND customer_email:${email}`;

        const orderResponse = await admin.graphql(orderQuery, {
          variables: {
            query: queryCondition,
          },
        });

        const orderData = await orderResponse.json();
        console.log("Order lookup result:", orderData);

        // Check if we found the order
        if (!orderData.data.orders.edges.length) {
          return json(
            {
              success: false,
              error: "Order not found or does not match the provided email",
              verified: false,
            },
            addCorsHeaders(),
          );
        }

        const order = orderData.data.orders.edges[0].node;

        // Verify the email matches
        if (
          order.customer &&
          order.customer.email.toLowerCase() !== email.toLowerCase()
        ) {
          return json(
            {
              success: false,
              error: "The email address does not match the one on the order",
              verified: false,
            },
            addCorsHeaders(),
          );
        }

        // If this is just a verification request, return success
        if (data.action === "verify_order") {
          return json({ success: true, verified: true }, addCorsHeaders());
        }

        // If this is an order details request, return the order data
        if (data.action === "order_details") {
          // Check if this request includes return reasons (for client compatibility)
          // Also check action_context which is where AI often puts data
          const includesReturnInfo =
            data.returnReason ||
            data.reason ||
            (data.action_context && data.action_context.returnReason) ||
            (data.action_context && data.action_context.reason);

          // Extract any return reasons from action_context if available
          let returnReason = data.returnReason || data.reason;
          if (!returnReason && data.action_context) {
            returnReason =
              data.action_context.returnReason || data.action_context.reason;
          }

          // Normalize any provided reason to our allowed set
          const normalizedOrderDetailsReason =
            normalizeReturnReason(returnReason);
          if (normalizedOrderDetailsReason) {
            returnReason = normalizedOrderDetailsReason;
          }

          // Log if return info is detected in order_details call
          if (includesReturnInfo) {
            console.log("⚠️ DETECTED RETURN INFO IN ORDER_DETAILS CALL:", {
              returnReason,
              originalAction: data.action,
              order_id: data.order_id,
              email: data.email,
            });
          }

          // Format the order details in a user-friendly way
          const formattedOrder = {
            id: order.id,
            order_number: order.name.replace("#", ""),
            name: order.name,
            processed_at: order.processedAt,
            status: order.displayFulfillmentStatus,
            financial_status: order.displayFinancialStatus,
            refundable: order.refundable,
            fulfillmentStatus: order.fulfillmentStatus,
            cancelledAt: order.cancelledAt,
            canCancel:
              order.fulfillmentStatus === "UNFULFILLED" && !order.cancelledAt,
            line_items: order.lineItems.edges.map((edge: { node: any }) => ({
              id: edge.node.id,
              title: edge.node.name,
              quantity: edge.node.quantity,
              refundable_quantity: edge.node.refundableQuantity,
              current_quantity: edge.node.currentQuantity,
              price: edge.node.variant ? edge.node.variant.price : null,
              variant_id: edge.node.variant ? edge.node.variant.id : null,
              variant_title: edge.node.variant ? edge.node.variant.title : null,
            })),
          };

          // If this is part of a return flow, include the reason and returnReason
          const responseData: {
            success: boolean;
            order: typeof formattedOrder;
            reason?: string;
            returnReason?: string;
            should_process_return?: boolean;
          } = {
            success: true,
            order: formattedOrder,
          };

          // Pass along return information if provided
          if (includesReturnInfo) {
            responseData.reason = returnReason;
            responseData.returnReason = returnReason;
            // Add a flag to tell the client to process this as a return directly
            responseData.should_process_return = true;
            console.log("Including return info in order_details response:", {
              reason: responseData.reason,
              returnReason: responseData.returnReason,
              should_process_return: responseData.should_process_return,
            });
          }

          return json(responseData, addCorsHeaders());
        }

        // Process the requested action
        if (data.action === "cancel") {
          // Log detailed order status information
          console.log("Order status check:", {
            id: order.id,
            name: order.name,
            fulfillmentStatus: order.displayFulfillmentStatus,
            financialStatus: order.displayFinancialStatus,
            cancelledAt: order.cancelledAt,
            refundable: order.refundable,
          });

          // Updated condition: orders can be canceled if they're not fulfilled and not already canceled
          const canCancel =
            order.displayFulfillmentStatus?.toUpperCase() !== "FULFILLED" &&
            !order.cancelledAt;

          if (canCancel) {
            const cancelQuery = `
      mutation cancelOrder($orderId: ID!) {
        orderCancel(
          notifyCustomer: true
          orderId:        $orderId
          reason:         CUSTOMER
          refund:         true
          restock:        true
        ) {
          job { id done }
          orderCancelUserErrors { field message }
        }
      }
    `;

            const cancelResp = await admin.graphql(cancelQuery, {
              variables: { orderId: order.id },
            });

            const cancelData = await cancelResp.json();
            console.log("Cancel result:", cancelData);

            if (
              cancelData.data.orderCancel.orderCancelUserErrors &&
              cancelData.data.orderCancel.orderCancelUserErrors.length > 0
            ) {
              return json(
                {
                  success: false,
                  error:
                    cancelData.data.orderCancel.orderCancelUserErrors[0]
                      .message,
                },
                addCorsHeaders(),
              );
            }

            return json(
              {
                success: true,
                message: `Order ${order.name} has been cancelled successfully`,
              },
              addCorsHeaders(),
            );
          } else {
            // Check if order is fulfilled
            if (order.displayFulfillmentStatus === "FULFILLED") {
              return json(
                {
                  success: false,
                  error:
                    "This order has already been fulfilled and cannot be cancelled. Once you receive your order, you can initiate a return.",
                  suggest_return: true,
                  order_details: {
                    order_number: order.name,
                    status: order.displayFulfillmentStatus,
                  },
                },
                addCorsHeaders(),
              );
            } else {
              // Not cancelable for other reasons
              return json(
                {
                  success: false,
                  error:
                    "This order cannot be cancelled at this time. This may be because payment processing has already completed.",
                  suggest_contact: true,
                },
                addCorsHeaders(),
              );
            }
          }
        }

        // This is more complex and often requires a return merchandise authorization (RMA) process
        // For now, we'll acknowledge the request and provide instructions
        if (
          data.action === "return" ||
          data.action === "exchange" ||
          data.action === "return_order"
        ) {
          // SIMPLEST FIX: If returnReason exists but reason doesn't, copy returnReason to reason
          if (data.returnReason && !data.reason) {
            data.reason = data.returnReason;
            console.log("Copied returnReason to reason:", data.reason);
          }

          // Also do the reverse for maximum compatibility
          if (data.reason && !data.returnReason) {
            data.returnReason = data.reason;
            console.log("Copied reason to returnReason:", data.returnReason);
          }

          // Direct action for return_order with reason
          if (
            (data.action === "return_order" || data.action === "return") &&
            (data.reason || data.returnReason)
          ) {
            console.log(
              `DIRECT PROCESSING - ${data.action} with reason:`,
              data.reason || data.returnReason,
            );

            // Use the reason we have to start the return immediately
            if (data.action === "return") {
              // Process full return logic instead of simple acknowledgment
              console.log(
                "Using full return processing logic for 'return' action",
              );

              // Normalize data format for consistency
              let normalizedData = data;
              const returnReason =
                normalizedData.returnReason || normalizedData.reason;
              const returnReasonNote = normalizedData.returnReasonNote;

              console.log("Processing return request with details:", {
                orderNumber: normalizedData.order_id,
                email: normalizedData.email,
                reason: returnReason,
                returnReason,
                returnReasonNote,
              });

              try {
                // First, get the order details including fulfillment information
                const getOrderQuery = `
                query getOrder($id: ID!) {
                  order(id: $id) {
                    id
                    name
                    fulfillments {
                      id
                      status
                      fulfillmentLineItems(first: 20) {
                        edges {
                          node {
                            id
                            quantity
                            lineItem {
                              id
                              name
                              quantity
                            }
                          }
                        }
                      }
                    }
                    lineItems(first: 20) {
                      edges {
                        node {
                          id
                          name
                          quantity
                          refundableQuantity
                        }
                      }
                    }
                  }
                }

                `;

                const orderResponse = await admin.graphql(getOrderQuery, {
                  variables: { id: order.id },
                });

                const orderDetails = await orderResponse.json();
                console.log("Order details for return:", orderDetails);

                // Check if there are fulfillments
                if (!orderDetails.data.order.fulfillments.length) {
                  return json(
                    {
                      success: false,
                      error:
                        "This order doesn't have any fulfilled items that can be returned",
                      suggest_cancel: true,
                      message:
                        "Your order hasn't shipped yet. Instead of a return, you can cancel this order to get a full refund.",
                      order_details: {
                        order_number: order.name,
                        status: order.displayFulfillmentStatus,
                      },
                    },
                    addCorsHeaders(),
                  );
                }

                // Get the fulfillment line items
                // fulfillments is an array of objects – not edges; do not access .node
                const fulfillment = orderDetails.data.order.fulfillments[0];
                const fulfillmentLineItems =
                  fulfillment.fulfillmentLineItems.edges.map(
                    (edge: { node: any }) => edge.node,
                  );

                // If no fulfillment line items, can't process return
                if (fulfillmentLineItems.length === 0) {
                  return json(
                    {
                      success: false,
                      error: "No items available to return in this order",
                    },
                    addCorsHeaders(),
                  );
                }

                // Create return input with all items in the fulfillment
                const returnLineItems = fulfillmentLineItems.map(
                  (item: any) => ({
                    fulfillmentLineItemId: item.id,
                    quantity: item.quantity,
                    returnReason: returnReason,
                    returnReasonNote: returnReasonNote,
                  }),
                );

                // Do not create Shopify return immediately; submit pending review response
                return json(
                  {
                    success: true,
                    message: `Your return request for order ${order.name} has been submitted for review. You'll receive an update by email once it's processed.`,
                    status: "pending_review",
                    review_required: true,
                    approval_required: true,
                    order: { id: order.id, name: order.name },
                    requested_items: returnLineItems,
                    reason: returnReason,
                    returnReason: returnReason,
                    reason_note: returnReasonNote,
                    returnReasonNote: returnReasonNote,
                  },
                  addCorsHeaders(),
                );
              } catch (error) {
                console.error("Error processing return request:", error);
                return json(
                  {
                    success: false,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to process return request",
                    errorStack:
                      error instanceof Error ? error.stack : undefined,
                  },
                  addCorsHeaders({ status: 500 }),
                );
              }
            } else {
              // Original return_order flow response
              return json(
                {
                  success: true,
                  message: `Return for order ${data.order_id || data.order_number} is being processed.`,
                  reason: data.reason || data.returnReason,
                  returnReason: data.returnReason || data.reason,
                  order_id: data.order_id || data.order_number,
                  email: data.email || data.order_email,
                  action: "return",
                  skip_reason_prompt: true,
                },
                addCorsHeaders(),
              );
            }
          }

          // Special handling for return_order which is our comprehensive return flow
          let normalizedData = data; // Use a new variable instead of modifying data directly

          if (data.action === "return_order") {
            console.log("Return order data received:", normalizedData);
            console.log("Action context:", normalizedData.action_context);

            // Check if order is unfulfilled - if so, suggest cancellation instead of return
            if (order.displayFulfillmentStatus === "UNFULFILLED") {
              return json(
                {
                  success: false,
                  error: "This order hasn't shipped yet and cannot be returned",
                  suggest_cancel: true,
                  message:
                    "Your order hasn't shipped yet. Instead of a return, you can cancel this order to get a full refund.",
                  order_details: {
                    order_number: order.name,
                    status: order.displayFulfillmentStatus,
                  },
                },
                addCorsHeaders(),
              );
            }

            // Now we use the normalized data directly
            const returnReason =
              normalizeReturnReason(
                normalizedData.returnReason || normalizedData.reason,
              ) || "OTHER";
            const returnReasonNote = normalizedData.returnReasonNote;

            console.log("Extracted return reason:", returnReason);
            console.log("Extracted return reason note:", returnReasonNote);

            // If we don't have a specific return reason yet, ask the user to provide one
            // Check thoroughly for ANY valid reason in the data
            const hasValidReason =
              returnReason ||
              normalizedData.reason ||
              normalizedData.returnReason ||
              (normalizedData.action_context &&
                normalizedData.action_context.reason) ||
              (normalizedData.action_context &&
                normalizedData.action_context.returnReason);

            if (!hasValidReason) {
              return json(
                {
                  success: false,
                  need_reason: true,
                  message: "Please provide a reason for your return",
                  options: RETURN_REASON_OPTIONS,
                  order_details: {
                    order_number: order.name,
                  },
                },
                addCorsHeaders(),
              );
            }

            console.log("Processing return request with details:", {
              orderNumber: normalizedData.order_id,
              email: normalizedData.email,
              reason: returnReason, // Include 'reason' for client-side compatibility
              returnReason,
              returnReasonNote,
            });

            try {
              // First, get the order details including fulfillment information
              const getOrderQuery = `
                
              query getOrder($id: ID!) {
                order(id: $id) {
                  id
                  name
                  fulfillments {
                    id
                    status
                    fulfillmentLineItems(first: 20) {
                      edges {
                        node {
                          id
                          quantity
                          lineItem {
                            id
                            name
                            quantity
                          }
                        }
                      }
                    }
                  }
                  lineItems(first: 20) {
                    edges {
                      node {
                        id
                        name
                        quantity
                        refundableQuantity
                      }
                    }
                  }
                }
              }

              `;

              const orderResponse = await admin.graphql(getOrderQuery, {
                variables: { id: order.id },
              });

              const orderDetails = await orderResponse.json();
              console.log("Order details for return:", orderDetails);

              // Check if there are fulfillments
              if (!orderDetails.data.order.fulfillments.length) {
                return json(
                  {
                    success: false,
                    error:
                      "This order doesn't have any fulfilled items that can be returned",
                    suggest_cancel: true,
                    message:
                      "Your order hasn't shipped yet. Instead of a return, you can cancel this order to get a full refund.",
                    order_details: {
                      order_number: order.name,
                      status: order.displayFulfillmentStatus,
                    },
                  },
                  addCorsHeaders(),
                );
              }

              // Get the fulfillment line items (first fulfillment object)
              const fulfillment = orderDetails.data.order.fulfillments[0];
              const fulfillmentLineItems =
                fulfillment.fulfillmentLineItems.edges.map(
                  (edge: { node: any }) => edge.node,
                );

              // If no fulfillment line items, can't process return
              if (fulfillmentLineItems.length === 0) {
                return json(
                  {
                    success: false,
                    error: "No items available to return in this order",
                  },
                  addCorsHeaders(),
                );
              }

              // Create return input with all items in the fulfillment
              const returnLineItems = fulfillmentLineItems.map((item: any) => ({
                fulfillmentLineItemId: item.id,
                quantity: item.quantity,
                returnReason: returnReason,
                returnReasonNote: returnReasonNote,
              }));

              // Do not create Shopify return immediately; submit pending review response
              return json(
                {
                  success: true,
                  message: `Your return request for order ${order.name} has been submitted for review. You'll receive an update by email once it's processed.`,
                  status: "pending_review",
                  review_required: true,
                  approval_required: true,
                  order: { id: order.id, name: order.name },
                  requested_items: returnLineItems,
                  reason: returnReason, // For client compatibility
                  returnReason: returnReason, // For server compatibility
                  reason_note: returnReasonNote, // Additional compatibility format
                  returnReasonNote: returnReasonNote, // Complete all formats
                },
                addCorsHeaders(),
              );
            } catch (error) {
              console.error("Error processing return request:", error);
              return json(
                {
                  success: false,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to process return request",
                  errorStack: error instanceof Error ? error.stack : undefined,
                },
                addCorsHeaders({ status: 500 }),
              );
            }
          } else if (data.action === "exchange") {
            // Original code for simple exchange acknowledgment
            return json(
              {
                success: true,
                message: `Your exchange request for order ${order.name} has been received. Our customer service team will contact you shortly with next steps.`,
                order_number: order.name,
                status: "pending_approval",
              },
              addCorsHeaders(),
            );
          }
        }

        // If we reach here, the requested action wasn't supported
        return json(
          {
            success: false,
            error: `The requested action '${data.action}' is not supported or not available for this order`,
          },
          addCorsHeaders(),
        );
      } catch (error) {
        console.error(`Error processing ${data.action} request:`, error);
        return json(
          {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "An unknown error occurred",
          },
          addCorsHeaders({ status: 500 }),
        );
      }
    }

    // Depending on what you want to do with POST requests
    // This is just a placeholder for now
    return json(
      { success: true, message: "Action processed" },
      addCorsHeaders(),
    );
  } catch (error) {
    console.error("❌ Error in app proxy action:", error);
    return json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to process action",
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      addCorsHeaders({ status: 500 }),
    );
  }
};

// Function to validate customer fields before sending to API
function validateCustomerFields(customer: any): string[] {
  const errors: string[] = [];

  // Validate phone number if provided
  if (customer.phone) {
    // Remove all non-digit characters for validation
    const digitsOnly = customer.phone.replace(/\D/g, "");

    if (digitsOnly.length < 10) {
      errors.push("Phone number must have at least 10 digits");
    } else if (digitsOnly.length > 15) {
      errors.push("Phone number has too many digits");
    }

    // Check if phone contains any valid digits
    if (!/\d/.test(customer.phone)) {
      errors.push("Phone number must contain numeric digits");
    }
  }

  // Validate email if provided
  if (customer.email) {
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      errors.push(
        "Email address format is invalid. Please provide a valid email (example: name@example.com)",
      );
    }
  }

  // Validate default address if provided
  if (customer.defaultAddress) {
    const address = customer.defaultAddress;

    // Check if the address is an object with the required properties
    if (typeof address !== "object") {
      errors.push(
        "Address must be provided as a complete object with all required fields",
      );
      return errors;
    }

    // Check required address fields
    if (!address.address1 || !String(address.address1).trim()) {
      errors.push("Street address is required");
    }

    if (!address.city || !String(address.city).trim()) {
      errors.push("City is required for the address");
    }

    if (!address.zip || !String(address.zip).trim()) {
      errors.push("ZIP/Postal code is required for the address");
    }

    if (!address.country && !address.countryCode) {
      errors.push("Country is required for the address");
    }

    // Not all jurisdictions require provinces/states, so this is less strict
    if (
      address.country === "United States" ||
      address.country === "US" ||
      address.countryCode === "US" ||
      address.country === "Canada" ||
      address.country === "CA" ||
      address.countryCode === "CA"
    ) {
      if (!address.province && !address.provinceCode) {
        errors.push(
          "State/Province is required for addresses in the US and Canada",
        );
      }
    }
  }

  return errors;
}

// Function to convert API error messages to user-friendly messages
function getFriendlyErrorMessage(field: string, message: string): string {
  // Map of common error messages to more user-friendly versions
  const errorMap: Record<string, string> = {
    // Phone errors
    "phone is invalid":
      "The phone number format is invalid. Please use a standard format like (123) 456-7890 or +1 234 567 8901.",

    // Email errors
    "email is invalid":
      "The email address format is invalid. Please provide a valid email (example: name@example.com).",
    "email has already been taken":
      "This email address is already in use by another account.",

    // Address errors
    "address1 can't be blank": "Street address cannot be empty.",
    "city can't be blank": "City cannot be empty.",
    "province can't be blank": "State/Province cannot be empty.",
    "zip can't be blank": "ZIP/Postal code cannot be empty.",
    "country can't be blank": "Country cannot be empty.",
    "defaultAddress.address1 can't be blank": "Street address cannot be empty.",
    "defaultAddress.city can't be blank": "City cannot be empty.",
    "defaultAddress.province can't be blank": "State/Province cannot be empty.",
    "defaultAddress.zip can't be blank": "ZIP/Postal code cannot be empty.",
    "defaultAddress.country can't be blank": "Country cannot be empty.",

    // Name errors
    "first_name can't be blank": "First name cannot be empty.",
    "last_name can't be blank": "Last name cannot be empty.",
  };

  // Build the lookup key from field and message
  const lookupKey = message.toLowerCase();

  // Check if we have a friendly message for this error
  if (errorMap[lookupKey]) {
    return errorMap[lookupKey];
  }

  // Handle address field errors more cleanly
  if (field && field.startsWith("defaultAddress.")) {
    const addressPart = field.replace("defaultAddress.", "");
    const readableField = addressPart
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());

    return `Address ${readableField}: ${message}`;
  }

  // If the field is specified, create a field-specific message
  if (field) {
    const readableField = field
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());

    return `${readableField}: ${message}`;
  }

  // Default fallback
  return message;
}
