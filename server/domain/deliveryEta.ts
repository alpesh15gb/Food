/**
 * Delivery ETA estimation.
 *
 * The storefront showed `ETA ~45 min` — a value written once at order creation as
 * `preparationMinutes + 15`, a flat 15-minute travel allowance regardless of
 * distance. A customer 300 m away and one 7 km away were given the SAME ETA, and
 * it never changed: it did not count down, did not react to the kitchen queue, and
 * was still displayed after the order was delivered. `deliveries.estimated_pickup`
 * and `estimated_delivery` existed in the schema and were NEVER written.
 *
 * This module computes a defensible ETA from what we actually know:
 *
 *  - straight-line distance (haversine) between outlet and drop point,
 *  - a road-circuit factor, because nobody travels in a straight line,
 *  - a two-wheeler urban speed that DEGRADES with distance (short trips are
 *    dominated by junctions and turns; longer trips reach faster arterials),
 *  - a floor for handover time, because a 200 m delivery is still a few minutes,
 *  - the kitchen's own queue depth, so a rush hour is visible in the promise.
 *
 * Everything here is pure and unit-tested. Live traffic is deliberately NOT
 * required: a Google Routes call per order adds cost, latency and a new failure
 * mode to the checkout path. `enrichTravelMinutesWithRoutes` exists as an
 * OPTIONAL, strictly-better override for deployments that want it.
 */

/** Straight-line → road distance. Urban grids are ~1.3-1.4x the crow-flies. */
export const ROAD_CIRCUIT_FACTOR = 1.35;

/**
 * Effective two-wheeler speed in km/h, by straight-line distance band.
 *
 * Chosen from typical Indian metro last-mile behaviour rather than free-flow
 * numbers: dense neighbourhoods run well below the posted limit, and the first
 * kilometre of a delivery is mostly junctions.
 */
export function effectiveSpeedKmh(distanceKm: number): number {
  if (distanceKm <= 1) return 12;
  if (distanceKm <= 2) return 15;
  if (distanceKm <= 5) return 17;
  if (distanceKm <= 10) return 19;
  return 24;
}

/**
 * Handover floor. Even a doorstep-to-doorstep delivery needs the rider to park,
 * walk up, hand over and (often) wait for the customer. Never promise < 5 min.
 */
export const MIN_DOORSTEP_MINUTES = 5;

/** Longest last-mile we will model locally; beyond this a courier is involved. */
export const MAX_LOCAL_TRAVEL_MINUTES = 90;

/**
 * Travel minutes for a straight-line distance.
 *
 * Uses the distance band to pick a speed, applies the road factor, and enforces
 * the handover floor. Deterministic and cheap — safe to call on every order.
 */
export function estimateTravelMinutes(straightLineKm: number): number {
  if (!Number.isFinite(straightLineKm) || straightLineKm <= 0) {
    return MIN_DOORSTEP_MINUTES;
  }
  const roadKm = straightLineKm * ROAD_CIRCUIT_FACTOR;
  const speed = effectiveSpeedKmh(straightLineKm);
  const minutes = (roadKm / speed) * 60;
  return clampMinutes(minutes);
}

/** Clamp a TRAVEL duration to a sane, non-zero, integer minute count. */
export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_DOORSTEP_MINUTES;
  return Math.min(
    MAX_LOCAL_TRAVEL_MINUTES,
    Math.max(MIN_DOORSTEP_MINUTES, Math.round(minutes))
  );
}

/** Shortest plausible kitchen prep time. */
export const MIN_PREP_MINUTES = 1;

/**
 * Longest prep time we will promise.
 *
 * Deliberately bounded well above any real kitchen: past ~2 hours an order is
 * not slow, it is broken, and quoting it pushes the customer to cancel and call
 * instead. A delay notice plus a refund is the honest answer at that point.
 */
export const MAX_PREP_MINUTES = 120;

/** Clamp a PREP duration. Separate bounds from travel — they are different things. */
export function clampPrepMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_PREPARATION_MINUTES;
  return Math.min(
    MAX_PREP_MINUTES,
    Math.max(MIN_PREP_MINUTES, Math.round(minutes))
  );
}

/** Prep time assumed when the outlet has no usable value configured. */
export const DEFAULT_PREPARATION_MINUTES = 25;

/**
 * Prep minutes, adjusted for how much work is already queued at the outlet.
 *
 * A kitchen that has three other dishes in progress will not produce this one in
 * the same time as an idle one. `queueAhead` is the number of orders already
 * being prepared for the same outlet.
 */
