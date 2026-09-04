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
  preparationMinutes: number;
  isActive: boolean;
  isOpen: boolean;
  deliveryRadiusKm: string | null;
};

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
    const loc = validateGeoLocation({ latitude: outlet.latitude, longitude: outlet.longitude });
    if (!loc.valid || loc.latitude === undefined || loc.longitude === undefined) continue;

    const radiusKm = outlet.deliveryRadiusKm
      ? parseFloat(outlet.deliveryRadiusKm)
      : defaultRadiusKm;
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
 * Full serviceability check: validates coordinates, finds outlet, checks radius.
 * This is the authoritative server-side check — never trust browser results.
 */
export async function checkServiceability(
  customerLat: number,
  customerLng: number,
  restaurantId: string,
  getOutletsFn: (restaurantId: string) => Promise<OutletCandidate[]>,
  shadowfaxCheckFn?: (pickup: { lat: number; lng: number }, drop: { lat: number; lng: number }) => Promise<{ serviceable: boolean; estimatedMinutes?: number }>,
  opts?: { defaultRadiusKm?: number }
): Promise<ServiceabilityResult> {
  // Layer 1: Validate destination coordinates
  if (!isValidLatitude(customerLat) || !isValidLongitude(customerLng)) {
    return { serviceable: false, reason: "INVALID_LOCATION" };
  }

  // Layer 2: Outlet selection based on distance
  const outlets = await getOutletsFn(restaurantId);
  if (outlets.length === 0) {
    return { serviceable: false, reason: "NO_ACTIVE_OUTLET" };
  }

  // Distinct misconfiguration: outlets exist but none have usable coordinates.
  const hasUsableOutlet = outlets.some(o => {
    if (!o.isActive || !o.isOpen) return false;
    const loc = validateGeoLocation({ latitude: o.latitude, longitude: o.longitude });
    return loc.valid;
  });
  if (!hasUsableOutlet) {
    const anyActive = outlets.some(o => o.isActive && o.isOpen);
    if (anyActive) {
      return { serviceable: false, reason: "OUTLET_MISCONFIGURED", detail: "No outlet has valid pickup coordinates." };
    }
    return { serviceable: false, reason: "NO_ACTIVE_OUTLET" };
  }

  const defaultRadiusKm = opts?.defaultRadiusKm ?? 5;
  const selection = selectBestOutlet(outlets, customerLat, customerLng, defaultRadiusKm);
  if (!selection) {
    return { serviceable: false, reason: "OUTSIDE_DELIVERY_RADIUS" };
  }

  // Layer 3: Shadowfax provider serviceability (optional)
  let providerServiceable: boolean | "NOT_CHECKED" = "NOT_CHECKED";
  let providerVerification: "VERIFIED" | "NOT_CHECKED" | "FAILED" = "NOT_CHECKED";
  let estimatedMinutes = selection.outlet.preparationMinutes + 15;
  if (shadowfaxCheckFn) {
    const outletLoc = validateGeoLocation({
      latitude: selection.outlet.latitude,
      longitude: selection.outlet.longitude,
    });
    if (outletLoc.valid && outletLoc.latitude !== undefined && outletLoc.longitude !== undefined) {
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
          return { serviceable: false, reason: "SHADOWFAX_NOT_SERVICEABLE" };
        }
      } catch (err) {
        // Distinct from NOT_SERVICEABLE: provider could not be reached at all.
        return {
          serviceable: false,
          reason: "SHADOWFAX_UNAVAILABLE",
          detail: err instanceof Error ? err.message : "Delivery provider unavailable.",
        };
      }
    }
  }

  return {
    serviceable: true,
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
