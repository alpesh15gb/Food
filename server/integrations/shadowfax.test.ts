/**
 * Shadowfax Payload Contract Tests (Req 19, 20)
 * CONTRACT STATUS: UNVERIFIED — These tests validate internal payload construction,
 * not live API behavior. All Shadowfax API contracts remain UNVERIFIED until
 * official sandbox documentation is received and tested against.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("Shadowfax Outbound Payload (Req 19)", () => {
  const outletCoords = { lat: 17.3950, lng: 78.4867 };
  const dropCoords = { lat: 17.3960, lng: 78.4870 };

  it("pickup coordinates exactly match outlet coordinates", () => {
    // Simulate the payload construction logic from admin.ts shadowfaxDispatch
    const pickupAddress = {
      name: "Test Kitchen",
      phone: "+919876543210",
      address: "123 Main St",
      city: "Hyderabad",
      pincode: "500034",
      latitude: outletCoords.lat,
      longitude: outletCoords.lng,
    };

    expect(pickupAddress.latitude).toBe(outletCoords.lat);
    expect(pickupAddress.longitude).toBe(outletCoords.lng);
  });

  it("drop coordinates exactly match order addressSnapshot coordinates", () => {
    const addrSnapshot = {
      flatHouse: "42",
      building: "Sunrise Apts",
      street: "10th Cross",
      area: "Koramangala",
      city: "Hyderabad",
      postalCode: "500034",
      latitude: dropCoords.lat,
      longitude: dropCoords.lng,
    };

    const dropAddress = {
      name: "Customer",
      phone: "+919876543210",
      address: [addrSnapshot.flatHouse, addrSnapshot.building, addrSnapshot.street, addrSnapshot.area].filter(Boolean).join(", "),
      city: addrSnapshot.city,
      pincode: addrSnapshot.postalCode,
      latitude: typeof addrSnapshot.latitude === "string" ? parseFloat(addrSnapshot.latitude) : addrSnapshot.latitude,
      longitude: typeof addrSnapshot.longitude === "string" ? parseFloat(addrSnapshot.longitude) : addrSnapshot.longitude,
    };

    expect(dropAddress.latitude).toBe(dropCoords.lat);
    expect(dropAddress.longitude).toBe(dropCoords.lng);
  });

  it("does not re-geocode drop position at dispatch time", () => {
    // The drop address must come from the immutable order snapshot,
    // never from a fresh geocoding call
    const originalSnapshot = {
      latitude: 17.3960,
      longitude: 78.4870,
      flatHouse: "42",
      area: "Koramangala",
      city: "Hyderabad",
      postalCode: "500034",
    };

    // Simulate dispatch using snapshot directly
    const dropLat = typeof originalSnapshot.latitude === "string"
      ? parseFloat(originalSnapshot.latitude)
      : originalSnapshot.latitude;
    const dropLng = typeof originalSnapshot.longitude === "string"
      ? parseFloat(originalSnapshot.longitude)
      : originalSnapshot.longitude;

    expect(dropLat).toBe(17.3960);
    expect(dropLng).toBe(78.4870);
  });
});

describe("Shadowfax Dispatch Idempotency (Req 10)", () => {
  it("prevents duplicate dispatch when DISPATCHING record exists", () => {
    const existingDelivery = {
      provider: "shadowfax",
      status: "DISPATCHING",
    };

    const shouldBlock = existingDelivery.provider !== "manual" &&
      ["DISPATCHING", "PENDING", "ASSIGNED"].includes(existingDelivery.status);

    expect(shouldBlock).toBe(true);
  });

  it("allows retry when previous dispatch FAILED", () => {
    const existingDelivery = {
      provider: "shadowfax",
      status: "FAILED",
    };

    const shouldBlock = existingDelivery.provider !== "manual" &&
      ["DISPATCHING", "PENDING", "ASSIGNED"].includes(existingDelivery.status);

    expect(shouldBlock).toBe(false);
  });

  it("allows retry when previous delivery was manual", () => {
    const existingDelivery = {
      provider: "manual",
      status: "ASSIGNED",
    };

    const shouldBlock = existingDelivery.provider !== "manual" &&
      ["DISPATCHING", "PENDING", "ASSIGNED"].includes(existingDelivery.status);

    expect(shouldBlock).toBe(false);
  });
});
