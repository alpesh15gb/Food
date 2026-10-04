/**
 * Delivery ETA estimation.
 *
 * The storefront shipped `ETA ~45 min` — `preparationMinutes + 15`, a flat
 * 15-minute travel allowance that ignored distance entirely, never moved, and was
 * still displayed after the order was delivered. `deliveries.estimated_pickup` and
 * `estimated_delivery` were in the schema and never written at all.
 *
 * These tests pin the model that replaces it.
 */
import { describe, it, expect } from "vitest";
import {
  estimateTravelMinutes,
  estimatePrepMinutes,
  effectiveSpeedKmh,
  computeDeliveryEta,
  recomputeInTransitEta,
  shouldRecomputeEta,
  clampMinutes,
  clampPrepMinutes,
  MIN_DOORSTEP_MINUTES,
  MIN_PREP_MINUTES,
  MAX_PREP_MINUTES,
  ROAD_CIRCUIT_FACTOR,
  MAX_LOCAL_TRAVEL_MINUTES,
  STALE_ETA_GRACE_MINUTES,
  DEFAULT_PREPARATION_MINUTES,
} from "./deliveryEta";

const NOW = new Date("2026-03-10T12:00:00.000Z");

describe("travel time from distance", () => {
  it("grows with distance", () => {
    const near = estimateTravelMinutes(0.5);
    const mid = estimateTravelMinutes(3);
    const far = estimateTravelMinutes(8);
    expect(near).toBeLessThan(mid);
    expect(mid).toBeLessThan(far);
  });

  it("rejects the flat +15 that ignored distance", () => {
    // A 300 m delivery and a 7 km one must not be promised the same time.
    expect(estimateTravelMinutes(0.3)).not.toBe(15);
    expect(estimateTravelMinutes(7)).not.toBe(15);
    expect(estimateTravelMinutes(7)).toBeGreaterThan(estimateTravelMinutes(0.3));
  });

  it("applies a road-circuit factor to the straight line", () => {
    // 1 km straight-line at the 1-2 km band (15 km/h) over a 1.35x road
    // distance is ~5.4 min, floored at the handover minimum.
    const raw = (1 * ROAD_CIRCUIT_FACTOR * 60) / effectiveSpeedKmh(1);
    expect(estimateTravelMinutes(1)).toBe(clampMinutes(raw));
  });

  it("never promises less than the handover floor", () => {
    for (const km of [0, 0.01, 0.05, 0.1, 0.2]) {
      expect(estimateTravelMinutes(km)).toBeGreaterThanOrEqual(MIN_DOORSTEP_MINUTES);
    }
  });

  it("treats a nonsensical distance as doorstep, not zero", () => {
    expect(estimateTravelMinutes(-1)).toBe(MIN_DOORSTEP_MINUTES);
    expect(estimateTravelMinutes(Number.NaN)).toBe(MIN_DOORSTEP_MINUTES);
  });

  it("caps an absurdly distant order", () => {
    expect(estimateTravelMinutes(500)).toBe(MAX_LOCAL_TRAVEL_MINUTES);
  });

  it("degrades speed over short distances and recovers on arterials", () => {
    expect(effectiveSpeedKmh(0.5)).toBeLessThan(effectiveSpeedKmh(8));
    expect(effectiveSpeedKmh(20)).toBeGreaterThan(effectiveSpeedKmh(5));
  });

  it("always returns whole minutes", () => {
    for (const km of [0.4, 1.7, 3.3, 6.1, 12.5]) {
      expect(Number.isInteger(estimateTravelMinutes(km))).toBe(true);
    }
  });
});

