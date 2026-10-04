/**
 * Location domain policy tests — opening hours, the shared radius policy,
 * transposed-pin detection, and the provider-status → serviceability-reason
 * mapping. All pure: no DB, no network, no Express.
 *
 * These are the money/correctness gates that decide whether an order is allowed
 * to start, so each case below pins a decision that used to be wrong.
 */
import { describe, expect, it, vi } from "vitest";
import {
  checkServiceability,
  classifyAccuracy,
  isLikelyTransposedCoordinates,
  parseRadiusKm,
  resolveRadiusKm,
  restaurantOpenStatus,
  selectBestOutlet,
  isAcceptableRadiusKm,
  DEFAULT_DELIVERY_RADIUS_KM,
  MAX_DELIVERY_RADIUS_KM,
  type OutletRow,
} from "./locationService";

// Bengaluru (Koramangala) — the served market.
const KITCHEN = { lat: 12.9352, lng: 77.6245 };
const CUSTOMER = { lat: 12.936, lng: 77.625 };

function outlet(overrides: Partial<OutletRow> = {}): OutletRow {
  return {
    id: "outlet_1",
    name: "Koramangala Kitchen",
    address: "42, 100 Feet Road",
    city: "Bengaluru",
    postalCode: "560034",
    latitude: String(KITCHEN.lat),
    longitude: String(KITCHEN.lng),
    latitudeNum: String(KITCHEN.lat),
    longitudeNum: String(KITCHEN.lng),
    preparationMinutes: 25,
    isActive: true,
    isOpen: true,
    deliveryRadiusKm: "5",
    ...overrides,
  };
}

const getOutlets = (rows: OutletRow[]) => async () => rows;

// =============================================================================
// Shared radius policy (bug: three different policies)
// =============================================================================

describe("resolveRadiusKm — the one radius policy", () => {
  it("accepts finite, positive radii up to the cap", () => {
    expect(resolveRadiusKm(15)).toBe(15);
    expect(resolveRadiusKm("15.00")).toBe(15);
    expect(resolveRadiusKm(MAX_DELIVERY_RADIUS_KM)).toBe(100);
    expect(isAcceptableRadiusKm(0.01)).toBe(true);
    expect(isAcceptableRadiusKm(0)).toBe(false);
  });

  it("rejects the string \"0\" and anything above the cap", () => {
    // storefront.ts used to accept any finite number as the default radius, so a
    // "0" in the column made every customer "outside our delivery area" and a
    // typo could expand the ring to the whole planet.
    expect(resolveRadiusKm("0")).toBe(DEFAULT_DELIVERY_RADIUS_KM);
    expect(resolveRadiusKm(0)).toBe(DEFAULT_DELIVERY_RADIUS_KM);
    expect(resolveRadiusKm(-4)).toBe(DEFAULT_DELIVERY_RADIUS_KM);
    expect(resolveRadiusKm(101)).toBe(DEFAULT_DELIVERY_RADIUS_KM);
    expect(resolveRadiusKm("abc")).toBe(DEFAULT_DELIVERY_RADIUS_KM);
    expect(resolveRadiusKm(null)).toBe(DEFAULT_DELIVERY_RADIUS_KM);
    expect(resolveRadiusKm(NaN)).toBe(DEFAULT_DELIVERY_RADIUS_KM);
    expect(resolveRadiusKm(Infinity)).toBe(DEFAULT_DELIVERY_RADIUS_KM);
  });

  it("clamps the fallback too, so 0 cannot re-enter through the back door", () => {
    expect(resolveRadiusKm("abc", 0)).toBe(DEFAULT_DELIVERY_RADIUS_KM);
    expect(resolveRadiusKm("abc", 9999)).toBe(DEFAULT_DELIVERY_RADIUS_KM);
    expect(resolveRadiusKm("abc", 12)).toBe(12);
    expect(parseRadiusKm(undefined, 0)).toBe(DEFAULT_DELIVERY_RADIUS_KM);
  });

  it("clamps the caller's default radius inside selection", () => {
    const far = outlet({
      id: "far",
      name: "Whitefield Kitchen",
      latitudeNum: "12.9698",
      longitudeNum: "77.7500",
      deliveryRadiusKm: null,
    });
    // 12.9km away with no per-outlet radius: unreachable under the policy
    // default, serviceable only if an unbounded default leaked through.
    expect(selectBestOutlet([far], CUSTOMER.lat, CUSTOMER.lng, 9999)).toBeNull();
    expect(selectBestOutlet([far], CUSTOMER.lat, CUSTOMER.lng)).toBeNull();
  });
});

