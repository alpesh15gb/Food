/**
 * Location Domain Service — server-side coordinate validation, distance,
 * serviceability, and outlet selection. Never trust client-supplied distances.
 */
import {
  isRestaurantOpen,
  isScheduledOpen,
  getNextOpenTimeString,
  type ScheduleRule,
} from "./scheduling";

// =============================================================================
// Types
// =============================================================================

export type GeoLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  locationSource: "device_gps" | "map_pin" | "place_search" | "saved_address";
  capturedAt?: string;
  placeId?: string;
};

export type AccuracyLevel = "HIGH" | "GOOD" | "LOW" | "POOR" | "UNKNOWN";

export type ServiceabilityResult =
  | {
      serviceable: true;
      reason: "SERVICEABLE";
      outletId: string;
      outletName: string;
      distanceKm: number;
      estimatedDeliveryMinutes: number;
      provider: string;
      localServiceable: true;
      providerServiceable: boolean | "NOT_CHECKED";
      providerVerification: "VERIFIED" | "NOT_CHECKED" | "FAILED";
    }
  | {
      serviceable: false;
      reason:
        | "INVALID_LOCATION"
        | "NO_ACTIVE_OUTLET"
        | "OUTLET_MISCONFIGURED"
        | "OUTSIDE_DELIVERY_RADIUS"
        | "SHADOWFAX_UNAVAILABLE"
        | "SHADOWFAX_NOT_SERVICEABLE"
        | "OUTLET_CLOSED";
      detail?: string;
      outletName: string | null;
      distanceKm: number | null;
    };

// =============================================================================
// Coordinate Validation
// =============================================================================

/** Validate latitude is within valid range. */
export function isValidLatitude(lat: unknown): lat is number {
  if (typeof lat !== "number" || !Number.isFinite(lat)) return false;
  return lat >= -90 && lat <= 90;
}

/** Validate longitude is within valid range. */
export function isValidLongitude(lng: unknown): lng is number {
  if (typeof lng !== "number" || !Number.isFinite(lng)) return false;
  return lng >= -180 && lng <= 180;
}

/** Validate a complete GeoLocation object. */
export function validateGeoLocation(loc: {
  latitude?: number | string | null;
  longitude?: number | string | null;
}): { valid: boolean; latitude?: number; longitude?: number; error?: string } {
  const lat = typeof loc.latitude === "string" ? parseFloat(loc.latitude) : loc.latitude;
  const lng = typeof loc.longitude === "string" ? parseFloat(loc.longitude) : loc.longitude;

  if (lat == null || lng == null || lat === undefined || lng === undefined) {
    return { valid: false, error: "Latitude and longitude are required for delivery." };
  }
  if (!isValidLatitude(lat)) {
    return { valid: false, error: `Invalid latitude: ${lat}. Must be between -90 and 90.` };
  }
  if (!isValidLongitude(lng)) {
    return { valid: false, error: `Invalid longitude: ${lng}. Must be between -180 and 180.` };
  }
  return { valid: true, latitude: lat, longitude: lng };
}

// =============================================================================
// Accuracy Classification
// =============================================================================

/** Classify GPS accuracy into operational levels. */
export function classifyAccuracy(accuracyMeters: number | null | undefined): AccuracyLevel {
  // NaN/Infinity must be UNKNOWN, not POOR: the client's classifyAccuracy
  // (client/src/lib/locationCapture.ts) returns UNKNOWN for a non-finite fix.
  // The server disagreeing meant the same fix was logged as "confirmed but
  // poor" on one side and "unknown, ask the customer" on the other.
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return "UNKNOWN";
  if (accuracyMeters <= 20) return "HIGH";
  if (accuracyMeters <= 50) return "GOOD";
  if (accuracyMeters <= 100) return "LOW";
  return "POOR";
}

// =============================================================================
// Haversine Distance
// =============================================================================

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate great-circle distance between two points using the Haversine formula.
 * Returns distance in kilometres.
 * Never trust client-supplied distances — compute server-side always.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// =============================================================================
