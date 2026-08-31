/**
 * Location Domain Service Tests
 */
import { describe, expect, it } from "vitest";
import {
  isValidLatitude,
  isValidLongitude,
  validateGeoLocation,
  classifyAccuracy,
  haversineDistanceKm,
  selectBestOutlet,
} from "./locationService";

// =============================================================================
// Coordinate Validation
// =============================================================================

describe("Coordinate Validation", () => {
  describe("isValidLatitude", () => {
    it("accepts valid latitude", () => {
      expect(isValidLatitude(12.9352)).toBe(true);
      expect(isValidLatitude(-90)).toBe(true);
      expect(isValidLatitude(90)).toBe(true);
      expect(isValidLatitude(0)).toBe(true);
    });

    it("rejects invalid latitude", () => {
      expect(isValidLatitude(91)).toBe(false);
      expect(isValidLatitude(-91)).toBe(false);
      expect(isValidLatitude(NaN)).toBe(false);
      expect(isValidLatitude(Infinity)).toBe(false);
      expect(isValidLatitude(-Infinity)).toBe(false);
    });

    it("rejects non-number types", () => {
      expect(isValidLatitude("12.9")).toBe(false);
      expect(isValidLatitude(null)).toBe(false);
      expect(isValidLatitude(undefined)).toBe(false);
    });
  });

  describe("isValidLongitude", () => {
    it("accepts valid longitude", () => {
      expect(isValidLongitude(77.6245)).toBe(true);
      expect(isValidLongitude(-180)).toBe(true);
      expect(isValidLongitude(180)).toBe(true);
      expect(isValidLongitude(0)).toBe(true);
    });

    it("rejects invalid longitude", () => {
      expect(isValidLongitude(181)).toBe(false);
      expect(isValidLongitude(-181)).toBe(false);
      expect(isValidLongitude(NaN)).toBe(false);
      expect(isValidLongitude(Infinity)).toBe(false);
    });
  });

  describe("validateGeoLocation", () => {
    it("validates correct coordinates", () => {
      const result = validateGeoLocation({ latitude: 12.9352, longitude: 77.6245 });
      expect(result.valid).toBe(true);
      expect(result.latitude).toBe(12.9352);
      expect(result.longitude).toBe(77.6245);
    });

    it("parses string coordinates", () => {
      const result = validateGeoLocation({ latitude: "12.9352", longitude: "77.6245" });
      expect(result.valid).toBe(true);
      expect(result.latitude).toBe(12.9352);
      expect(result.longitude).toBe(77.6245);
    });

    it("rejects missing coordinates", () => {
      const result = validateGeoLocation({});
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("rejects null coordinates", () => {
      const result = validateGeoLocation({ latitude: null, longitude: null });
      expect(result.valid).toBe(false);
    });

    it("rejects out-of-range latitude", () => {
      const result = validateGeoLocation({ latitude: 95, longitude: 77.6 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("latitude");
    });

    it("rejects out-of-range longitude", () => {
      const result = validateGeoLocation({ latitude: 12.9, longitude: 200 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("longitude");
    });

    it("rejects NaN string values", () => {
      const result = validateGeoLocation({ latitude: "abc", longitude: "77.6" });
      expect(result.valid).toBe(false);
    });
  });
});

// =============================================================================
// Accuracy Classification
// =============================================================================

describe("Accuracy Classification", () => {
  it("classifies HIGH for 1-20m", () => {
    expect(classifyAccuracy(1)).toBe("HIGH");
    expect(classifyAccuracy(5)).toBe("HIGH");
    expect(classifyAccuracy(20)).toBe("HIGH");
  });

  it("classifies GOOD for 21-50m", () => {
    expect(classifyAccuracy(25)).toBe("GOOD");
    expect(classifyAccuracy(50)).toBe("GOOD");
  });

  it("classifies LOW for 51-100m", () => {
    expect(classifyAccuracy(55)).toBe("LOW");
    expect(classifyAccuracy(100)).toBe("LOW");
  });

  it("classifies POOR for >100m", () => {
    expect(classifyAccuracy(101)).toBe("POOR");
    expect(classifyAccuracy(500)).toBe("POOR");
  });

  it("returns UNKNOWN for null/undefined/zero/negative accuracy", () => {
    expect(classifyAccuracy(null)).toBe("UNKNOWN");
    expect(classifyAccuracy(undefined)).toBe("UNKNOWN");
    expect(classifyAccuracy(0)).toBe("UNKNOWN");
    expect(classifyAccuracy(-5)).toBe("UNKNOWN");
  });
});

// =============================================================================
// Haversine Distance
// =============================================================================

describe("Haversine Distance", () => {
  it("calculates distance between known Bengaluru points", () => {
    // Koramangala to Indiranagar — approximately 5km
    const dist = haversineDistanceKm(12.9352, 77.6245, 12.9784, 77.6408);
    expect(dist).toBeGreaterThan(3);
    expect(dist).toBeLessThan(7);
  });

  it("returns ~0 for same point", () => {
    const dist = haversineDistanceKm(12.9352, 77.6245, 12.9352, 77.6245);
    expect(dist).toBeCloseTo(0, 3);
  });

  it("calculates distance between Delhi and Mumbai", () => {
    // ~1150 km
    const dist = haversineDistanceKm(28.6139, 77.209, 19.076, 72.8777);
    expect(dist).toBeGreaterThan(1000);
    expect(dist).toBeLessThan(1400);
  });

  it("is symmetric", () => {
    const d1 = haversineDistanceKm(12.9352, 77.6245, 19.076, 72.8777);
    const d2 = haversineDistanceKm(19.076, 72.8777, 12.9352, 77.6245);
    expect(d1).toBeCloseTo(d2, 6);
  });

  it("is always positive", () => {
    const dist = haversineDistanceKm(-33.8688, 151.2093, 40.7128, -74.006);
    expect(dist).toBeGreaterThan(0);
  });
});

// =============================================================================
// Outlet Selection
// =============================================================================

describe("Outlet Selection", () => {
  const outlets = [
    {
      id: "outlet_1",
      name: "Koramangala Kitchen",
      address: "42, 100 Feet Road",
      city: "Bengaluru",
      postalCode: "560034",
      latitude: "12.9352",
      longitude: "77.6245",
      preparationMinutes: 25,
      isActive: true,
      isOpen: true,
      deliveryRadiusKm: "5",
    },
    {
      id: "outlet_2",
      name: "Indiranagar Kitchen",
      address: "789, 12th Main",
      city: "Bengaluru",
      postalCode: "560038",
      latitude: "12.9784",
      longitude: "77.6408",
      preparationMinutes: 30,
      isActive: true,
      isOpen: true,
      deliveryRadiusKm: "5",
    },
    {
      id: "outlet_3",
      name: "Closed Kitchen",
      address: "100, MG Road",
      city: "Bengaluru",
      postalCode: "560001",
      latitude: "12.9716",
      longitude: "77.5946",
      preparationMinutes: 20,
      isActive: true,
      isOpen: false,
      deliveryRadiusKm: "5",
    },
  ];

  it("selects nearest outlet", () => {
    // Customer near Koramangala
    const result = selectBestOutlet(outlets, 12.936, 77.625);
    expect(result).not.toBeNull();
    expect(result!.outlet.id).toBe("outlet_1");
    expect(result!.distanceKm).toBeLessThan(1);
  });

  it("skips closed outlets", () => {
    // Customer within Koramangala radius — outlet_1 is nearest, outlet_3 (MG Road) is closed
    // Even though outlet_3 is slightly closer, it's closed so outlet_1 is selected
    const result = selectBestOutlet(outlets, 12.935, 77.625);
    expect(result).not.toBeNull();
    expect(result!.outlet.id).not.toBe("outlet_3");
  });

  it("returns null when all outlets are outside radius", () => {
    // Customer in Chennai — far from Bengaluru
    const result = selectBestOutlet(outlets, 13.0827, 80.2707);
    expect(result).toBeNull();
  });

  it("returns null for empty outlet list", () => {
    const result = selectBestOutlet([], 12.9352, 77.6245);
    expect(result).toBeNull();
  });

  it("returns null for outlets without coordinates", () => {
    const noCoordOutlets = [
      {
        id: "no_coord",
        name: "No Coordinates",
        address: "100 Main St",
        city: "Bengaluru",
        postalCode: "560001",
        latitude: null,
        longitude: null,
        preparationMinutes: 25,
        isActive: true,
        isOpen: true,
        deliveryRadiusKm: "5",
      },
    ];
    const result = selectBestOutlet(noCoordOutlets, 12.9352, 77.6245);
    expect(result).toBeNull();
  });

  it("prefers closer outlet even with longer prep time", () => {
    // Customer at Koramangala — outlet_1 is 25min prep but closer
    const result = selectBestOutlet(outlets, 12.9352, 77.6245);
    expect(result!.outlet.id).toBe("outlet_1");
  });
});
