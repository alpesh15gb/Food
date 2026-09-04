/**
 * Availability Engine Tests — full hierarchy evaluation.
 */
import { describe, expect, it } from "vitest";
import {
  checkRestaurantAvailability,
  checkCategoryAvailability,
  checkItemAvailability,
  evaluateItemFullAvailability,
} from "./availability";
import type { RestaurantRow, MenuItemRow } from "../../drizzle/schema";

function makeRestaurant(overrides: Partial<RestaurantRow> = {}): RestaurantRow {
  return {
    id: "rest_test",
    slug: "test-restaurant",
    name: "Test Restaurant",
    description: null,
    cuisineSummary: "Test",
    logoUrl: null,
    bannerImageUrl: null,
    primaryColor: "#000000",
    secondaryColor: "#ffffff",
    accentColor: null,
    fontFamily: null,
    bodyFontFamily: null,
    faviconUrl: null,
    contactPhone: null,
    contactEmail: null,
    address: null,
    latitude: null,
    longitude: null,
    gstNumber: null,
    gstPercentage: null,
    deliveryFeePaise: 0,
    packagingFeePaise: 0,
    minOrderPaise: 0,
    isOpen: true,
    opensAt: "11:00 AM",
    allowScheduledOrders: true,
    preparationMinutes: 25,
    deliveryRadiusKm: null,
    tempClosureStart: null,
    tempClosureEnd: null,
    tempClosureMessage: null,
    razorpayAccountId: null,
    razorpayAccountStatus: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RestaurantRow;
}

function makeItem(overrides: Partial<MenuItemRow> = {}): MenuItemRow {
  return {
    id: "item_test",
    restaurantId: "rest_test",
    categoryId: "cat_test",
    sku: null,
    name: "Test Item",
    slug: null,
    description: null,
    shortDescription: null,
    pricePaise: 20000,
    offerPricePaise: null,
    costPricePaise: null,
    imageUrl: null,
    dietaryType: "veg",
    tag: null,
    isBestseller: false,
    isFeatured: false,
    isRecommended: false,
    spiceLevel: null,
    preparationMinutes: null,
    availability: "AVAILABLE",
    availableNote: null,
    isOpen: true,
    isCustomizable: false,
    taxPercent: null,
    packagingFeePaise: null,
    stock: null,
    maxQuantityPerOrder: 10,
    sortOrder: 0,
    tags: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("checkRestaurantAvailability", () => {
  it("returns available when restaurant is open with no schedule", () => {
    const restaurant = makeRestaurant({ isOpen: true });
    const result = checkRestaurantAvailability(restaurant, []);
    expect(result.isAvailable).toBe(true);
  });

  it("returns unavailable when restaurant is off", () => {
    const restaurant = makeRestaurant({ isOpen: false });
    const result = checkRestaurantAvailability(restaurant, []);
    expect(result.isAvailable).toBe(false);
    expect(result.reason).toContain("closed");
  });

  it("returns unavailable during temporary closure", () => {
    const restaurant = makeRestaurant({
      isOpen: true,
      tempClosureStart: new Date("2025-01-15"),
      tempClosureEnd: new Date("2025-01-20"),
      tempClosureMessage: "Festival break",
    });
    const result = checkRestaurantAvailability(restaurant, [], new Date("2025-01-17"));
    expect(result.isAvailable).toBe(false);
    expect(result.reason).toBe("Festival break");
  });
});

describe("checkCategoryAvailability", () => {
  it("returns available when visible and open with no schedule", () => {
    const result = checkCategoryAvailability({ isVisible: true, isOpen: true }, []);
    expect(result.isAvailable).toBe(true);
  });

  it("returns unavailable when not visible", () => {
    const result = checkCategoryAvailability({ isVisible: false, isOpen: true }, []);
    expect(result.isAvailable).toBe(false);
  });
});

describe("checkItemAvailability", () => {
  it("returns available when item is in good state", () => {
    const item = makeItem({ isOpen: true, availability: "AVAILABLE" });
    const result = checkItemAvailability(item, []);
    expect(result.isAvailable).toBe(true);
  });

  it("returns unavailable when item is disabled", () => {
    const item = makeItem({ isOpen: true, availability: "DISABLED" });
    const result = checkItemAvailability(item, []);
    expect(result.isAvailable).toBe(false);
  });

  it("returns unavailable when out of stock", () => {
    const item = makeItem({ isOpen: true, availability: "AVAILABLE", stock: 0 });
    const result = checkItemAvailability(item, []);
    expect(result.isAvailable).toBe(false);
    expect(result.reason).toContain("out of stock");
  });

  it("returns unavailable when isOpen is false", () => {
    const item = makeItem({ isOpen: false, availability: "AVAILABLE" });
    const result = checkItemAvailability(item, []);
    expect(result.isAvailable).toBe(false);
  });
});

describe("evaluateItemFullAvailability", () => {
  const now = new Date("2025-01-15T12:00:00Z"); // Wednesday

  it("returns available when all levels pass", () => {
    const result = evaluateItemFullAvailability({
      restaurant: makeRestaurant({ isOpen: true }),
      restaurantSchedules: [],
      outletActive: true,
      categoryActive: true,
      categorySchedules: [],
      item: makeItem(),
      itemSchedules: [],
      now,
    });
    expect(result.isAvailable).toBe(true);
  });

  it("returns unavailable when restaurant is off", () => {
    const result = evaluateItemFullAvailability({
      restaurant: makeRestaurant({ isOpen: false }),
      restaurantSchedules: [],
      outletActive: true,
      categoryActive: true,
      categorySchedules: [],
      item: makeItem(),
      itemSchedules: [],
      now,
    });
    expect(result.isAvailable).toBe(false);
  });

  it("returns unavailable when outlet is inactive", () => {
    const result = evaluateItemFullAvailability({
      restaurant: makeRestaurant({ isOpen: true }),
      restaurantSchedules: [],
      outletActive: false,
      categoryActive: true,
      categorySchedules: [],
      item: makeItem(),
      itemSchedules: [],
      now,
    });
    expect(result.isAvailable).toBe(false);
    expect(result.reason).toContain("outlet");
  });

  it("returns unavailable when category is inactive", () => {
    const result = evaluateItemFullAvailability({
      restaurant: makeRestaurant({ isOpen: true }),
      restaurantSchedules: [],
      outletActive: true,
      categoryActive: false,
      categorySchedules: [],
      item: makeItem(),
      itemSchedules: [],
      now,
    });
    expect(result.isAvailable).toBe(false);
    expect(result.reason).toContain("Category");
  });

  it("returns unavailable when item is sold out", () => {
    const result = evaluateItemFullAvailability({
      restaurant: makeRestaurant({ isOpen: true }),
      restaurantSchedules: [],
      outletActive: true,
      categoryActive: true,
      categorySchedules: [],
      item: makeItem({ availability: "SOLD_OUT" }),
      itemSchedules: [],
      now,
    });
    expect(result.isAvailable).toBe(false);
  });
});
