/**
 * Order State Machine Tests — valid transitions, guards, and payment status mapping.
 */
import { describe, expect, it } from "vitest";
import {
  canTransition,
  getValidNextStatuses,
  getPaymentStatusForTransition,
  validateTransition,
  InvalidTransitionError,
} from "./orderStateMachine";

describe("canTransition", () => {
  it("allows PLACED → RESTAURANT_ACCEPTED", () => {
    expect(canTransition("PLACED", "RESTAURANT_ACCEPTED")).toBe(true);
  });

  it("allows PREPARING → READY_FOR_PICKUP", () => {
    expect(canTransition("PREPARING", "READY_FOR_PICKUP")).toBe(true);
  });

  it("allows PENDING_PAYMENT → PAYMENT_CONFIRMED", () => {
    expect(canTransition("PENDING_PAYMENT", "PAYMENT_CONFIRMED")).toBe(true);
  });

  it("allows PENDING_PAYMENT → CANCELLED", () => {
    expect(canTransition("PENDING_PAYMENT", "CANCELLED")).toBe(true);
  });

  it("allows DELIVERED → REFUND_PENDING", () => {
    expect(canTransition("DELIVERED", "REFUND_PENDING")).toBe(true);
  });

  it("allows CANCELLED → REFUND_PENDING", () => {
    expect(canTransition("CANCELLED", "REFUND_PENDING")).toBe(true);
  });

  it("allows REFUND_PENDING → REFUNDED", () => {
    expect(canTransition("REFUND_PENDING", "REFUNDED")).toBe(true);
  });

  it("does NOT allow DELIVERED → PLACED", () => {
    expect(canTransition("DELIVERED", "PLACED")).toBe(false);
  });

  it("does NOT allow REFUNDED → anything", () => {
    expect(canTransition("REFUNDED", "PLACED")).toBe(false);
    expect(canTransition("REFUNDED", "CANCELLED")).toBe(false);
  });

  it("does NOT allow DELIVERED → PREPARING", () => {
    expect(canTransition("DELIVERED", "PREPARING")).toBe(false);
  });

  it("does NOT allow CANCELLED → PLACED", () => {
    expect(canTransition("CANCELLED", "PLACED")).toBe(false);
  });
});

describe("getValidNextStatuses", () => {
  it("returns correct next statuses for PLACED", () => {
    const next = getValidNextStatuses("PLACED");
    expect(next).toContain("RESTAURANT_ACCEPTED");
    expect(next).toContain("REJECTED");
    expect(next).toContain("CANCELLED");
  });

  it("returns empty array for DELIVERED", () => {
    // DELIVERED can only go to REFUND_PENDING
    const next = getValidNextStatuses("DELIVERED");
    expect(next).toEqual(["REFUND_PENDING"]);
  });

  it("returns empty array for REFUNDED", () => {
    expect(getValidNextStatuses("REFUNDED")).toEqual([]);
  });
});

describe("getPaymentStatusForTransition", () => {
  it("maps PAYMENT_CONFIRMED to PAID", () => {
    expect(getPaymentStatusForTransition("PAYMENT_CONFIRMED")).toBe("PAID");
  });

  it("maps CANCELLED to CANCELLED", () => {
    expect(getPaymentStatusForTransition("CANCELLED")).toBe("CANCELLED");
  });

  it("maps REJECTED to CANCELLED", () => {
    expect(getPaymentStatusForTransition("REJECTED")).toBe("CANCELLED");
  });

  it("maps REFUND_PENDING to REFUND_PENDING", () => {
    expect(getPaymentStatusForTransition("REFUND_PENDING")).toBe("REFUND_PENDING");
  });

  it("returns null for non-payment-related transitions", () => {
    expect(getPaymentStatusForTransition("PREPARING")).toBeNull();
    expect(getPaymentStatusForTransition("OUT_FOR_DELIVERY")).toBeNull();
  });
});

describe("validateTransition", () => {
  it("returns new statuses for valid transition", () => {
    const result = validateTransition("PLACED", "RESTAURANT_ACCEPTED");
    expect(result.orderStatus).toBe("RESTAURANT_ACCEPTED");
    expect(result.paymentStatus).toBeNull();
  });

  it("throws for invalid transition", () => {
    expect(() => validateTransition("DELIVERED", "PREPARING")).toThrow(InvalidTransitionError);
  });

  it("includes payment status when applicable", () => {
    const result = validateTransition("PENDING_PAYMENT", "PAYMENT_CONFIRMED");
    expect(result.orderStatus).toBe("PAYMENT_CONFIRMED");
    expect(result.paymentStatus).toBe("PAID");
  });
});