export function estimatePrepMinutes(
  basePreparationMinutes: number,
  queueAhead = 0
): number {
  const base =
    Number.isFinite(basePreparationMinutes) && basePreparationMinutes > 0
      ? basePreparationMinutes
      : DEFAULT_PREPARATION_MINUTES;
  if (!Number.isFinite(queueAhead) || queueAhead <= 0) return clampPrepMinutes(base);
  // Partial overlap: the kitchen cooks in parallel to a degree, so each queued
  // dish adds a fraction of its own prep time rather than a full slot.
  const congestion = 1 + Math.min(queueAhead, 6) * 0.25;
  return clampPrepMinutes(base * congestion);
}

export type EtaInput = {
  /** Outlet's configured prep time. */
  preparationMinutes: number;
  /** Straight-line outlet -> customer distance in km. */
  distanceKm: number;
  /** Orders already in preparation at this outlet. */
  queueAhead?: number;
  /** When the order was placed (defaults to now). */
  placedAt?: Date;
  /** Current time, injectable for tests. */
  now?: Date;
  /**
   * Travel minutes from a traffic-aware source, when available. Overrides the
   * local estimate. `estimateTravelMinutes` remains the fallback.
   */
  travelMinutesOverride?: number | null;
};

export type Eta = {
  /** Minutes from placement until the food should be ready. */
  prepMinutes: number;
  /** Minutes of last-mile travel. */
  travelMinutes: number;
  /** Total promise shown to the customer. */
  totalMinutes: number;
  /** Absolute time the kitchen should have the bag ready. */
  estimatedPickup: Date;
  /** Absolute time the food should reach the customer. */
  estimatedDelivery: Date;
};

/**
 * Compute the full ETA for a not-yet-dispatched order.
 */
export function computeDeliveryEta(input: EtaInput): Eta {
  const now = input.now ?? new Date();
  const placedAt = input.placedAt ?? now;

  const prepMinutes = estimatePrepMinutes(input.preparationMinutes, input.queueAhead);
  const travelMinutes =
    input.travelMinutesOverride != null && input.travelMinutesOverride > 0
      ? clampMinutes(input.travelMinutesOverride)
      : estimateTravelMinutes(input.distanceKm);

  const totalMinutes = prepMinutes + travelMinutes;
  const estimatedPickup = new Date(placedAt.getTime() + prepMinutes * 60_000);
  const estimatedDelivery = new Date(estimatedPickup.getTime() + travelMinutes * 60_000);

  return { prepMinutes, travelMinutes, totalMinutes, estimatedPickup, estimatedDelivery };
}

/**
 * Grace period before a recomputed arrival counts as stale.
 *
 * Webhooks are replayed and out of order. If a PICKED_UP event arrives ten
 * minutes after the bag was already due at the door, writing the recomputed
 * time would leave the tracking page promising "arriving by 11:05" when it is
 * already 11:20. A couple of minutes of slack absorbs normal jitter.
 */
export const STALE_ETA_GRACE_MINUTES = 2;

/**
 * Recompute the delivery ETA once the food is with the rider.
 *
 * After pickup there is no kitchen queue and no prep left, so the promise is
 * pure last-mile from the moment of pickup.
 *
 * Returns null when the recomputed arrival is already in the past (beyond the
 * grace period), so callers skip the write instead of stamping a stale time on
 * the delivery. Terminal states are gated separately by `shouldRecomputeEta`.
 */
export function recomputeInTransitEta(args: {
  distanceKm: number;
  pickedUpAt: Date;
  now?: Date;
  travelMinutesOverride?: number | null;
}): { estimatedDelivery: Date; travelMinutes: number } | null {
  const now = args.now ?? new Date();
  const travelMinutes =
    args.travelMinutesOverride != null && args.travelMinutesOverride > 0
      ? clampMinutes(args.travelMinutesOverride)
      : estimateTravelMinutes(args.distanceKm);
  const estimatedDelivery = new Date(
    args.pickedUpAt.getTime() + travelMinutes * 60_000
  );

  // A replayed/out-of-order webhook must not push the promise into the past.
  if (estimatedDelivery.getTime() + STALE_ETA_GRACE_MINUTES * 60_000 < now.getTime()) {
    return null;
  }

  return { travelMinutes, estimatedDelivery };
}

/** Terminal statuses: no ETA to publish. */
const ETA_TERMINAL = new Set(["DELIVERED", "CANCELLED", "FAILED", "RETURNED"]);

/**
 * Should this delivery status carry a recomputed ETA?
 *
 * Out-for-delivery and picked-up are the moments the promise meaningfully
 * tightens. Re-applying it on every hub-scan webhook would churn the column and
 * could push the ETA later as the rider dawdles.
 */
export function shouldRecomputeEta(status: string): boolean {
  if (ETA_TERMINAL.has(status)) return false;
  return status === "OUT_FOR_DELIVERY" || status === "PICKED_UP" || status === "IN_TRANSIT";
}