// Outlet Selection
// =============================================================================

type OutletCandidate = {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode: string | null;
  latitude: string | null;
  longitude: string | null;
  /** Numeric mirrors (preferred when valid; varchar kept for compat). */
  latitudeNum?: string | number | null;
  longitudeNum?: string | number | null;
  preparationMinutes: number;
  isActive: boolean;
  isOpen: boolean;
  deliveryRadiusKm: string | null;
};

/** Exported so callers can type the rows they hand to the selectors. */
export type OutletRow = OutletCandidate;

/**
 * Canonical outlet coordinates: numeric mirrors win (exact DECIMAL from the
 * DB, no parse drift); varchar falls back. Ordering and dispatch must never
 * read different columns again.
 */
export function outletCoordinates(outlet: OutletCandidate): { latitude: number; longitude: number } | null {
  const num = validateGeoLocation({ latitude: outlet.latitudeNum ?? undefined, longitude: outlet.longitudeNum ?? undefined });
  if (num.valid && num.latitude !== undefined && num.longitude !== undefined) {
    return { latitude: num.latitude, longitude: num.longitude };
  }
  const legacy = validateGeoLocation({ latitude: outlet.latitude, longitude: outlet.longitude });
  if (legacy.valid && legacy.latitude !== undefined && legacy.longitude !== undefined) {
    return { latitude: legacy.latitude, longitude: legacy.longitude };
  }
  return null;
}

/**
 * The single delivery-radius policy.
 *
 * Three call sites used to disagree: parseRadiusKm failed closed above 100km,
 * storefront.ts accepted any finite number (including the string "0"), and the
 * checkout gate in db.ts used its own inline `r > 0 && r <= 100 ? r : 5`.
 * A radius is a money knob — an unbounded one lets a single mis-typed row make
 * the kitchen "deliver" to the whole planet, and a "0" one silently makes it
 * deliver to nobody. Both endpoints and every gate now resolve through here.
 */
export const DEFAULT_DELIVERY_RADIUS_KM = 5;
export const MAX_DELIVERY_RADIUS_KM = 100;

/** True when `n` is a radius this service is willing to honour as-is. */
export function isAcceptableRadiusKm(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n <= MAX_DELIVERY_RADIUS_KM;
}

/**
 * Resolve any radius input (numeric column, numeric string, null, garbage) to
 * the one policy value. An unusable value falls back to `fallback`, which is
 * itself clamped — a caller passing 0 or 500 as its fallback must not be able to
 * smuggle an invalid radius back in through the fallback door.
 */
export function resolveRadiusKm(
  value: unknown,
  fallback: number = DEFAULT_DELIVERY_RADIUS_KM
): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (isAcceptableRadiusKm(parsed)) return parsed;
  return isAcceptableRadiusKm(fallback) ? fallback : DEFAULT_DELIVERY_RADIUS_KM;
}

/**
 * Parse a radius knob for one outlet. Non-numeric garbage fails closed to the
 * caller's fallback, which is itself resolved through the shared policy above.
 */
export function parseRadiusKm(value: unknown, fallback: number): number {
  return resolveRadiusKm(value, fallback);
}

/**
 * Transposed-pin detection.
 *
 * An outlet row saved with latitude and longitude swapped (77.6245 / 12.9352)
 * passes every range check, then haversine reports ~7000 km from every real
 * customer — so 100% of that outlet's orders were rejected as
 * OUTSIDE_DELIVERY_RADIUS, telling the customer their own address was outside
 * the delivery area. The operator's actual mistake was never surfaced.
 *
 * The cheap gate is the magnitude ordering: a correctly ordered pin in the
 * served market always has |lat| < |lng| (India: lat 6–37, lng 68–97), so a pair
 * with |lat| > |lng| is a candidate swap and nothing else.
 *
 * That gate alone is NOT enough to reject on, because |lat| > |lng| is
 * geographically legitimate in northern/eastern Europe (Finland 65/25, Ukraine
 * 50/30). So a swap is only confirmed when it actually explains the geometry:
 * swapping the pair has to land the outlet essentially on top of the anchor
 * (the destination we are scoring against). A legitimately northern-European
 * kitchen stays serviceable.
 */