// =============================================================================
// Accuracy classification (bug: server disagreed with the client on NaN)
// =============================================================================

describe("classifyAccuracy — must mirror the client", () => {
  it("treats non-finite accuracy as UNKNOWN, not POOR", () => {
    // client/src/lib/locationCapture.ts returns UNKNOWN for a non-finite fix.
    expect(classifyAccuracy(NaN)).toBe("UNKNOWN");
    expect(classifyAccuracy(Infinity)).toBe("UNKNOWN");
    expect(classifyAccuracy(-Infinity)).toBe("UNKNOWN");
    expect(classifyAccuracy(null)).toBe("UNKNOWN");
    expect(classifyAccuracy(0)).toBe("UNKNOWN");
  });

  it("keeps the finite bands unchanged", () => {
    expect(classifyAccuracy(10)).toBe("HIGH");
    expect(classifyAccuracy(40)).toBe("GOOD");
    expect(classifyAccuracy(80)).toBe("LOW");
    expect(classifyAccuracy(500)).toBe("POOR");
  });
});

// =============================================================================
// Transposed outlet pins (bug: swapped lat/lng read as OUTSIDE_DELIVERY_RADIUS)
// =============================================================================

describe("isLikelyTransposedCoordinates", () => {
  it("flags a clearly swapped Indian pin", () => {
    expect(isLikelyTransposedCoordinates(KITCHEN.lng, KITCHEN.lat, CUSTOMER)).toBe(true);
  });

  it("never flags a correctly ordered pin", () => {
    expect(isLikelyTransposedCoordinates(KITCHEN.lat, KITCHEN.lng, CUSTOMER)).toBe(false);
    expect(isLikelyTransposedCoordinates(0, 0, CUSTOMER)).toBe(false);
  });

  it("does not flag a legitimately northern pin (|lat| > |lng| is real geography)", () => {
    // Finland: 65/25. Swapping it does NOT explain the geometry, so the outlet
    // must stay serviceable — a naive |lat| > |lng| rule would have blacked out
    // every northern-European kitchen.
    expect(isLikelyTransposedCoordinates(65, 25, { lat: 65.01, lng: 25.02 })).toBe(false);
    expect(isLikelyTransposedCoordinates(50.45, 30.52, { lat: 50.45, lng: 30.52 })).toBe(false);
  });

  it("refuses to guess without an anchor", () => {
    expect(isLikelyTransposedCoordinates(77.6, 12.9)).toBe(false);
    expect(isLikelyTransposedCoordinates(77.6, 12.9, { lat: NaN, lng: 0 })).toBe(false);
  });

  it("does not flag an out-of-range pair (range checks already reject it)", () => {
    expect(isLikelyTransposedCoordinates(999, 12, CUSTOMER)).toBe(false);
  });

  it("reports OUTLET_MISCONFIGURED, never OUTSIDE_DELIVERY_RADIUS", async () => {
    // Swap the numeric mirrors too — they win in outletCoordinates, so a
    // varchar-only swap would never reach the validation.
    const swapped = outlet({
      latitude: String(KITCHEN.lng), longitude: String(KITCHEN.lat),
      latitudeNum: String(KITCHEN.lng), longitudeNum: String(KITCHEN.lat),
    });
    const result = await checkServiceability(
      CUSTOMER.lat, CUSTOMER.lng, "rest_1",
      getOutlets([swapped]),
      undefined,
      { availability: { isOpen: true } },
    );
    expect(result.serviceable).toBe(false);
    expect(result.reason).toBe("OUTLET_MISCONFIGURED");
  });

  it("skips the swapped outlet but still serves a correctly configured sibling", async () => {
    const swapped = outlet({
      id: "swapped", name: "Swapped Kitchen",
      latitude: String(KITCHEN.lng), longitude: String(KITCHEN.lat),
      latitudeNum: String(KITCHEN.lng), longitudeNum: String(KITCHEN.lat),
    });
    const good = outlet({ id: "good", name: "Correct Kitchen" });
    const selection = selectBestOutlet([swapped, good], CUSTOMER.lat, CUSTOMER.lng);
    expect(selection?.outlet.id).toBe("good");
  });
});

