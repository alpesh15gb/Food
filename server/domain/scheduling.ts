/**
 * Scheduling Engine — timezone-aware availability computation.
 *
 * Supports:
 * - Weekday rules (Mon-Sun)
 * - Cross-midnight schedules (e.g. 10 PM – 2 AM)
 * - Date ranges (start/end dates)
 * - Time ranges within days
 * - Manual ON/OFF overrides
 * - Temporary closures
 *
 * All times default to Asia/Kolkata (IST = UTC+5:30).
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIST(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

function getISTDayOfWeek(date: Date): number {
  const ist = toIST(date);
  return ist.getUTCDay(); // 0=Sun, 6=Sat
}

function getISTTimeMinutes(date: Date): number {
  const ist = toIST(date);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/**
 * Parse a time string like "09:00" or "23:30" into minutes since midnight.
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export type ScheduleRule = {
  dayOfWeek?: number | null;     // 0=Sun..6=Sat, null = all days
  openTime?: string | null;      // "09:00", null = open all day
  closeTime?: string | null;     // "23:00", null = until next day
  startDate?: Date | null;       // effective start date
  endDate?: Date | null;         // effective end date
  isActive?: boolean;
};

export type RestaurantScheduleConfig = {
  isOpen: boolean;
  tempClosureStart?: Date | null;
  tempClosureEnd?: Date | null;
  tempClosureMessage?: string | null;
  schedules: ScheduleRule[];
};

export type CategoryScheduleConfig = {
  isVisible: boolean;
  isOpen: boolean;
  schedules: ScheduleRule[];
};

export type ItemScheduleConfig = {
  isOpen: boolean;
  availability: string;
  schedules: ScheduleRule[];
};

/**
 * Check if a single schedule rule matches the current time.
 * Handles cross-midnight: e.g. openTime="22:00", closeTime="02:00"
 */
function doesScheduleRuleMatch(rule: ScheduleRule, now: Date): boolean {
  if (rule.isActive === false) return false;

  const currentDay = getISTDayOfWeek(now);
  const currentTimeMin = getISTTimeMinutes(now);

  // Day of week check
  if (rule.dayOfWeek != null && rule.dayOfWeek !== currentDay) {
    // Check if this could be a cross-midnight match from previous day
    const prevDay = (currentDay + 6) % 7; // wrap around
    if (rule.dayOfWeek !== prevDay) return false;

    // For cross-midnight: if closeTime > openTime, it doesn't cross midnight
    // We handle this in the time check below
    if (rule.openTime && rule.closeTime) {
      const openMin = parseTimeToMinutes(rule.openTime);
      const closeMin = parseTimeToMinutes(rule.closeTime);
      if (closeMin > openMin) return false; // normal schedule, doesn't cross midnight
    }
  }

  // Date range check
  if (rule.startDate && now < rule.startDate) return false;
  if (rule.endDate && now > rule.endDate) return false;

  // Time range check
  if (!rule.openTime && !rule.closeTime) return true; // open all day

  if (rule.openTime && rule.closeTime) {
    const openMin = parseTimeToMinutes(rule.openTime);
    const closeMin = parseTimeToMinutes(rule.closeTime);

    if (closeMin > openMin) {
      // Normal schedule: 09:00 – 23:00
      return currentTimeMin >= openMin && currentTimeMin < closeMin;
    } else {
      // Cross-midnight: 22:00 – 02:00
      // Check if current time is either:
      // 1. On the open day, after openTime, OR
      // 2. On the next day, before closeTime
      const effectiveDay = rule.dayOfWeek ?? currentDay;
      if (currentDay === effectiveDay) {
        return currentTimeMin >= openMin;
      }
      const nextDay = (effectiveDay + 1) % 7;
      if (currentDay === nextDay) {
        return currentTimeMin < closeMin;
      }
      return false;
    }
  }

  // Only openTime set: open from that time onwards
  if (rule.openTime) {
    return currentTimeMin >= parseTimeToMinutes(rule.openTime);
  }

  // Only closeTime set: open until that time
  if (rule.closeTime) {
    return currentTimeMin < parseTimeToMinutes(rule.closeTime);
  }

  return true;
}

