/**
 * Availability Engine — determines effective item availability by evaluating
 * the full hierarchy: restaurant → outlet → category → item + schedule + stock.
 *
 * This is the single source of truth for storefront display, cart validation,
 * and checkout verification.
 */
import { eq, and, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  restaurants,
  outlets,
  menuCategories,
  menuItems,
  type RestaurantRow,
  type MenuItemRow,
} from "../../drizzle/schema";
import {
  isRestaurantOpen,
  isCategoryActive,
  isItemScheduledAvailable,
  isScheduledOpen,
  type RestaurantScheduleConfig,
  type CategoryScheduleConfig,
  type ItemScheduleConfig,
} from "./scheduling";

export type AvailabilityResult = {
  isAvailable: boolean;
  reason: string | null;
  nextAvailableAt: Date | null;
};

export type FullAvailabilityContext = {
  restaurant: RestaurantRow;
  restaurantSchedules: any[];
  outletActive: boolean;
  outletSchedules?: any[];
  categoryActive: boolean;
  categorySchedules: any[];
  item: MenuItemRow;
  itemSchedules: any[];
  now: Date;
};

/**
 * Check if the restaurant is currently accepting orders.
 */
export function checkRestaurantAvailability(
  restaurant: RestaurantRow,
  schedules: any[],
  now: Date = new Date()
): AvailabilityResult {
  const config: RestaurantScheduleConfig = {
    isOpen: restaurant.isOpen,
    tempClosureStart: restaurant.tempClosureStart,
    tempClosureEnd: restaurant.tempClosureEnd,
    tempClosureMessage: restaurant.tempClosureMessage,
    schedules,
  };

  const isOpen = isRestaurantOpen(config, now);

  if (!isOpen) {
    if (restaurant.tempClosureStart && restaurant.tempClosureEnd) {
      return {
        isAvailable: false,
        reason: restaurant.tempClosureMessage || "Restaurant is temporarily closed",
        nextAvailableAt: restaurant.tempClosureEnd,
      };
    }
    return {
      isAvailable: false,
      reason: "Restaurant is currently closed",
      nextAvailableAt: null,
    };
  }

  return { isAvailable: true, reason: null, nextAvailableAt: null };
}

/**
 * Check if a category is currently active and visible.
 */
export function checkCategoryAvailability(
  category: { isVisible: boolean; isOpen: boolean },
  schedules: any[],
  now: Date = new Date()
): AvailabilityResult {
  const config: CategoryScheduleConfig = {
    isVisible: category.isVisible,
    isOpen: category.isOpen,
    schedules,
  };

  const isActive = isCategoryActive(config, now);

  return {
    isAvailable: isActive,
    reason: isActive ? null : "Category not available at this time",
    nextAvailableAt: null,
  };
}

/**
 * Check if a menu item is currently available.
 */
export function checkItemAvailability(
  item: MenuItemRow,
  schedules: any[],
  now: Date = new Date()
): AvailabilityResult {
  const config: ItemScheduleConfig = {
    isOpen: item.isOpen,
    availability: item.availability,
    schedules,
  };

  const isAvailable = isItemScheduledAvailable(config, now);

  if (!isAvailable) {
    let reason: string;
    if (!item.isOpen) reason = "Item is currently unavailable";
    else if (item.availability === "DISABLED") reason = "Item is not available";
    else if (item.availability === "OUT_OF_STOCK") reason = "Item is out of stock";
    else if (item.availability === "SOLD_OUT") reason = "Item is sold out";
    else reason = "Item is not available at this time";

    return { isAvailable: false, reason, nextAvailableAt: null };
  }

  // Stock check
  if (item.stock !== null && item.stock <= 0) {
    return { isAvailable: false, reason: "Item is out of stock", nextAvailableAt: null };
  }

  return { isAvailable: true, reason: null, nextAvailableAt: null };
}

/**
 * Evaluate the full availability hierarchy for an item.
 */
export function evaluateItemFullAvailability(
  context: FullAvailabilityContext
): AvailabilityResult {
  const { restaurant, restaurantSchedules, outletActive, outletSchedules,
    categoryActive, categorySchedules, item, itemSchedules, now } = context;

  // 1. Restaurant level
  const restCheck = checkRestaurantAvailability(restaurant, restaurantSchedules, now);
  if (!restCheck.isAvailable) return restCheck;

  // 2. Outlet level (flag + optional schedule window; fail closed on bad schedules)
  if (!outletActive) {
    return { isAvailable: false, reason: "This outlet is not currently available", nextAvailableAt: null };
  }
  if (outletSchedules && outletSchedules.length > 0) {
    if (!isScheduledOpen(outletSchedules, now)) {
      return { isAvailable: false, reason: "This outlet is not currently available", nextAvailableAt: null };
    }
  }

  // 3. Category level (flag + schedule window — schedules are authoritative
  // even when the caller precomputed categoryActive without them).
  if (!categoryActive) {
    return { isAvailable: false, reason: "Category not available at this time", nextAvailableAt: null };
  }
  if (categorySchedules && categorySchedules.length > 0) {
    if (!isScheduledOpen(categorySchedules, now)) {
      return { isAvailable: false, reason: "Category not available at this time", nextAvailableAt: null };
    }
  }

  // 4. Item level
  const itemCheck = checkItemAvailability(item, itemSchedules, now);
  if (!itemCheck.isAvailable) return itemCheck;

  return { isAvailable: true, reason: null, nextAvailableAt: null };
}

/**
 * Batch-compute effective availability for a list of items.
 * Used by the storefront to render the menu.
 */
export function batchComputeAvailability(
  items: MenuItemRow[],
  restaurant: RestaurantRow,
  restaurantSchedules: any[],
  outletActive: boolean,
  categoryMap: Map<string, { isVisible: boolean; isOpen: boolean; schedules: any[] }>,
  itemScheduleMap: Map<string, any[]>,
  now: Date = new Date(),
  outletSchedules: any[] = []
): Map<string, AvailabilityResult> {
  const results = new Map<string, AvailabilityResult>();

  const restCheck = checkRestaurantAvailability(restaurant, restaurantSchedules, now);
  const outletScheduleOpen = outletSchedules.length === 0 || isScheduledOpen(outletSchedules, now);

  for (const item of items) {
    if (!restCheck.isAvailable) {
      results.set(item.id, restCheck);
      continue;
    }

    if (!outletActive || !outletScheduleOpen) {
      results.set(item.id, { isAvailable: false, reason: "Outlet not available", nextAvailableAt: null });
      continue;
    }

    const category = categoryMap.get(item.categoryId);
    if (category) {
      const catCheck = checkCategoryAvailability(category, category.schedules, now);
      if (!catCheck.isAvailable) {
        results.set(item.id, catCheck);
        continue;
      }
    }

    const itemSchedules = itemScheduleMap.get(item.id) ?? [];
    const itemCheck = checkItemAvailability(item, itemSchedules, now);
    results.set(item.id, itemCheck);
  }

  return results;
}
