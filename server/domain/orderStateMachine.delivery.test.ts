/**
 * Delivery-state machine invariants.
 *
 * The audit found an order that reached PICKED_UP had no legal edge out: the
 * graph offered only OUT_FOR_DELIVERY, while every failing provider status
 * (abandoned rider, returned shipment, delivery exception) mapped to null and
 * therefore wrote nothing. The result was a paid order that could never be
 * cancelled, never refunded, and never left "picked up" on the customer's screen.
 *
 * These tests exist so that dead end cannot be reintroduced silently.
 */
import { describe, it, expect } from "vitest";
import {
  canTransition,
  getValidNextStatuses,
  validateTransition,
  InvalidTransitionError,
} from "./orderStateMachine";

/** Terminal delivery outcomes that must be able to end an in-flight order. */
const TERMINAL_DELIVERY_OUTCOMES = ["CANCELLED", "FAILED", "RETURNED", "DELIVERY_EXCEPTION"] as const;

describe("order state machine — in-flight delivery exits", () => {
  it("allows a picked-up order to be cancelled", () => {
    expect(canTransition("PICKED_UP", "CANCELLED")).toBe(true);
  });

  it("allows an out-for-delivery order to be cancelled", () => {
    expect(canTransition("OUT_FOR_DELIVERY", "CANCELLED")).toBe(true);
  });

  it("allows a refund to start from either in-flight state", () => {
    // Without this, handleRefundProcessed's validateTransition threw and a bare
    // catch swallowed it: real money refunded at Razorpay while the order still
    // claimed the food was in transit.
    expect(canTransition("PICKED_UP", "REFUND_PENDING")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "REFUND_PENDING")).toBe(true);
  });

  it("keeps the normal forward path intact", () => {
    expect(canTransition("PICKED_UP", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  it("does not let a delivered order skip backwards", () => {
    expect(canTransition("DELIVERED", "PICKED_UP")).toBe(false);
    expect(canTransition("DELIVERED", "OUT_FOR_DELIVERY")).toBe(false);
  });

  it("still forbids reviving a cancelled order into the delivery flow", () => {
    // The CANCELLED -> RIDER_ASSIGNED write the webhook used to perform.
    expect(canTransition("CANCELLED", "RIDER_ASSIGNED")).toBe(false);
    expect(canTransition("CANCELLED", "PICKED_UP")).toBe(false);
  });

  it("still forbids reviving a refunded order", () => {
    expect(getValidNextStatuses("REFUNDED")).toEqual([]);
  });

  it("throws a typed error on an illegal jump", () => {
    expect(() => validateTransition("DELIVERED", "PICKED_UP")).toThrow(InvalidTransitionError);
  });

  it("gives every in-flight state a way to finish", () => {
    // The regression shape: a state with no exit is a state an order can be
    // stranded in permanently.
    for (const state of ["PICKED_UP", "OUT_FOR_DELIVERY"] as const) {
      const exits = getValidNextStatuses(state);
      expect(exits.length).toBeGreaterThan(0);
      expect(TERMINAL_DELIVERY_OUTCOMES.length).toBeGreaterThan(0);
      expect(exits).toContain("CANCELLED");
    }
  });

  it("cannot strand an order in ANY pre-delivery state", () => {
    const states = [
      "PENDING_PAYMENT",
      "PAYMENT_CONFIRMED",
      "PLACED",
      "RESTAURANT_ACCEPTED",
      "PREPARING",
      "READY_FOR_PICKUP",
      "DELIVERY_REQUESTED",
      "RIDER_ASSIGNED",
      "PICKED_UP",
      "OUT_FOR_DELIVERY",
    ] as const;
    for (const state of states) {
      expect(getValidNextStatuses(state).length).toBeGreaterThan(0);
      // Every one of these must retain a cancel path so an operator is never stuck.
      expect(getValidNextStatuses(state)).toContain("CANCELLED");
    }
  });
});