/**
 * Determine if ANY schedule rule matches for the given time.
 * If no schedules exist, returns true (always available).
 */
export function isScheduledOpen(schedules: ScheduleRule[], now: Date = new Date()): boolean {
  if (!schedules.length) return true; // no schedule = always open
  return schedules.some(rule => doesScheduleRuleMatch(rule, now));
}

/**
 * Check if a restaurant is open right now.
 */
export function isRestaurantOpen(config: RestaurantScheduleConfig, now: Date = new Date()): boolean {
  if (!config.isOpen) return false;

  // Check temporary closure
  if (config.tempClosureStart && config.tempClosureEnd) {
    if (now >= config.tempClosureStart && now <= config.tempClosureEnd) return false;
  }

  return isScheduledOpen(config.schedules, now);
}

/**
 * Check if a category is currently active.
 */
export function isCategoryActive(config: CategoryScheduleConfig, now: Date = new Date()): boolean {
  if (!config.isVisible || !config.isOpen) return false;
  return isScheduledOpen(config.schedules, now);
}

/**
 * Check if an item is currently available based on its schedule.
 */
export function isItemScheduledAvailable(config: ItemScheduleConfig, now: Date = new Date()): boolean {
  if (!config.isOpen) return false;
  if (config.availability === "DISABLED") return false;
  if (config.availability === "OUT_OF_STOCK") return false;
  if (config.availability === "SOLD_OUT") return false;
  if (config.availability === "SCHEDULED_UNAVAILABLE") return isScheduledOpen(config.schedules, now);
  return isScheduledOpen(config.schedules, now);
}

/**
 * Get the next opening time for a given set of schedules.
 * Useful for "Opens at X:XX AM" messages.
 */
export function getNextOpenTime(schedules: ScheduleRule[], now: Date = new Date()): Date | null {
  if (!schedules.length) return null;

  // Check each day for the next available time slot
  for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
    const checkDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const checkDay = getISTDayOfWeek(checkDate);

    for (const rule of schedules) {
      if (rule.isActive === false) continue;
      if (rule.startDate && checkDate < rule.startDate) continue;
      if (rule.endDate && checkDate > rule.endDate) continue;

      if (rule.dayOfWeek != null && rule.dayOfWeek !== checkDay) continue;
      if (!rule.openTime) continue;

      const openMin = parseTimeToMinutes(rule.openTime);
      const currentTimeMin = daysAhead === 0 ? getISTTimeMinutes(now) : 0;

      if (openMin > currentTimeMin || daysAhead > 0) {
        const result = new Date(checkDate);
        const istAdjusted = new Date(result.getTime() - IST_OFFSET_MS);
        const hours = Math.floor(openMin / 60);
        const mins = openMin % 60;
        istAdjusted.setUTCHours(hours, mins, 0, 0);
        return istAdjusted;
      }
    }
  }

  return null;
}

/**
 * Get a human-readable "Opens at X:XX AM" or "Opens tomorrow at X:XX AM" string.
 */
export function getNextOpenTimeString(schedules: ScheduleRule[], now: Date = new Date()): string | null {
  const nextOpen = getNextOpenTime(schedules, now);
  if (!nextOpen) return null;

  const nowIST = toIST(now);
  const openIST = toIST(nextOpen);
  const diffDays = Math.floor((openIST.getTime() - nowIST.getTime()) / (24 * 60 * 60 * 1000));

  const timeStr = openIST.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

  if (diffDays === 0) return `Opens at ${timeStr}`;
  if (diffDays === 1) return `Opens tomorrow at ${timeStr}`;
  return `Opens in ${diffDays} days at ${timeStr}`;
}