// =============================================================================
// Opening hours (bug: checkServiceability ignored schedules entirely)
// =============================================================================

describe("restaurantOpenStatus", () => {
  // 2026-01-06T18:00:00Z = 23:30 IST, Tuesday.
  const LATE = new Date("2026-01-06T18:00:00Z");
  const NOON = new Date("2026-01-06T06:30:00Z");

  it("honours the manual master switch", () => {
    expect(restaurantOpenStatus({ isOpen: false }, NOON).open).toBe(false);
    expect(restaurantOpenStatus({ isOpen: false }, NOON).detail).toMatch(/not accepting orders/i);
  });

  it("honours the weekly schedule", () => {
    const gate = { isOpen: true, schedules: [{ dayOfWeek: 2, openTime: "11:00", closeTime: "23:00" }] };
    expect(restaurantOpenStatus(gate, NOON).open).toBe(true);
    const late = restaurantOpenStatus(gate, LATE);
    expect(late.open).toBe(false);
    expect(late.detail).toMatch(/^Opens /);
  });

  it("honours a temporary closure and prefers the operator's message", () => {
    const gate = {
      isOpen: true,
      tempClosureStart: new Date("2026-01-06T00:00:00Z"),
      tempClosureEnd: new Date("2026-01-07T00:00:00Z"),
      tempClosureMessage: "Kitchen under maintenance",
    };
    const status = restaurantOpenStatus(gate, NOON);
    expect(status.open).toBe(false);
    expect(status.detail).toBe("Kitchen under maintenance");
  });

  it("treats no schedules as always open", () => {
    expect(restaurantOpenStatus({ isOpen: true }, LATE).open).toBe(true);
  });
});

describe("checkServiceability — opening hours gate", () => {
  // 23:30 IST on a Tuesday.
  const LATE = new Date("2026-01-06T18:00:00Z");
  const CLOSES_AT_11PM = [{ dayOfWeek: 2, openTime: "11:00", closeTime: "23:00" }];

  it("refuses a closed kitchen instead of promising an order that must fail", async () => {
    // This is the pre-payment gate answering YES to an order the authoritative
    // checkout gate (db.ts) was guaranteed to throw on.
    const result = await checkServiceability(
      CUSTOMER.lat, CUSTOMER.lng, "rest_1",
      getOutlets([outlet()]),
      undefined,
      { availability: { isOpen: true, schedules: CLOSES_AT_11PM }, now: LATE },
    );
    expect(result.serviceable).toBe(false);
    if (result.serviceable) throw new Error("expected a refusal");
    expect(result.reason).toBe("OUTLET_CLOSED");
    expect(result.detail).toMatch(/^Opens /);
  });

  it("still allows the order inside opening hours", async () => {
    const result = await checkServiceability(
      CUSTOMER.lat, CUSTOMER.lng, "rest_1",
      getOutlets([outlet()]),
      undefined,
      { availability: { isOpen: true, schedules: CLOSES_AT_11PM }, now: new Date("2026-01-06T09:00:00Z") },
    );
    expect(result.serviceable).toBe(true);
  });

  it("refuses during a temporary closure", async () => {
    const result = await checkServiceability(
      CUSTOMER.lat, CUSTOMER.lng, "rest_1",
      getOutlets([outlet()]),
      undefined,
      {
        availability: {
          isOpen: true,
          tempClosureStart: new Date("2026-01-06T00:00:00Z"),
          tempClosureMessage: "Closed for a private event",
        },
        now: LATE,
      },
    );
    expect(result.serviceable).toBe(false);
    if (result.serviceable) throw new Error("expected a refusal");
    expect(result.reason).toBe("OUTLET_CLOSED");
    expect(result.detail).toBe("Closed for a private event");
  });

  it("reports OUTLET_CLOSED (not a null-named radius failure) when every outlet is manually shut", async () => {
    // outlets.isOpen is a static manual boolean; findNearestOutlet skips closed
    // rows, so the old path fell through to
    // OUTSIDE_DELIVERY_RADIUS with outletName=null — telling the customer their
    // address was out of area when the truth was "the kitchen is shut".
    const rows = [
      outlet({ id: "a", name: "Koramangala Kitchen", isOpen: false }),
      outlet({ id: "b", name: "Indiranagar Kitchen", isOpen: false }),
    ];
    const result = await checkServiceability(
      CUSTOMER.lat, CUSTOMER.lng, "rest_1",
      getOutlets(rows),
      undefined,
      { availability: { isOpen: true } },
    );
    expect(result.serviceable).toBe(false);
    expect(result.reason).toBe("OUTLET_CLOSED");
    if (!result.serviceable) expect(result.outletName).toBe("Koramangala Kitchen");
  });

  it("keeps NO_ACTIVE_OUTLET for fully decommissioned outlets", async () => {
    const rows = [outlet({ id: "a", isActive: false, isOpen: false })];
    const result = await checkServiceability(
      CUSTOMER.lat, CUSTOMER.lng, "rest_1",
      getOutlets(rows),
      undefined,
      { availability: { isOpen: true } },
    );
    expect(result.serviceable).toBe(false);
    expect(result.reason).toBe("NO_ACTIVE_OUTLET");
  });

  it("omitting the availability gate keeps the legacy behaviour", async () => {
    const result = await checkServiceability(CUSTOMER.lat, CUSTOMER.lng, "rest_1", getOutlets([outlet()]));
    expect(result.serviceable).toBe(true);
  });
});