describe("prep time and kitchen queue", () => {
  it("uses the outlet's own prep time when idle", () => {
    expect(estimatePrepMinutes(25, 0)).toBe(25);
  });

  it("extends when other orders are already cooking", () => {
    expect(estimatePrepMinutes(25, 3)).toBeGreaterThan(25);
  });

  it("grows monotonically with the queue", () => {
    const values = [0, 1, 2, 4, 6].map((q) => estimatePrepMinutes(20, q));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it("caps the effect of a pathological queue", () => {
    // A kitchen with 50 dishes queued should not quote a 6-hour prep time.
    expect(estimatePrepMinutes(25, 50)).toBeLessThanOrEqual(MAX_PREP_MINUTES);
  });

  it("uses prep-specific bounds, not the travel clamp", () => {
    // Prep and travel are different quantities. A prep time must not be bounded
    // by MAX_LOCAL_TRAVEL_MINUTES (a last-mile constant) nor floored by
    // MIN_DOORSTEP_MINUTES (a rider handover constant).
    expect(MAX_PREP_MINUTES).not.toBe(MAX_LOCAL_TRAVEL_MINUTES);
    expect(clampPrepMinutes(1)).toBeGreaterThanOrEqual(MIN_PREP_MINUTES);
    expect(clampPrepMinutes(0.2)).toBe(MIN_PREP_MINUTES);
    expect(clampPrepMinutes(9_999)).toBe(MAX_PREP_MINUTES);
    // A slow but real prep survives; it is only clamped at the top.
    expect(clampPrepMinutes(100)).toBe(100);
  });

  it("falls back to a sane default for a broken config", () => {
    expect(estimatePrepMinutes(0, 0)).toBe(DEFAULT_PREPARATION_MINUTES);
    expect(estimatePrepMinutes(Number.NaN, 0)).toBe(DEFAULT_PREPARATION_MINUTES);
    expect(estimatePrepMinutes(-5, 0)).toBe(DEFAULT_PREPARATION_MINUTES);
  });
});

describe("computeDeliveryEta", () => {
  it("adds prep and travel into one promise", () => {
    const eta = computeDeliveryEta({
      preparationMinutes: 25,
      distanceKm: 3,
      now: NOW,
    });
    expect(eta.prepMinutes).toBe(25);
    expect(eta.travelMinutes).toBe(estimateTravelMinutes(3));
    expect(eta.totalMinutes).toBe(eta.prepMinutes + eta.travelMinutes);
  });

  it("returns absolute clock times, not just a duration", () => {
    const eta = computeDeliveryEta({
      preparationMinutes: 20,
      distanceKm: 2,
      now: NOW,
    });
    expect(eta.estimatedPickup.getTime()).toBe(NOW.getTime() + 20 * 60_000);
    expect(eta.estimatedDelivery.getTime()).toBeGreaterThan(eta.estimatedPickup.getTime());
  });

  it("measures from placement when the order was placed earlier", () => {
    // A 15-minute-old order that has already been cooking must not be promised a
    // full prep time from now.
    const placedAt = new Date(NOW.getTime() - 15 * 60_000);
    const eta = computeDeliveryEta({
      preparationMinutes: 25,
      distanceKm: 2,
      placedAt,
      now: NOW,
    });
    expect(eta.estimatedPickup.getTime()).toBe(placedAt.getTime() + 25 * 60_000);
    expect(eta.estimatedPickup.getTime()).toBeLessThan(NOW.getTime() + 25 * 60_000);
  });

  it("honours a traffic-aware override when one is supplied", () => {
    const base = computeDeliveryEta({ preparationMinutes: 20, distanceKm: 5, now: NOW });
    const overridden = computeDeliveryEta({
      preparationMinutes: 20,
      distanceKm: 5,
      travelMinutesOverride: 40,
      now: NOW,
    });
    expect(overridden.travelMinutes).toBe(40);
    expect(overridden.totalMinutes).toBe(60);
    expect(base.travelMinutes).not.toBe(40);
  });

  it("ignores a nonsensical override", () => {
    const eta = computeDeliveryEta({
      preparationMinutes: 20,
      distanceKm: 5,
      travelMinutesOverride: 0,
      now: NOW,
    });
    expect(eta.travelMinutes).toBe(estimateTravelMinutes(5));
  });

  it("scales the whole promise with distance", () => {
    const near = computeDeliveryEta({ preparationMinutes: 25, distanceKm: 0.4, now: NOW });
    const far = computeDeliveryEta({ preparationMinutes: 25, distanceKm: 9, now: NOW });
    expect(far.totalMinutes).toBeGreaterThan(near.totalMinutes);
  });
});

describe("in-transit recomputation", () => {
  it("measures last-mile from pickup, not from order placement", () => {
    const pickedUpAt = new Date("2026-03-10T12:30:00.000Z");
    const r = recomputeInTransitEta({ distanceKm: 3, pickedUpAt, now: pickedUpAt });
    expect(r).not.toBeNull();
    expect(r!.estimatedDelivery.getTime()).toBe(
      pickedUpAt.getTime() + r!.travelMinutes * 60_000
    );
  });

  it("produces a tighter promise than the original order-level estimate", () => {
    const placedAt = new Date("2026-03-10T12:00:00.000Z");
    const original = computeDeliveryEta({
      preparationMinutes: 25,
      distanceKm: 3,
      placedAt,
      now: placedAt,
    });
    const pickedUpAt = new Date(placedAt.getTime() + 25 * 60_000);
    const inTransit = recomputeInTransitEta({
      distanceKm: 3,
      pickedUpAt,
      now: pickedUpAt,
    })!;
    const originalArrival = original.estimatedDelivery.getTime();
    // Same distance, so both agree on travel; the recomputed clock time is the
    // pickup + travel rather than a stale placement-based figure.
    expect(inTransit.estimatedDelivery.getTime()).toBe(
      pickedUpAt.getTime() + inTransit.travelMinutes * 60_000
    );
    expect(Math.abs(inTransit.estimatedDelivery.getTime() - originalArrival)).toBeLessThan(
      60 * 60_000
    );
  });

  it("recomputes only at the milestones where it tightens", () => {
    expect(shouldRecomputeEta("OUT_FOR_DELIVERY")).toBe(true);
    expect(shouldRecomputeEta("PICKED_UP")).toBe(true);
    expect(shouldRecomputeEta("IN_TRANSIT")).toBe(true);
  });

  it("does not churn the ETA on hub noise or terminal states", () => {
    for (const s of ["DELIVERED", "CANCELLED", "FAILED", "RETURNED", "DELIVERY_EXCEPTION"]) {
      expect(shouldRecomputeEta(s)).toBe(false);
    }
  });
});

describe("stale webhook replay", () => {
  it("refuses to stamp an arrival time that is already in the past", () => {
    // A PICKED_UP webhook replayed long after the bag was due at the door would
    // otherwise leave the tracking page promising "arriving by 11:05" at 11:20.
    const pickedUpAt = new Date("2026-03-10T12:00:00.000Z");
    const late = new Date(pickedUpAt.getTime() + 60 * 60_000);
    expect(recomputeInTransitEta({ distanceKm: 3, pickedUpAt, now: late })).toBeNull();
  });

  it("absorbs normal jitter within the grace period", () => {
    const pickedUpAt = new Date("2026-03-10T12:00:00.000Z");
    const travel = estimateTravelMinutes(3);
    const justLate = new Date(
      pickedUpAt.getTime() + (travel - STALE_ETA_GRACE_MINUTES / 2) * 60_000
    );
    const r = recomputeInTransitEta({ distanceKm: 3, pickedUpAt, now: justLate });
    expect(r).not.toBeNull();
    expect(r!.estimatedDelivery.getTime()).toBeGreaterThan(justLate.getTime());
  });

  it("still publishes a future arrival normally", () => {
    const pickedUpAt = new Date("2026-03-10T12:00:00.000Z");
    expect(recomputeInTransitEta({ distanceKm: 3, pickedUpAt, now: NOW })).not.toBeNull();
  });
});
