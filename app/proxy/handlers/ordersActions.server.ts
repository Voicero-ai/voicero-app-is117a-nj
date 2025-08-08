import { json } from "@remix-run/node";
import {
  addCorsHeaders,
  ALLOWED_RETURN_REASONS,
  RETURN_REASON_OPTIONS,
  normalizeReturnReason,
} from "app/proxy/utils";

export async function processOrderAction(request: Request) {
  if (request.method.toLowerCase() === "options") {
    return new Response(null, addCorsHeaders({ status: 204 }));
  }

  try {
    const { authenticate } = await import("app/shopify.server");
    const { session, admin } = await authenticate.public.appProxy(request);
    if (!session || !admin) {
      return json(
        { error: "Unauthorized or app not installed" },
        addCorsHeaders({ status: 401 }),
      );
    }

    const data = await request.json();

    if (
      ![
        "refund",
        "cancel",
        "return",
        "exchange",
        "verify_order",
        "order_details",
        "return_order",
      ].includes(data.action)
    ) {
      return json(
        { success: false, error: "Unsupported order action" },
        addCorsHeaders({ status: 400 }),
      );
    }

    // Accept identifiers from various shapes (including action_context)
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

    // Find the order by name + email
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
              customer { email }
              lineItems(first: 10) { edges { node { id name quantity refundableQuantity } } }
            }
          }
        }
      }
    `;
    const queryCondition = `name:${orderIdentifier} AND customer_email:${email}`;
    const orderResponse = await (admin as any).graphql(orderQuery, {
      variables: { query: queryCondition },
    });
    const orderData = await orderResponse.json();
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

    if (data.action === "verify_order") {
      return json({ success: true, verified: true }, addCorsHeaders());
    }

    if (data.action === "order_details") {
      const includesReturnInfo =
        data.returnReason ||
        data.reason ||
        (data.action_context && data.action_context.returnReason) ||
        (data.action_context && data.action_context.reason);

      let returnReason = data.returnReason || data.reason;
      if (!returnReason && data.action_context) {
        returnReason =
          data.action_context.returnReason || data.action_context.reason;
      }

      // Normalize any provided reason to our allowed set
      const normalizedReason = normalizeReturnReason(returnReason);
      if (normalizedReason) {
        returnReason = normalizedReason;
      }

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
      } as any;

      const responseData: any = { success: true, order: formattedOrder };
      if (includesReturnInfo) {
        responseData.reason = returnReason;
        responseData.returnReason = returnReason;
        responseData.should_process_return = true;
      }
      return json(responseData, addCorsHeaders());
    }

    if (data.action === "cancel") {
      const canCancel =
        order.displayFulfillmentStatus?.toUpperCase() !== "FULFILLED" &&
        !order.cancelledAt;

      if (canCancel) {
        const cancelQuery = `
          mutation cancelOrder($orderId: ID!) {
            orderCancel(notifyCustomer: true, orderId: $orderId, reason: CUSTOMER, refund: true, restock: true) {
              job { id done }
              orderCancelUserErrors { field message }
            }
          }
        `;
        const cancelResp = await (admin as any).graphql(cancelQuery, {
          variables: { orderId: order.id },
        });
        const cancelData = await cancelResp.json();
        if (
          cancelData.data.orderCancel.orderCancelUserErrors &&
          cancelData.data.orderCancel.orderCancelUserErrors.length > 0
        ) {
          return json(
            {
              success: false,
              error:
                cancelData.data.orderCancel.orderCancelUserErrors[0].message,
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
      }

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
      }
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

    // Normalize reason fields for return flows
    if (data.returnReason && !data.reason) data.reason = data.returnReason;
    if (data.reason && !data.returnReason) data.returnReason = data.reason;
    // Enforce allowed reasons
    const normalizedIncomingReason = normalizeReturnReason(
      data.returnReason || data.reason,
    );
    if (normalizedIncomingReason) {
      data.reason = normalizedIncomingReason;
      data.returnReason = normalizedIncomingReason;
    }

    if (data.action === "exchange") {
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

    // Return handling for both return and return_order
    if (data.action === "return" || data.action === "return_order") {
      // If unfulfilled, suggest cancel
      if (
        data.action === "return_order" &&
        order.displayFulfillmentStatus === "UNFULFILLED"
      ) {
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

      const normalizedData = data;
      const returnReason = normalizedData.returnReason || normalizedData.reason;
      const returnReasonNote = normalizedData.returnReasonNote;

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
            order_details: { order_number: order.name },
          },
          addCorsHeaders(),
        );
      }

      // Fetch fulfillments to build return line items
      const getOrderQuery = `
        query getOrder($id: ID!) {
          order(id: $id) {
            id
            name
            fulfillments { id status fulfillmentLineItems(first: 20) { edges { node { id quantity lineItem { id name quantity } } } } }
            lineItems(first: 20) { edges { node { id name quantity refundableQuantity } } }
          }
        }
      `;
      const orderResp = await (admin as any).graphql(getOrderQuery, {
        variables: { id: order.id },
      });
      const orderDetails = await orderResp.json();

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

      // fulfillments is an array of objects already – do not access .node
      const fulfillment = orderDetails.data.order.fulfillments[0];
      const fulfillmentLineItems = fulfillment.fulfillmentLineItems.edges.map(
        (edge: { node: any }) => edge.node,
      );
      if (fulfillmentLineItems.length === 0) {
        return json(
          {
            success: false,
            error: "No items available to return in this order",
          },
          addCorsHeaders(),
        );
      }

      const returnLineItems = fulfillmentLineItems.map((item: any) => ({
        fulfillmentLineItemId: item.id,
        quantity: item.quantity,
        returnReason: normalizeReturnReason(returnReason) || "OTHER",
        returnReasonNote: returnReasonNote,
      }));

      // Instead of creating the Shopify return immediately, submit a review request
      return json(
        {
          success: true,
          message: `Your return request for order ${order.name} has been submitted for review. You'll receive an update by email once it's processed.`,
          status: "pending_review",
          review_required: true,
          approval_required: true,
          order: { id: order.id, name: order.name },
          requested_items: returnLineItems,
          reason: normalizeReturnReason(returnReason) || "OTHER",
          returnReason: normalizeReturnReason(returnReason) || "OTHER",
          reason_note: returnReasonNote,
          returnReasonNote: returnReasonNote,
        },
        addCorsHeaders(),
      );
    }

    return json(
      {
        success: false,
        error: `The requested action '${data.action}' is not supported or not available for this order`,
      },
      addCorsHeaders(),
    );
  } catch (error) {
    return json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "An unknown error occurred",
      },
      addCorsHeaders({ status: 500 }),
    );
  }
}