export function isLikelyTransposedCoordinates(
  lat: number,
  lng: number,
  anchor?: { lat: number; lng: number }
): boolean {
  if (!isValidLatitude(lat) || !isValidLongitude(lng)) return false;
  const absLat = Math.abs(lat);
  const absLng = Math.abs(lng);
  if (absLat <= absLng) return false;
  // Without an anchor there is nothing to confirm against — refuse to guess.
  if (!anchor || !isValidLatitude(anchor.lat) || !isValidLongitude(anchor.lng)) return false;
  const asStored = haversineDistanceKm(lat, lng, anchor.lat, anchor.lng);
  const asSwapped = haversineDistanceKm(lng, lat, anchor.lat, anchor.lng);
  // Only a swap that collapses a continent-sized error to a doorstep hit counts.
  return asSwapped <= 1 && asStored > 50;
}

/**
 * Usable coordinates for an outlet, or null when the row cannot be trusted.
 *
 * Rejects an out-of-range pair AND a lat/lng transposition (see
 * isLikelyTransposedCoordinates) — the second is the failure mode that turned
 * an operator typo into "your address is outside our delivery area" for every
 * customer of that outlet. `anchor` is the destination being scored against.
 */
function usableOutletLocation(
  outlet: OutletCandidate,
  anchor?: { lat: number; lng: number }
): { latitude: number; longitude: number } | null {
  const loc = outletCoordinates(outlet);
  if (!loc) return null;
  if (isLikelyTransposedCoordinates(loc.latitude, loc.longitude, anchor)) return null;
  return loc;
}

/**
 * Select the best outlet for a delivery destination.
 * Rules:
 *  1. Must be active and open
 *  2. Must have valid, non-transposed coordinates
 *  3. Must be within configured delivery radius
 *  4. Rank by Haversine distance (nearest first), then preparation time
 *
 * Returns null if no outlet is serviceable.
 */
export function selectBestOutlet(
  outlets: OutletCandidate[],
  customerLat: number,
  customerLng: number,
  defaultRadiusKm: number = DEFAULT_DELIVERY_RADIUS_KM
): { outlet: OutletCandidate; distanceKm: number } | null {
  const candidates: Array<{ outlet: OutletCandidate; distanceKm: number }> = [];
  // Clamp the caller's default through the one shared policy: selection must not
  // depend on which caller remembered the bounds.
  const fallbackRadiusKm = resolveRadiusKm(defaultRadiusKm);
  const anchor = { lat: customerLat, lng: customerLng };

  for (const outlet of outlets) {
    if (!outlet.isActive || !outlet.isOpen) continue;
    const loc = usableOutletLocation(outlet, anchor);
    if (!loc) continue;

    const radiusKm = parseRadiusKm(outlet.deliveryRadiusKm, fallbackRadiusKm);
    const distanceKm = haversineDistanceKm(customerLat, customerLng, loc.latitude, loc.longitude);

    if (distanceKm <= radiusKm) {
      candidates.push({ outlet, distanceKm });
    }
  }

  if (candidates.length === 0) return null;

  // Sort: nearest distance first, then shortest preparation time
  candidates.sort((a, b) => {
    const distDiff = a.distanceKm - b.distanceKm;
    if (Math.abs(distDiff) > 0.1) return distDiff; // more than 100m difference
    return a.outlet.preparationMinutes - b.outlet.preparationMinutes;
  });

  return candidates[0];
}

// =============================================================================
// Server-side Serviceability Check
// =============================================================================

/**
 * Nearest outlet ignoring radius — diagnostics only. Used to populate
 * outletName/distanceKm on OUTSIDE_DELIVERY_RADIUS so failures stay
 * diagnosable (which outlet was closest, how far). Never gates serviceability.
 */