// =============================================================================
// Provider status → reason mapping (bug: transport failure read as "not serviceable")
// =============================================================================

describe("checkServiceability — provider outcomes map to distinct reasons", () => {
  const base = { availability: { isOpen: true } };

  it("an explicit provider NO is SHADOWFAX_NOT_SERVICEABLE", async () => {
    const result = await checkServiceability(
      CUSTOMER.lat, CUSTOMER.lng, "rest_1",
      getOutlets([outlet()]),
      async () => ({ serviceable: false }),
      base,
    );
    expect(result.serviceable).toBe(false);
    expect(result.reason).toBe("SHADOWFAX_NOT_SERVICEABLE");
  });

  it("a provider we could not reach is SHADOWFAX_UNAVAILABLE, never NOT_SERVICEABLE", async () => {
    // Timeouts / 5xx / DNS now propagate out of the integration instead of
    // collapsing into a coverage verdict.
    const result = await checkServiceability(
      CUSTOMER.lat, CUSTOMER.lng, "rest_1",
      getOutlets([outlet()]),
      async () => { throw new Error("Shadowfax is unavailable (HTTP 503)."); },
      base,
    );
    expect(result.serviceable).toBe(false);
    // Still fails closed — only the reason differs.
    expect(result.reason).toBe("SHADOWFAX_UNAVAILABLE");
    expect(result.reason).not.toBe("SHADOWFAX_NOT_SERVICEABLE");
  });

  it("hands the provider check the outlet it actually selected", async () => {
    // The provider pair-check must never be bound to a different pickup point
    // than the outlet finally chosen.
    const near = outlet({ id: "near", name: "Near Kitchen", postalCode: "560034", latitudeNum: "12.9352", longitudeNum: "77.6245" });
    const far = outlet({ id: "far", name: "Far Kitchen", postalCode: "560038", latitudeNum: "12.9700", longitudeNum: "77.6600", deliveryRadiusKm: "20" });
    const check = vi.fn(async (_pickup: unknown, _drop: unknown, selected: { id: string } | null) => {
      expect(selected?.id).toBe("near");
      return { serviceable: true };
    });
    const result = await checkServiceability(CUSTOMER.lat, CUSTOMER.lng, "rest_1", getOutlets([far, near]), check, base);
    expect(result.serviceable).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
    if (!result.serviceable) throw new Error("expected serviceable");
    expect(result.outletId).toBe("near");
  });
});