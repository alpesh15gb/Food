/**
 * Order State Machine — enforces valid order transitions.
 *
 * States: PENDING_PAYMENT → PAYMENT_CONFIRMED → PLACED → RESTAURANT_ACCEPTED →
 * PREPARING → READY_FOR_PICKUP → DELIVERY_REQUESTED → RIDER_ASSIGNED →
 * PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
 *
 * Also supports: CANCELLED, REJECTED, REFUND_PENDING, REFUNDED
 * Payment failure: PENDING_PAYMENT → PAYMENT_CONFIRMED (failed)
 */

type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_CONFIRMED"
  | "PLACED"
  | "RESTAURANT_ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "DELIVERY_REQUESTED"
  | "RIDER_ASSIGNED"
  | "PICKED_UP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED"
  | "REFUND_PENDING"
  | "REFUNDED";

type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUND_PENDING"
  | "REFUNDED";

/**
 * Valid order status transitions.
 * Maps current status → set of valid next statuses.
 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAYMENT_CONFIRMED", "CANCELLED"],
  PAYMENT_CONFIRMED: ["PLACED", "CANCELLED"],
  PLACED: ["RESTAURANT_ACCEPTED", "REJECTED", "CANCELLED"],
  RESTAURANT_ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["DELIVERY_REQUESTED", "CANCELLED"],
  DELIVERY_REQUESTED: ["RIDER_ASSIGNED", "CANCELLED"],
  RIDER_ASSIGNED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: ["REFUND_PENDING"],
  CANCELLED: ["REFUND_PENDING"],
  REJECTED: ["REFUND_PENDING"],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
};

/**
 * Corresponding payment status transitions for each order transition.
 */
const PAYMENT_STATUS_MAP: Partial<Record<OrderStatus, PaymentStatus>> = {
  PAYMENT_CONFIRMED: "PAID",
  CANCELLED: "CANCELLED",
  REJECTED: "CANCELLED",
  REFUND_PENDING: "REFUND_PENDING",
  REFUNDED: "REFUNDED",
};

export class InvalidTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Cannot transition order from "${from}" to "${to}".`);
    this.name = "InvalidTransitionError";
  }
}

/**
 * Validate whether a status transition is allowed.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get the next recommended status(es) for a given order.
 */
export function getValidNextStatuses(current: OrderStatus): OrderStatus[] {
  return VALID_TRANSITIONS[current] ?? [];
}

/**
 * Get the payment status that should be set for a given order transition.
 */
export function getPaymentStatusForTransition(orderStatus: OrderStatus): PaymentStatus | null {
  return PAYMENT_STATUS_MAP[orderStatus] ?? null;
}

/**
 * Validate and return the new statuses for an order transition.
 * Throws InvalidTransitionError if the transition is not allowed.
 */
export function validateTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus
): { orderStatus: OrderStatus; paymentStatus: PaymentStatus | null } {
  if (!canTransition(currentStatus, newStatus)) {
    throw new InvalidTransitionError(currentStatus, newStatus);
  }
  return {
    orderStatus: newStatus,
    paymentStatus: getPaymentStatusForTransition(newStatus),
  };
}

/**
 * Human-readable labels for order statuses.
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAYMENT_CONFIRMED: "Payment confirmed",
  PLACED: "Order placed",
  RESTAURANT_ACCEPTED: "Accepted by kitchen",
  PREPARING: "Being prepared",
  READY_FOR_PICKUP: "Ready for pickup",
  DELIVERY_REQUESTED: "Delivery requested",
  RIDER_ASSIGNED: "Rider assigned",
  PICKED_UP: "Picked up by rider",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  REFUND_PENDING: "Refund in progress",
  REFUNDED: "Refunded",
};

/**
 * Payment status labels.
 */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Payment pending",
  PAID: "Paid",
  FAILED: "Payment failed",
  CANCELLED: "Payment cancelled",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
};