export function findNearestOutlet(
  outlets: OutletCandidate[],
  customerLat: number,
  customerLng: number
): { outlet: OutletCandidate; distanceKm: number } | null {
  let best: { outlet: OutletCandidate; distanceKm: number } | null = null;
  const anchor = { lat: customerLat, lng: customerLng };
  for (const outlet of outlets) {
    if (!outlet.isActive || !outlet.isOpen) continue;
    const loc = usableOutletLocation(outlet, anchor);
    if (!loc) continue;
    const distanceKm = haversineDistanceKm(customerLat, customerLng, loc.latitude, loc.longitude);
    if (!best || distanceKm < best.distanceKm) {
      best = { outlet, distanceKm };
    }
  }
  return best;
}

/**
 * Opening-hours input for the restaurant itself. Structurally identical to
 * scheduling.RestaurantScheduleConfig, but declared here as an optional so this
 * module stays a pure domain service with no DB dependency of its own.
 */
export type RestaurantOpenGate = {
  /** restaurants.isOpen — the operator's manual master switch. */
  isOpen: boolean;
  tempClosureStart?: Date | null;
  tempClosureEnd?: Date | null;
  tempClosureMessage?: string | null;
  /** restaurant_schedules rows. Empty/absent = always open. */
  schedules?: ScheduleRule[] | null;
};

/**
 * Opening-hours verdict for the restaurant: manual toggle, temporary closure
 * windows, and the weekly schedule — evaluated by the canonical scheduling
 * engine so this pre-payment gate and `createOrderFromValidatedCart`'s gate can
 * never disagree about whether the kitchen is open.
 */
export function restaurantOpenStatus(
  gate: RestaurantOpenGate,
  now: Date = new Date()
): { open: true; detail: null } | { open: false; detail: string } {
  const config = {
    isOpen: gate.isOpen,
    tempClosureStart: gate.tempClosureStart ?? null,
    tempClosureEnd: gate.tempClosureEnd ?? null,
    tempClosureMessage: gate.tempClosureMessage ?? null,
    schedules: gate.schedules ?? [],
  };
  if (isRestaurantOpen(config, now)) return { open: true, detail: null };

  // Say WHY, so the refusal is diagnosable instead of a bare "closed".
  const closedByTempClosure = Boolean(
    config.tempClosureStart &&
    now >= config.tempClosureStart &&
    (!config.tempClosureEnd || now <= config.tempClosureEnd)
  );
  if (closedByTempClosure) {
    return {
      open: false,
      detail:
        config.tempClosureMessage ??
        (config.tempClosureEnd
          ? `Temporarily closed until ${config.tempClosureEnd.toISOString()}.`
          : "Temporarily closed."),
    };
  }
  if (!config.isOpen) {
    return { open: false, detail: "The restaurant is not accepting orders right now." };
  }
  if (!isScheduledOpen(config.schedules, now)) {
    return { open: false, detail: getNextOpenTimeString(config.schedules, now) ?? "Outside the restaurant's opening hours." };
  }
  return { open: false, detail: "The restaurant is currently closed." };
}

/**
 * Full serviceability check: validates coordinates, checks opening hours, finds
 * the best outlet, checks radius, then asks the delivery provider.
 * This is the authoritative server-side check — never trust browser results.
 */
