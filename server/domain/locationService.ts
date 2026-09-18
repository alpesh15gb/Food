/**
 * Location Domain Service — server-side coordinate validation, distance,
 * serviceability, and outlet selection. Never trust client-supplied distances.
 */

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
  if (accuracyMeters == null || accuracyMeters <= 0) return "UNKNOWN";
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

/** Parse a radius knob; non-numeric garbage fails closed to the default. */
export function parseRadiusKm(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : fallback;
}

/**
 * Select the best outlet for a delivery destination.
 * Rules:
 *  1. Must be active and open
 *  2. Must have valid coordinates
 *  3. Must be within configured delivery radius
 *  4. Rank by Haversine distance (nearest first), then preparation time
 *
 * Returns null if no outlet is serviceable.
 */
export function selectBestOutlet(
  outlets: OutletCandidate[],
  customerLat: number,
  customerLng: number,
  defaultRadiusKm: number = 5
): { outlet: OutletCandidate; distanceKm: number } | null {
  const candidates: Array<{ outlet: OutletCandidate; distanceKm: number }> = [];

  for (const outlet of outlets) {
    if (!outlet.isActive || !outlet.isOpen) continue;
    const loc = outletCoordinates(outlet);
    if (!loc) continue;

    const radiusKm = parseRadiusKm(outlet.deliveryRadiusKm, defaultRadiusKm);
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
  for (const outlet of outlets) {
    if (!outlet.isActive || !outlet.isOpen) continue;
    const loc = outletCoordinates(outlet);
    if (!loc) continue;
    const distanceKm = haversineDistanceKm(customerLat, customerLng, loc.latitude, loc.longitude);
    if (!best || distanceKm < best.distanceKm) {
      best = { outlet, distanceKm };
    }
  }
  return best;
}

/**
 * Full serviceability check: validates coordinates, finds outlet, checks radius.
 * This is the authoritative server-side check — never trust browser results.
 */
export async function checkServiceability(
  customerLat: number,
  customerLng: number,
  restaurantId: string,
  getOutletsFn: (restaurantId: string) => Promise<OutletCandidate[]>,
  shadowfaxCheckFn?: (pickup: { lat: number; lng: number }, drop: { lat: number; lng: number }) => Promise<{ serviceable: boolean; estimatedMinutes?: number }>,
  opts?: { defaultRadiusKm?: number; providerAdvisory?: boolean }
): Promise<ServiceabilityResult> {
  // Layer 1: Validate destination coordinates
  if (!isValidLatitude(customerLat) || !isValidLongitude(customerLng)) {
    return { serviceable: false, reason: "INVALID_LOCATION", outletName: null, distanceKm: null };
  }

  // Layer 2: Outlet selection based on distance
  const outlets = await getOutletsFn(restaurantId);
  if (outlets.length === 0) {
    return { serviceable: false, reason: "NO_ACTIVE_OUTLET", outletName: null, distanceKm: null };
  }

  // Distinct misconfiguration: outlets exist but none have usable coordinates.
  const hasUsableOutlet = outlets.some(o => {
    if (!o.isActive || !o.isOpen) return false;
    return outletCoordinates(o) !== null;
  });
  if (!hasUsableOutlet) {
    const anyActive = outlets.some(o => o.isActive && o.isOpen);
    if (anyActive) {
      return { serviceable: false, reason: "OUTLET_MISCONFIGURED", detail: "No outlet has valid pickup coordinates.", outletName: null, distanceKm: null };
    }
    return { serviceable: false, reason: "NO_ACTIVE_OUTLET", outletName: null, distanceKm: null };
  }

  const defaultRadiusKm = opts?.defaultRadiusKm ?? 5;
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

  // Layer 3: Shadowfax provider serviceability (optional)
  let providerServiceable: boolean | "NOT_CHECKED" = "NOT_CHECKED";
  let providerVerification: "VERIFIED" | "NOT_CHECKED" | "FAILED" = "NOT_CHECKED";
  let estimatedMinutes = selection.outlet.preparationMinutes + 15;
  if (shadowfaxCheckFn) {
    const outletLoc = outletCoordinates(selection.outlet);
    if (outletLoc) {
      try {
        const providerResult = await shadowfaxCheckFn(
          { lat: outletLoc.latitude, lng: outletLoc.longitude },
          { lat: customerLat, lng: customerLng }
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
        // Distinct from NOT_SERVICEABLE: provider could not be reached at all.
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
