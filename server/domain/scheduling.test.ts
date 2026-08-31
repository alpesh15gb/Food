/**
 * Scheduling Engine Tests — cross-midnight, weekday rules, date ranges.
 */
import { describe, expect, it } from "vitest";
import {
  isScheduledOpen,
  isRestaurantOpen,
  isCategoryActive,
  isItemScheduledAvailable,
  type ScheduleRule,
  type RestaurantScheduleConfig,
} from "./scheduling";

describe("isScheduledOpen", () => {
  it("returns true when no schedules exist (always open)", () => {
    const now = new Date("2025-01-15T12:00:00Z"); // Wednesday
    expect(isScheduledOpen([], now)).toBe(true);
  });

  it("matches a weekday schedule during open hours", () => {
    const now = new Date("2025-01-15T12:00:00Z"); // Wednesday
    const schedules: ScheduleRule[] = [
      { dayOfWeek: 3, openTime: "09:00", closeTime: "23:00", isActive: true },
    ];
    expect(isScheduledOpen(schedules, now)).toBe(true);
  });

  it("rejects a weekday schedule outside open hours", () => {
    const now = new Date("2025-01-15T04:00:00Z"); // Wed 9:30 AM IST
    const schedules: ScheduleRule[] = [
      { dayOfWeek: 3, openTime: "10:00", closeTime: "22:00", isActive: true },
    ];
    // 4:00 UTC = 9:30 IST, which is before 10:00 AM
    expect(isScheduledOpen(schedules, now)).toBe(false);
  });

  it("rejects when day doesn't match", () => {
    const now = new Date("2025-01-15T12:00:00Z"); // Wednesday
    const schedules: ScheduleRule[] = [
      { dayOfWeek: 6, openTime: "09:00", closeTime: "23:00", isActive: true },
    ];
    expect(isScheduledOpen(schedules, now)).toBe(false);
  });

  it("handles cross-midnight schedule (22:00 – 02:00)", () => {
    // 11 PM IST on Thursday = 5:30 PM UTC Thursday (but IST is 22:00)
    const evening = new Date("2025-01-16T16:30:00Z"); // Thu 22:00 IST
    const schedules: ScheduleRule[] = [
      { dayOfWeek: 4, openTime: "22:00", closeTime: "02:00", isActive: true },
    ];
    expect(isScheduledOpen(schedules, evening)).toBe(true);
  });

  it("rejects after cross-midnight close time", () => {
    // 3 AM IST Friday = 9:30 PM UTC Thursday
    const lateNight = new Date("2025-01-16T21:00:00Z"); // Fri 02:30 IST
    const schedules: ScheduleRule[] = [
      { dayOfWeek: 4, openTime: "22:00", closeTime: "02:00", isActive: true },
    ];
    // Note: Friday 2:30 IST after Thursday's 2 AM close = invalid
    expect(isScheduledOpen(schedules, lateNight)).toBe(false);
  });

  it("respects inactive schedule rule", () => {
    const now = new Date("2025-01-15T12:00:00Z"); // Wednesday
    const schedules: ScheduleRule[] = [
      { dayOfWeek: 3, openTime: "09:00", closeTime: "23:00", isActive: false },
    ];
    expect(isScheduledOpen(schedules, now)).toBe(false);
  });

  it("respects date range", () => {
    const now = new Date("2025-06-15T12:00:00Z");
    const schedules: ScheduleRule[] = [
      {
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
        isActive: true,
      },
    ];
    expect(isScheduledOpen(schedules, now)).toBe(true);
  });

  it("rejects outside date range", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    const schedules: ScheduleRule[] = [
      {
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-12-31"),
        isActive: true,
      },
    ];
    expect(isScheduledOpen(schedules, now)).toBe(false);
  });

  it("matches all-day schedule (no time constraints)", () => {
    const now = new Date("2025-01-15T12:00:00Z"); // Wednesday
    const schedules: ScheduleRule[] = [
      { dayOfWeek: 3, isActive: true },
    ];
    expect(isScheduledOpen(schedules, now)).toBe(true);
  });
});

describe("isRestaurantOpen", () => {
  it("returns false when restaurant isOpen is false", () => {
    const config: RestaurantScheduleConfig = {
      isOpen: false,
      schedules: [],
    };
    expect(isRestaurantOpen(config)).toBe(false);
  });

  it("returns false during temporary closure", () => {
    const config: RestaurantScheduleConfig = {
      isOpen: true,
      tempClosureStart: new Date("2025-01-15"),
      tempClosureEnd: new Date("2025-01-20"),
      schedules: [],
    };
    const now = new Date("2025-01-17T12:00:00Z");
    expect(isRestaurantOpen(config, now)).toBe(false);
  });

  it("returns true when open and not in temp closure", () => {
    const config: RestaurantScheduleConfig = {
      isOpen: true,
      tempClosureStart: new Date("2025-01-15"),
      tempClosureEnd: new Date("2025-01-20"),
      schedules: [],
    };
    const now = new Date("2025-01-25T12:00:00Z");
    expect(isRestaurantOpen(config, now)).toBe(true);
  });
});

describe("isCategoryActive", () => {
  it("returns false when not visible", () => {
    expect(isCategoryActive({ isVisible: false, isOpen: true, schedules: [] })).toBe(false);
  });

  it("returns false when isOpen is false", () => {
    expect(isCategoryActive({ isVisible: true, isOpen: false, schedules: [] })).toBe(false);
  });

  it("returns true when visible and open with no schedule", () => {
    expect(isCategoryActive({ isVisible: true, isOpen: true, schedules: [] })).toBe(true);
  });
});

describe("isItemScheduledAvailable", () => {
  it("returns false when item is disabled", () => {
    expect(isItemScheduledAvailable({
      isOpen: true,
      availability: "DISABLED",
      schedules: [],
    })).toBe(false);
  });

  it("returns false when out of stock", () => {
    expect(isItemScheduledAvailable({
      isOpen: true,
      availability: "OUT_OF_STOCK",
      schedules: [],
    })).toBe(false);
  });

  it("returns true when available and open", () => {
    expect(isItemScheduledAvailable({
      isOpen: true,
      availability: "AVAILABLE",
      schedules: [],
    })).toBe(true);
  });

  it("returns false when isOpen is false", () => {
    expect(isItemScheduledAvailable({
      isOpen: false,
      availability: "AVAILABLE",
      schedules: [],
    })).toBe(false);
  });
});