export async function checkServiceability(
  customerLat: number,
  customerLng: number,
  restaurantId: string,
  getOutletsFn: (restaurantId: string) => Promise<OutletCandidate[]>,
  /**
   * Optional provider check. `selected` is the exact outlet this function chose,
   * so a pincode-pair check can never be bound to a different pickup point than
   * the outlet finally selected (the previous design re-ran its own selection
   * outside, which could pick a different outlet than the authoritative one).
   * A throw here means "provider could not be reached" (SHADOWFAX_UNAVAILABLE),
   * NOT "not serviceable".
   */
  shadowfaxCheckFn?: (
    pickup: { lat: number; lng: number },
    drop: { lat: number; lng: number },
    selected: OutletCandidate | null
  ) => Promise<{ serviceable: boolean; estimatedMinutes?: number }>,
  opts?: {
    defaultRadiusKm?: number;
    providerAdvisory?: boolean;
    /** Restaurant opening state. Omit to skip the hours gate (legacy callers). */
    availability?: RestaurantOpenGate | null;
    now?: Date;
  }
): Promise<ServiceabilityResult> {
  const now = opts?.now ?? new Date();

  // Layer 1: Validate destination coordinates
  if (!isValidLatitude(customerLat) || !isValidLongitude(customerLng)) {
    return { serviceable: false, reason: "INVALID_LOCATION", outletName: null, distanceKm: null };
  }

  // Layer 2: Outlet availability
  const outlets = await getOutletsFn(restaurantId);
  if (outlets.length === 0) {
    return { serviceable: false, reason: "NO_ACTIVE_OUTLET", outletName: null, distanceKm: null };
  }

  const anchor = { lat: customerLat, lng: customerLng };
  const isTrading = (o: OutletCandidate) => o.isActive && o.isOpen;
  const tradingOutlets = outlets.filter(isTrading);

  // Layer 3: Opening hours. `outlets.isOpen` is a STATIC manual boolean that is
  // never derived from restaurant_schedules, so without this the check said YES
  // to a 23:30 order at a kitchen that closes at 23:00 — and the authoritative
  // pre-payment gate in db.ts then threw "Restaurant is currently closed.",
  // leaving the customer on a dead checkout. Same engine, same verdict.
  const hours = opts?.availability
    ? restaurantOpenStatus(opts.availability, now)
    : ({ open: true, detail: null } as const);

  // Distinguish "the kitchen is shut" from "the kitchen does not exist here".
  // Reporting OUTSIDE_DELIVERY_RADIUS with a null outletName for a closed
  // restaurant told the customer their address was out of area when the truth
  // was simply "come back at 11 AM".
  if (!tradingOutlets.length) {
    if (!hours.open) {
      return { serviceable: false, reason: "OUTLET_CLOSED", detail: hours.detail, outletName: null, distanceKm: null };
    }
    // Everything is either decommissioned (isActive=false) or manually closed
    // (isOpen=false). Decommissioned-only is NO_ACTIVE_OUTLET; at least one
    // surviving-but-closed outlet is a closure, and naming it keeps it
    // diagnosable.
    const stillLive = outlets.find((o) => o.isActive && !o.isOpen);
    if (stillLive) {
      return {
        serviceable: false,
        reason: "OUTLET_CLOSED",
        detail: "Every outlet is currently closed.",
        outletName: stillLive.name,
        distanceKm: null,
      };
    }
    return { serviceable: false, reason: "NO_ACTIVE_OUTLET", outletName: null, distanceKm: null };
  }

  if (!hours.open) {
    // Report the nearest trading outlet's name for operator diagnostics; the
    // customer-facing copy is the fixed OUTLET_CLOSED message.
    const named = findNearestOutlet(tradingOutlets, customerLat, customerLng);
    return {
      serviceable: false,
      reason: "OUTLET_CLOSED",
      detail: hours.detail,
      outletName: named ? named.outlet.name : tradingOutlets[0].name,
      distanceKm: named ? Math.round(named.distanceKm * 100) / 100 : null,
    };
  }

  // Distinct misconfiguration: outlets exist and are trading, but none have
  // usable coordinates. Say so as a configuration fault rather than a coverage
  // fault — including a transposed lat/lng, which used to masquerade as
  // "outside our delivery area" for every customer of that outlet.
  const hasUsableOutlet = tradingOutlets.some((o) => usableOutletLocation(o, anchor) !== null);
  if (!hasUsableOutlet) {
    const transposed = tradingOutlets.some((o) => {
      const loc = outletCoordinates(o);
      return loc !== null && isLikelyTransposedCoordinates(loc.latitude, loc.longitude, anchor);
    });
    return {
      serviceable: false,
      reason: "OUTLET_MISCONFIGURED",
      detail: transposed
        ? "Outlet coordinates look transposed (latitude and longitude appear swapped)."
        : "No outlet has valid pickup coordinates.",
      outletName: tradingOutlets[0].name,
      distanceKm: null,
    };
  }

  // Layer 4: Radius selection (one shared, clamped radius policy).
  const defaultRadiusKm = resolveRadiusKm(opts?.defaultRadiusKm);
  const selection = selectBestOutlet(outlets, customerLat, customerLng, defaultRadiusKm);
  if (!selection) {
    const nearest = findNearestOutlet(outlets, customerLat, customerLng);
    return {
      serviceable: false,
      reason: "OUTSIDE_DELIVERY_RADIUS",
      outletName: nearest ? nearest.outlet.name : null,
      distanceKm: nearest ? Math.round(nearest.distanceKm * 100) / 100 : null,
    };
  }

  // Layer 5: Shadowfax provider serviceability (optional)
  let providerServiceable: boolean | "NOT_CHECKED" = "NOT_CHECKED";
  let providerVerification: "VERIFIED" | "NOT_CHECKED" | "FAILED" = "NOT_CHECKED";
  let estimatedMinutes = selection.outlet.preparationMinutes + 15;
  if (shadowfaxCheckFn) {
    const outletLoc = outletCoordinates(selection.outlet);
    if (outletLoc) {
      try {
        const providerResult = await shadowfaxCheckFn(
          { lat: outletLoc.latitude, lng: outletLoc.longitude },
          { lat: customerLat, lng: customerLng },
          selection.outlet
        );
        providerServiceable = providerResult.serviceable;
        providerVerification = "VERIFIED";
        if (providerResult.estimatedMinutes) {
          estimatedMinutes = providerResult.estimatedMinutes;
        }
        if (!providerServiceable) {
          // Staging coverage data is routinely narrower than production: in
          // advisory mode a provider "no" downgrades to a warning (radius
          // still gates) instead of blocking checkout. Dispatch itself still
          // attempts and surfaces the provider's real verdict.
          if (opts?.providerAdvisory) {
            console.warn(`[serviceability] provider reports unserviceable but advisory mode: proceeding radius-only`);
            return {
              serviceable: true,
              reason: "SERVICEABLE",
              outletId: selection.outlet.id,
              outletName: selection.outlet.name,
              distanceKm: Math.round(selection.distanceKm * 100) / 100,
              estimatedDeliveryMinutes: estimatedMinutes,
              provider: "shadowfax",
              localServiceable: true,
              providerServiceable: false,
              providerVerification: "VERIFIED",
            };
          }
          return {
            serviceable: false,
            reason: "SHADOWFAX_NOT_SERVICEABLE",
            outletName: selection.outlet.name,
            distanceKm: Math.round(selection.distanceKm * 100) / 100,
          };
        }
      } catch (err) {
        // Distinct from NOT_SERVICEABLE, and the distinction is load-bearing:
        // the provider integration now throws for timeouts / 5xx / DNS rather
        // than folding them into a "not serviceable" verdict. A thrown provider
        // error means "we could not ask", never "this pincode is not covered".
        // Still fail closed — only the reason differs, and the customer is told
        // the truth ("our delivery partner is unreachable, try again").
        return {
          serviceable: false,
          reason: "SHADOWFAX_UNAVAILABLE",
          detail: err instanceof Error ? err.message : "Delivery provider unavailable.",
          outletName: selection.outlet.name,
          distanceKm: Math.round(selection.distanceKm * 100) / 100,
        };
      }
    }
  }

  return {
    serviceable: true,
    reason: "SERVICEABLE",
    outletId: selection.outlet.id,
    outletName: selection.outlet.name,
    distanceKm: Math.round(selection.distanceKm * 100) / 100,
    estimatedDeliveryMinutes: estimatedMinutes,
    provider: shadowfaxCheckFn ? "shadowfax" : "direct",
    localServiceable: true,
    providerServiceable,
    providerVerification,
  };
}
