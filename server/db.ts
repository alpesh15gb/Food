/**
 * Database layer — typed query helpers for the complete cloud-kitchen platform.
 */
import { desc, eq, and, or, like, sql, count, sum, between, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { randomInt } from "node:crypto";
import { nanoid } from "nanoid";
import {
  users,
  adminRoles,
  adminRolePermissions,
  adminUserRoles,
  customerProfiles,
  customerAddresses,
  restaurants,
  restaurantSchedules,
  outlets,
  outletSchedules,
  menuCategories,
  categorySchedules,
  menuItems,
  productSchedules,
  productVariants,
  addonGroups,
  addonOptions,
  carts,
  cartItems,
  orders,
  orderItems,
  orderStatusHistory,
  payments,
  refunds,
  deliveries,
  deliveryStatusHistory,
  coupons,
  couponUsage,
  webhookEvents,
  auditLogs,
  settings,
  otpVerifications,
  restaurantMembers,
  type InsertUser,
  type OrderStatus,
  type MenuItemRow,
} from "../drizzle/schema";
import { calculateAuthoritativeQuote, validateCoupon, CartValidationError } from "./domain/orderPricing";
import { nanoid as nano } from "nanoid";
import crypto from "node:crypto";

/** Generate a cryptographically secure tracking token for order tracking. */
function generateTrackingToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** Strict normalize Indian phone numbers: digits only, 10-digit 6-9..., else null. */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  let p = digits;
  if (p.length === 12 && p.startsWith("91")) p = p.slice(2);
  if (p.length === 11 && p.startsWith("0")) p = p.slice(1);
  if (p.length === 10 && /^[6-9]\d{9}$/.test(p)) return p;
  return null;
}

/** Parse restaurant GST rate safely: finite 0-100, else fallback. */
function parseGstRate(raw: unknown, fallback = 5): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return n;
}

/** Minimal email check for order contact (router validates strictly with zod). */
function isPlausibleEmail(email: string): boolean {
  if (email.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertAddrStr(value: unknown, max: number): string {
  const s = String(value ?? "").trim();
  if (!s) throw new Error("__REQUIRED__");
  if (s.length > max) throw new CartValidationError(`Address field exceeds ${max} characters.`);
  return s;
}

function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("23505") || msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique");
}

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;
const id = () => nanoid(18);

// =============================================================================
// Database Connection
// =============================================================================

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({ connectionString: process.env.DATABASE_URL });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");
  return db;
}

// =============================================================================
// User Management
// =============================================================================

// Throttle lastSignedIn writes to avoid a DB write on every request.
const LAST_SIGNED_IN_THROTTLE_MS = 60 * 60 * 1000;
const lastSignedInCache = new Map<string, number>();

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  // Only set provided fields — never wipe existing values with null.
  const values: InsertUser = { openId: user.openId } as InsertUser;
  const updateSet: Record<string, unknown> = {};
  if (user.name !== undefined) {
    values.name = user.name;
    updateSet.name = user.name;
  }
  if (user.email !== undefined) {
    values.email = user.email;
    updateSet.email = user.email;
  }
  if (user.mobile !== undefined) {
    values.mobile = user.mobile;
    updateSet.mobile = user.mobile;
  }
  if (user.loginMethod !== undefined) {
    values.loginMethod = user.loginMethod;
    updateSet.loginMethod = user.loginMethod;
  }

  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }

  // Throttle lastSignedIn: only bump at most once per hour per openId.
  const now = Date.now();
  const lastBump = lastSignedInCache.get(user.openId) ?? 0;
  const shouldBump = now - lastBump > LAST_SIGNED_IN_THROTTLE_MS;
  if (shouldBump) {
    (values as Record<string, unknown>).lastSignedIn = new Date();
    updateSet.lastSignedIn = (values as Record<string, unknown>).lastSignedIn;
    lastSignedInCache.set(user.openId, now);
  }

  // Touch path (authenticateRequest) often has nothing to write when the
  // throttle holds. An empty SET clause is a SQL error ("No values to set")
  // that logged every authed user out within the hour — skip the query.
  // Safe: that caller just loaded the row, so it is guaranteed to exist.
  if (Object.keys(updateSet).length === 0) return;

  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getAdminUsers() {
  const db = await requireDb();
  return db.select().from(users).where(eq(users.role, "admin")).orderBy(desc(users.createdAt));
}

// =============================================================================
// Restaurant / Brand Management
// =============================================================================

export async function getRestaurantBySlug(slug: string) {
  const db = await requireDb();
  const result = await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
  return result[0] ?? null;
}

export async function getAllRestaurants() {
  const db = await requireDb();
  return db.select().from(restaurants).orderBy(restaurants.name);
}

export async function createRestaurant(input: {
  name: string;
  slug: string;
  description?: string;
  cuisineSummary?: string;
  logoUrl?: string;
  bannerImageUrl?: string;
  contactPhone?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
  deliveryFeePaise?: number;
  packagingFeePaise?: number;
  minOrderPaise?: number;
  preparationMinutes?: number;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  bodyFontFamily?: string;
  ownerUserId?: number;
}) {
  const db = await requireDb();
  const restaurantId = id();
  const outletId = id();

  // All-or-nothing brand bootstrap: restaurant + outlet + schedules + categories + membership.
  await db.transaction(async (tx) => {
    await tx.insert(restaurants).values({
      id: restaurantId,
      slug: input.slug,
      name: input.name,
      description: input.description ?? "",
      cuisineSummary: input.cuisineSummary ?? "",
      logoUrl: input.logoUrl,
      bannerImageUrl: input.bannerImageUrl,
      contactPhone: input.contactPhone,
      address: input.address ?? "",
      latitude: input.latitude,
      longitude: input.longitude,
      deliveryFeePaise: input.deliveryFeePaise ?? 3000,
      packagingFeePaise: input.packagingFeePaise ?? 1500,
      minOrderPaise: input.minOrderPaise ?? 19900,
      isOpen: false,
      allowScheduledOrders: true,
      preparationMinutes: input.preparationMinutes ?? 25,
      accentColor: input.accentColor ?? input.primaryColor ?? "#38271F",
      fontFamily: input.fontFamily ?? "Playfair Display",
      bodyFontFamily: input.bodyFontFamily ?? "Inter",
    });

    if (input.address) {
      await tx.insert(outlets).values({
        id: outletId,
        restaurantId,
        name: `${input.name} Kitchen`,
        address: input.address,
        city: "",
        postalCode: "",
        latitude: input.latitude,
        longitude: input.longitude,
        preparationMinutes: input.preparationMinutes ?? 25,
        isActive: true,
        isOpen: false,
      });
    }

    const daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
    await tx.insert(restaurantSchedules).values(
      daysOfWeek.map(day => ({
        id: id(),
        restaurantId,
        dayOfWeek: day,
        openTime: "09:00",
        closeTime: "23:00",
        isActive: true,
      }))
    );

    const defaultCategories = [
      { name: "Starters", slug: "starters", sortOrder: 1 },
      { name: "Main Course", slug: "main-course", sortOrder: 2 },
      { name: "Desserts", slug: "desserts", sortOrder: 3 },
      { name: "Beverages", slug: "beverages", sortOrder: 4 },
    ];

    for (const cat of defaultCategories) {
      await tx.insert(menuCategories).values({
        id: id(),
        restaurantId,
        ...cat,
        isVisible: true,
        isOpen: true,
      });
    }

    if (input.ownerUserId) {
      await tx.insert(restaurantMembers).values({
        id: id(),
        userId: input.ownerUserId,
        restaurantId,
        role: "owner",
        isActive: true,
      });
    }
  });

  return restaurantId;
}

export async function updateRestaurant(input: {
  id: string;
  name: string;
  cuisineSummary: string;
  description?: string;
  logoUrl?: string;
  primaryColor: string;
  deliveryFeePaise: number;
  packagingFeePaise: number;
  minOrderPaise: number;
  isOpen: boolean;
  allowScheduledOrders: boolean;
  preparationMinutes?: number;
  deliveryRadiusKm?: number;
  gstNumber?: string;
  gstPercentage?: string;
  tempClosureStart?: Date | null;
  tempClosureEnd?: Date | null;
  tempClosureMessage?: string | null;
}) {
  const db = await requireDb();
  // restaurantId is scope-only (verified by the router); id is the row locator — never written.
  const { deliveryRadiusKm, restaurantId: _scope, id: _id, ...rest } = input as typeof input & { restaurantId?: string };
  const updateData: Record<string, unknown> = { ...rest };
  if (deliveryRadiusKm !== undefined) {
    if (typeof deliveryRadiusKm !== "number" || !Number.isFinite(deliveryRadiusKm) || deliveryRadiusKm <= 0 || deliveryRadiusKm > 100) {
      throw new Error("Invalid delivery radius.");
    }
    updateData.deliveryRadiusKm = String(deliveryRadiusKm);
  }
  await db.update(restaurants).set(updateData).where(eq(restaurants.id, input.id));
}

// =============================================================================
// Outlet Management
// =============================================================================

export async function getOutletsByRestaurant(restaurantId: string) {
  const db = await requireDb();
  return db.select().from(outlets).where(eq(outlets.restaurantId, restaurantId));
}

export async function getPrimaryOutlet(restaurantId: string) {
  const db = await requireDb();
  const result = await db.select().from(outlets)
    .where(and(
      eq(outlets.restaurantId, restaurantId),
      eq(outlets.isActive, true),
      eq(outlets.isOpen, true),
    ))
    .orderBy(outlets.preparationMinutes) // prefer outlet with shortest prep time
    .limit(1);
  return result[0] ?? null;
}

// =============================================================================
// Storefront
// =============================================================================

export async function getStorefront(slug: string) {
  const db = await requireDb();

  const restaurant = (await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1))[0];
  if (!restaurant) return null;

  const [outlet] = await db.select().from(outlets)
    .where(and(eq(outlets.restaurantId, restaurant.id), eq(outlets.isActive, true), eq(outlets.isOpen, true)))
    .orderBy(outlets.preparationMinutes)
    .limit(1);

  const categories = await db.select().from(menuCategories)
    .where(eq(menuCategories.restaurantId, restaurant.id))
    .orderBy(menuCategories.sortOrder);

  const items = await db.select().from(menuItems)
    .where(eq(menuItems.restaurantId, restaurant.id))
    .orderBy(menuItems.sortOrder);

  const offers = await db.select().from(coupons)
    .where(eq(coupons.restaurantId, restaurant.id));

  const schedules = await db.select().from(restaurantSchedules)
    .where(eq(restaurantSchedules.restaurantId, restaurant.id));

  return {
    restaurant,
    outlet,
    categories,
    items,
    offers: offers.filter(o => o.isActive),
    schedules,
  };
}

// =============================================================================
// Menu / Catalogue
// =============================================================================

export async function createMenuItem(input: {
  restaurantId: string;
  categoryId: string;
  name: string;
  description?: string;
  pricePaise: number;
  offerPricePaise?: number;
  dietaryType: "veg" | "nonveg" | "egg";
  imageUrl?: string;
  isCustomizable?: boolean;
  sku?: string;
  tags?: string[];
}) {
  const db = await requireDb();
  const itemId = id();
  const item = {
    id: itemId,
    ...input,
    slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    shortDescription: input.description?.slice(0, 300) ?? null,
    tag: null,
    availability: "AVAILABLE" as const,
    availableNote: null,
    isOpen: true,
    isBestseller: false,
    isFeatured: false,
    isRecommended: false,
    spiceLevel: null,
    preparationMinutes: null,
    taxPercent: "0",
    packagingFeePaise: null,
    stock: null,
    maxQuantityPerOrder: 10,
    sortOrder: 100,
  };
  await db.insert(menuItems).values(item);
  return item;
}

export async function updateMenuItem(itemId: string, updates: Partial<{
  name: string;
  description: string;
  pricePaise: number;
  offerPricePaise: number | null;
  categoryId: string;
  dietaryType: "veg" | "nonveg" | "egg";
  imageUrl: string;
  isCustomizable: boolean;
  availability: "AVAILABLE" | "SOLD_OUT" | "SCHEDULED_UNAVAILABLE" | "OUT_OF_STOCK" | "DISABLED";
  availableNote: string;
  isOpen: boolean;
  isBestseller: boolean;
  isFeatured: boolean;
  isRecommended: boolean;
  sortOrder: number;
  stock: number | null;
}>) {
  const db = await requireDb();
  await db.update(menuItems).set(updates).where(eq(menuItems.id, itemId));
}

export async function updateMenuItemAvailability(
  itemId: string,
  availability: "AVAILABLE" | "SOLD_OUT" | "SCHEDULED_UNAVAILABLE" | "OUT_OF_STOCK" | "DISABLED",
  availableNote?: string
) {
  const db = await requireDb();
  await db.update(menuItems)
    .set({ availability, availableNote: availableNote || null })
    .where(eq(menuItems.id, itemId));
}

export async function getItemById(itemId: string) {
  const db = await requireDb();
  const result = await db.select().from(menuItems).where(eq(menuItems.id, itemId)).limit(1);
  return result[0] ?? null;
}

// =============================================================================
// Category Management
// =============================================================================

export async function createCategory(input: {
  restaurantId: string;
  name: string;
  description?: string;
  sortOrder?: number;
}) {
  const db = await requireDb();
  const catId = id();
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await db.insert(menuCategories).values({
    id: catId,
    restaurantId: input.restaurantId,
    name: input.name,
    slug,
    description: input.description ?? null,
    sortOrder: input.sortOrder ?? 0,
    isVisible: true,
    isOpen: true,
  });
  return catId;
}

export async function updateCategory(categoryId: string, updates: Partial<{
  name: string;
  sortOrder: number;
  isVisible: boolean;
  isOpen: boolean;
}>) {
  const db = await requireDb();
  await db.update(menuCategories).set(updates).where(eq(menuCategories.id, categoryId));
}

// =============================================================================
// Coupon Management
// =============================================================================

export async function upsertRestaurantCoupon(input: {
  restaurantId: string;
  code: string;
  description: string;
  discountType: "flat" | "percent";
  discountValue: number;
  minOrderPaise: number;
  maxDiscountPaise?: number;
  totalUsageLimit?: number;
  perCustomerLimit?: number;
  isNewCustomerOnly?: boolean;
  startsAt?: Date;
  endsAt?: Date;
}) {
  const db = await requireDb();
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("Coupon code is required.");
  if (typeof input.discountValue !== "number" || !Number.isFinite(input.discountValue) || input.discountValue < 0) {
    throw new Error("Invalid coupon discount value.");
  }
  if (input.discountType === "percent" && input.discountValue > 100) {
    throw new Error("Invalid coupon discount value.");
  }

  const existing = (await db.select().from(coupons)
    .where(and(eq(coupons.code, code), eq(coupons.restaurantId, input.restaurantId)))
    .limit(1))[0];

  if (existing) {
    await db.update(coupons).set({ ...input, code, isActive: true })
      .where(eq(coupons.id, existing.id));
    return existing.id;
  }

  const couponId = id();
  await db.insert(coupons).values({
    id: couponId,
    ...input,
    code,
    isActive: true,
  });
  return couponId;
}

// =============================================================================
// Order Management
// =============================================================================

export async function createOrderFromValidatedCart(args: {
  userId: number;
  slug: string;
  lines: Array<{
    menuItemId: string;
    quantity: number;
    modifierOptionIds?: string[];
    selectedVariantId?: string;
    specialInstructions?: string;
  }>;
  address: Record<string, unknown>;
  couponCode?: string;
  deliveryNotes?: string;
  cutleryPreference?: boolean;
  customerPhone?: string;
  customerEmail?: string;
  idempotencyKey?: string;
}) {
  const db = await requireDb();
  const storefront = await getStorefront(args.slug);
  if (!storefront?.outlet) throw new Error("This restaurant is not currently available for delivery.");
  // Scheduling gate via the canonical engine (rejects closed + tempClosure).
  {
    const { checkRestaurantAvailability } = await import("./domain/availability");
    const avail = checkRestaurantAvailability(storefront.restaurant, storefront.schedules, new Date());
    if (!avail.isAvailable) {
      throw new Error(avail.reason ?? "The restaurant is currently closed.");
    }
  }

  // --- Issue 4: Strict address validation (server-side) ---
  const phone = normalizePhone(args.customerPhone);
  if (!phone || phone.length < 10) {
    throw new Error("A valid delivery phone number is required.");
  }
  const addr = args.address ?? {};
  let flatHouse: string;
  let area: string;
  let city: string;
  try {
    flatHouse = assertAddrStr(addr.flatHouse, 180);
  } catch {
    throw new Error("Flat / House number is required.");
  }
  try {
    area = assertAddrStr(addr.area, 180);
  } catch {
    throw new Error("Area / Locality is required.");
  }
  try {
    city = assertAddrStr(addr.city, 120);
  } catch {
    throw new Error("City is required.");
  }
  if (!addr.postalCode || !/^\d{6}$/.test(String(addr.postalCode).trim())) {
    throw new Error("A valid 6-digit pincode is required.");
  }
  // Canonical snapshot strings are length-capped (matches varchar limits).
  const building = typeof addr.building === "string" && addr.building.trim()
    ? String(addr.building).trim().slice(0, 180) : null;
  const street = typeof addr.street === "string" && addr.street.trim()
    ? String(addr.street).trim().slice(0, 180) : null;
  const landmark = typeof addr.landmark === "string" && addr.landmark.trim()
    ? String(addr.landmark).trim().slice(0, 180) : null;
  const customerName = typeof addr.name === "string" && addr.name.trim()
    ? String(addr.name).trim().slice(0, 180) : null;
  if (typeof addr.name === "string" && addr.name.trim() && String(addr.name).trim().length > 180) {
    throw new CartValidationError("Customer name is too long.");
  }
  if (args.customerEmail != null && String(args.customerEmail).trim() !== "") {
    const email = String(args.customerEmail).trim();
    if (!isPlausibleEmail(email)) {
      throw new CartValidationError("Invalid customer email.");
    }
  }
  if (args.deliveryNotes != null && String(args.deliveryNotes).length > 1000) {
    throw new CartValidationError("Delivery notes are too long.");
  }
  if (!Array.isArray(args.lines) || args.lines.length === 0) {
    throw new CartValidationError("Cart must contain at least one item.");
  }
  if (args.lines.length > 50) {
    throw new CartValidationError("Cart contains too many items.");
  }
  for (const l of args.lines) {
    if (!l || typeof l.menuItemId !== "string" || !l.menuItemId.trim()) {
      throw new CartValidationError("Invalid cart item.");
    }
    if (typeof l.quantity !== "number" || !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 50) {
      throw new CartValidationError("Invalid cart quantity.");
    }
    if (l.specialInstructions != null && String(l.specialInstructions).length > 300) {
      throw new CartValidationError("Special instructions are too long.");
    }
    const seen = new Set<string>();
    for (const oid of (l.modifierOptionIds ?? [])) {
      if (typeof oid !== "string" || !oid) throw new CartValidationError("Invalid modifier option.");
      if (seen.has(oid)) throw new CartValidationError("Duplicate modifier option.");
      seen.add(oid);
    }
  }
  const cleanCoupon = args.couponCode?.trim().toUpperCase() || undefined;

  // --- Require precise delivery coordinates ---
  const lat = typeof addr.latitude === "string" ? parseFloat(addr.latitude) : addr.latitude;
  const lng = typeof addr.longitude === "string" ? parseFloat(addr.longitude) : addr.longitude;
  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error("Precise delivery coordinates (latitude/longitude) are required. Please confirm your delivery location on the map.");
  }
  if (Number(lat) < -90 || Number(lat) > 90) {
    throw new Error("Invalid delivery latitude. Please confirm your location on the map.");
  }
  if (Number(lng) < -180 || Number(lng) > 180) {
    throw new Error("Invalid delivery longitude. Please confirm your location on the map.");
  }

  // --- Server-authoritative outlet selection (nearest serviceable outlet) ---
  const { selectBestOutlet } = await import("./domain/locationService");
  const allOutlets = await db.select().from(outlets).where(
    and(eq(outlets.restaurantId, storefront.restaurant.id), eq(outlets.isActive, true), eq(outlets.isOpen, true))
  );
  const restaurantRadius = (() => {
    const r = parseFloat(String(storefront.restaurant.deliveryRadiusKm ?? "5"));
    return Number.isFinite(r) && r > 0 && r <= 100 ? r : 5;
  })();
  const outletSelection = selectBestOutlet(allOutlets, Number(lat), Number(lng), restaurantRadius);
  if (!outletSelection) {
    throw new Error("No outlet can deliver to your location. Please choose a different delivery address.");
  }
  const selectedOutlet = outletSelection.outlet;
  const deliveryDistanceKm = outletSelection.distanceKm;

  // --- Issue 5: Resolve modifier prices from DB, never trust client ---
  // Always load groups for ORDERED items (even with no modifiers) to enforce
  // required/min/max/selection rules. Scoped to ordered ids (not the whole menu).
  const orderedIdsForGroups = args.lines.map(l => l.menuItemId).filter((v, i, a) => a.indexOf(v) === i);
  let addonOptionMap = new Map<string, { id: string; name: string; pricePaise: number; addonGroupId: string; isAvailable: boolean }>();
  let groups: Array<{ id: string; menuItemId: string; name: string; selectionType: string; isRequired: boolean; minSelections: number; maxSelections: number }> = [];
  {
    groups = orderedIdsForGroups.length > 0
      ? await db.select({
          id: addonGroups.id,
          menuItemId: addonGroups.menuItemId,
          name: addonGroups.name,
          selectionType: addonGroups.selectionType,
          isRequired: addonGroups.isRequired,
          minSelections: addonGroups.minSelections,
          maxSelections: addonGroups.maxSelections,
        }).from(addonGroups).where(inArray(addonGroups.menuItemId, orderedIdsForGroups)) as typeof groups
      : [];
    const groupIds = groups.map(g => g.id);
    if (groupIds.length > 0) {
      const options = await db.select().from(addonOptions).where(inArray(addonOptions.addonGroupId, groupIds));
      for (const opt of options) {
        addonOptionMap.set(opt.id, { id: opt.id, name: opt.name, pricePaise: opt.pricePaise, addonGroupId: opt.addonGroupId, isAvailable: opt.isAvailable });
      }
    }
  }
  const groupById = new Map(groups.map(g => [g.id, g]));

  // Resolve variant prices from DB
  const variantIds = args.lines.flatMap(l => l.selectedVariantId ? [l.selectedVariantId] : []);
  let variantMap = new Map<string, { id: string; name: string; pricePaise: number; isAvailable: boolean; menuItemId: string }>();
  if (variantIds.length > 0) {
    const variants = await db.select().from(productVariants).where(inArray(productVariants.id, variantIds));
    for (const v of variants) {
      variantMap.set(v.id, { id: v.id, name: v.name, pricePaise: v.pricePaise, isAvailable: v.isAvailable, menuItemId: v.menuItemId });
    }
  }

  // Full-hierarchy availability gate: restaurant + outlet schedule + category
  // (flag + schedule) + item (flag + schedule + stock). Uses the canonical engine.
  {
    const { checkItemAvailability, checkCategoryAvailability } = await import("./domain/availability");
    const { isScheduledOpen } = await import("./domain/scheduling");
    const { productSchedules, categorySchedules, outletSchedules } = await import("../drizzle/schema");
    const orderedIds = args.lines.map(l => l.menuItemId).filter((v, i, a) => a.indexOf(v) === i);
    const itemById = new Map(storefront.items.map(i => [i.id, i]));
    const categoryIds = orderedIds.map(oid => itemById.get(oid)?.categoryId).filter((v): v is string => Boolean(v)).filter((v, i, a) => a.indexOf(v) === i);
    const [prodScheds, catScheds, outletScheds] = await Promise.all([
      orderedIds.length ? db.select().from(productSchedules).where(inArray(productSchedules.menuItemId, orderedIds)) : [],
      categoryIds.length ? db.select().from(categorySchedules).where(inArray(categorySchedules.categoryId, categoryIds)) : [],
      db.select().from(outletSchedules).where(inArray(outletSchedules.outletId, allOutlets.map(o => o.id))),
    ]);
    const prodSchedByItem = new Map<string, typeof prodScheds>();
    for (const s of prodScheds) {
      const arr = prodSchedByItem.get((s as { menuItemId: string }).menuItemId) ?? [];
      arr.push(s);
      prodSchedByItem.set((s as { menuItemId: string }).menuItemId, arr);
    }
    const catSchedByCat = new Map<string, typeof catScheds>();
    for (const s of catScheds) {
      const cid = (s as { categoryId: string }).categoryId;
      const arr = catSchedByCat.get(cid) ?? [];
      arr.push(s);
      catSchedByCat.set(cid, arr);
    }
    const outletSchedByOutlet = new Map<string, typeof outletScheds>();
    for (const s of outletScheds) {
      const oid = (s as { outletId: string }).outletId;
      const arr = outletSchedByOutlet.get(oid) ?? [];
      arr.push(s);
      outletSchedByOutlet.set(oid, arr);
    }
    const now = new Date();
    // Selected outlet must also satisfy its schedule window when configured.
    const selScheds = outletSchedByOutlet.get(selectedOutlet.id) ?? [];
    if (selScheds.length > 0 && !isScheduledOpen(selScheds as never, now)) {
      throw new CartValidationError("The selected outlet is currently closed.");
    }
    const categoryById = new Map(storefront.categories.map(c => [c.id, c]));
    for (const line of args.lines) {
      const item = itemById.get(line.menuItemId);
      if (!item) throw new CartValidationError(`Item "${line.menuItemId}" is not in the menu.`);
      if (item.restaurantId !== storefront.restaurant.id) {
        throw new CartValidationError(`Item "${line.menuItemId}" is not in the menu.`);
      }
      const cat = categoryById.get((item as { categoryId: string }).categoryId);
      if (cat) {
        const catCheck = checkCategoryAvailability(
          { isVisible: (cat as { isVisible: boolean }).isVisible, isOpen: (cat as { isOpen: boolean }).isOpen },
          catSchedByCat.get((cat as { id: string }).id) ?? [],
          now
        );
        if (!catCheck.isAvailable) {
          throw new CartValidationError(`"${item.name}" is currently unavailable.`);
        }
      }
      const scheds = prodSchedByItem.get(line.menuItemId) ?? [];
      const check = checkItemAvailability(item as never, scheds as never, now);
      if (!check.isAvailable) {
        throw new CartValidationError(check.reason ?? `"${item.name}" is currently unavailable.`);
      }
    }
  }

  // Build resolved lines with server-side prices + group-rule enforcement.
  const resolvedLines = args.lines.map(line => {
    const item = storefront.items.find(mi => mi.id === line.menuItemId);
    if (!item) throw new CartValidationError(`Item "${line.menuItemId}" is not in the menu.`);

    const resolvedModifiers: Array<{ optionId: string; name: string; pricePaise: number; groupId: string; groupName: string }> = [];
    const countByGroup = new Map<string, number>();
    for (const optId of (line.modifierOptionIds ?? [])) {
      const dbOption = addonOptionMap.get(optId);
      if (!dbOption) throw new CartValidationError(`Modifier option "${optId}" does not exist.`);
      if (!dbOption.isAvailable) throw new CartValidationError(`Modifier "${dbOption.name}" is currently unavailable.`);
      if (typeof dbOption.pricePaise !== "number" || !Number.isInteger(dbOption.pricePaise) || dbOption.pricePaise < 0) {
        throw new CartValidationError(`Invalid modifier price for "${item.name}".`);
      }
      const group = groupById.get(dbOption.addonGroupId);
      if (!group || group.menuItemId !== line.menuItemId) {
        throw new CartValidationError(`Modifier "${dbOption.name}" is not available for "${item.name}".`);
      }
      countByGroup.set(group.id, (countByGroup.get(group.id) ?? 0) + 1);
      resolvedModifiers.push({ optionId: optId, name: dbOption.name, pricePaise: dbOption.pricePaise, groupId: group.id, groupName: group.name });
    }
    // Enforce required/min/max/selectionType per group for this item.
    for (const g of groups.filter(gg => gg.menuItemId === line.menuItemId)) {
      const count = countByGroup.get(g.id) ?? 0;
      const min = Math.max(g.isRequired ? 1 : 0, g.minSelections ?? 0);
      const max = g.maxSelections ?? (g.selectionType === "single" ? 1 : 99);
      if (g.selectionType === "single" && count > 1) {
        throw new CartValidationError(`Only one option allowed for "${g.name}".`);
      }
      if (count < min) {
        throw new CartValidationError(`"${g.name}" is required for "${item.name}".`);
      }
      if (count > max) {
        throw new CartValidationError(`Too many options for "${g.name}".`);
      }
    }

    let variantPricePaise: number | undefined;
    let variantName: string | undefined;
    if (line.selectedVariantId) {
      const dbVariant = variantMap.get(line.selectedVariantId);
      if (!dbVariant) throw new CartValidationError(`Variant "${line.selectedVariantId}" does not exist.`);
      if (!dbVariant.isAvailable) throw new CartValidationError(`Variant "${dbVariant.name}" is currently unavailable.`);
      if (dbVariant.menuItemId !== line.menuItemId) throw new CartValidationError(`Variant "${dbVariant.name}" does not belong to "${item.name}".`);
      if (typeof dbVariant.pricePaise !== "number" || !Number.isInteger(dbVariant.pricePaise) || dbVariant.pricePaise < 0) {
        throw new CartValidationError(`Invalid variant price for "${item.name}".`);
      }
      variantPricePaise = dbVariant.pricePaise;
      variantName = dbVariant.name;
    }

    return {
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      modifiers: resolvedModifiers,
      variantId: line.selectedVariantId,
      variantName,
      variantPricePaise,
      specialInstructions: line.specialInstructions ?? null,
    };
  });
  // Prevent splitting one item across lines to bypass per-order max.
  {
    const totals = new Map<string, { qty: number; name: string; max: number }>();
    for (const rl of resolvedLines) {
      const item = storefront.items.find(mi => mi.id === rl.menuItemId)!;
      const max = (item as { maxQuantityPerOrder?: number | null }).maxQuantityPerOrder ?? 20;
      const cur = totals.get(rl.menuItemId) ?? { qty: 0, name: item.name, max };
      cur.qty += rl.quantity;
      totals.set(rl.menuItemId, cur);
    }
    let qtyOverflow = false;
    let qtyOverflowName = "";
    totals.forEach(({ qty, name, max }) => {
      if (qty > max) { qtyOverflow = true; qtyOverflowName = name; }
    });
    if (qtyOverflow) throw new CartValidationError(`Invalid quantity for "${qtyOverflowName}".`);
  }

  // --- Issue 3: Guest checkout — create guest user if needed ---
  let effectiveUserId = args.userId;
  if (!effectiveUserId || effectiveUserId === 0) {
    effectiveUserId = await getOrCreateGuestUser();
  }

  // Ensure customer profile exists (race-safe: concurrent orders for a fresh
  // verified user could both miss; unique(userId) guards, second re-reads).
  // NOTE: mobileNumber is NOT set here — guest phone is unverified identity.
  // Only OTP verification populates mobileNumber as verified identity.
  let profile = (await db.select().from(customerProfiles)
    .where(eq(customerProfiles.userId, effectiveUserId)).limit(1))[0];
  let customerId = profile?.id ?? id();
  if (!profile) {
    try {
      await db.insert(customerProfiles).values({
        id: customerId,
        userId: effectiveUserId,
        // mobileNumber left null — only set after OTP verification
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      profile = (await db.select().from(customerProfiles)
        .where(eq(customerProfiles.userId, effectiveUserId)).limit(1))[0];
      if (!profile) throw err;
      customerId = profile.id;
    }
    profile = profile ?? (await db.select().from(customerProfiles)
      .where(eq(customerProfiles.userId, effectiveUserId)).limit(1))[0];
  }

  // Calculate base pricing server-side using resolved (DB-verified) prices.
  const baseQuote = calculateAuthoritativeQuote({
    lines: resolvedLines,
    catalog: storefront.items,
    packagingFeePaise: storefront.restaurant.packagingFeePaise,
    deliveryFeePaise: storefront.restaurant.deliveryFeePaise,
    taxPercent: parseGstRate(storefront.restaurant.gstPercentage, 5),
  });

  // P0: unknown coupon codes must throw (never silently ignore).
  let appliedCoupon: typeof storefront.offers[0] | undefined;
  if (cleanCoupon) {
    appliedCoupon = storefront.offers.find(o => o.code === cleanCoupon);
    if (!appliedCoupon) {
      // Re-check DB in case storefront offers are stale.
      const dbCoupon = (await db.select().from(coupons)
        .where(and(eq(coupons.restaurantId, storefront.restaurant.id), eq(coupons.code, cleanCoupon)))
        .limit(1))[0];
      if (!dbCoupon) throw new CartValidationError(`Coupon "${cleanCoupon}" is not valid for this restaurant.`);
      appliedCoupon = dbCoupon as typeof storefront.offers[0];
    }
  }

  // Enforce minimum order on base total (coupon only reduces further).
  if (baseQuote.itemTotalPaise < storefront.restaurant.minOrderPaise) {
    throw new Error(`Minimum order is ₹${Math.ceil(storefront.restaurant.minOrderPaise / 100)}.`);
  }

  // Idempotency: return existing order when the key was already used.
  // Scoped to this restaurant — a key from another tenant never leaks its order.
  // (Legacy orderNumber fallback removed: orderNumbers are guessable and must
  // never disclose trackingTokens via an idempotency lookup.)
  const idempotencyKey = args.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    if (idempotencyKey.length < 8 || idempotencyKey.length > 64) {
      throw new CartValidationError("Invalid idempotency key.");
    }
    const existingByKey = (await db.select().from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey)).limit(1))[0];
    if (existingByKey) {
      if (existingByKey.restaurantId !== storefront.restaurant.id) {
        throw new CartValidationError("Duplicate order request. Please retry with a new idempotency key.");
      }
      const existingQuote = {
        itemTotalPaise: existingByKey.itemTotalPaise,
        discountPaise: existingByKey.discountPaise,
        couponDiscountPaise: existingByKey.couponDiscountPaise,
        packagingFeePaise: existingByKey.packagingFeePaise,
        deliveryFeePaise: existingByKey.deliveryFeePaise,
        taxPaise: existingByKey.taxPaise,
        totalPaise: existingByKey.totalPaise,
      };
      return {
        id: existingByKey.id,
        orderNumber: existingByKey.orderNumber,
        trackingToken: existingByKey.trackingToken,
        restaurantId: existingByKey.restaurantId,
        ...existingQuote,
        estimatedMinutes: existingByKey.estimatedMinutes ?? selectedOutlet.preparationMinutes + 15,
      };
    }
  }

  // Canonical address snapshot keys (never spread raw client input).
  const addressSnapshot = {
    flatHouse,
    building,
    street,
    landmark,
    area,
    city,
    postalCode: String(addr.postalCode ?? "").trim(),
    latitude: Number(lat),
    longitude: Number(lng),
    deliveryDistanceKm,
  };

  // --- Issue 1: Generate secure tracking token + unguessable order number ---
  const orderId = id();
  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${randomInt(100000, 999999)}`;
  const trackingToken = generateTrackingToken();
  let finalQuote = baseQuote;

  // --- Issue 18: Atomic transaction — coupon counts + usage INSIDE tx with SELECT FOR UPDATE. ---
  try {
    await db.transaction(async (tx) => {
      // Re-validate locked catalog rows inside the tx (TOCTOU: item could be
      // disabled after the pre-check). Row locks serialize concurrent checkouts.
      {
        const lockIds = resolvedLines.map(l => l.menuItemId).filter((v, i, a) => a.indexOf(v) === i);
        const lockedRows = lockIds.length
          ? await tx.execute(sql`SELECT id, availability, is_open, stock FROM menu_items WHERE id IN (${sql.join(lockIds.map(v => sql`${v}`), sql`, `)}) FOR UPDATE`)
          : null;
        void lockedRows;
        const fresh = lockIds.length
          ? await tx.select({ id: menuItems.id, availability: menuItems.availability, isOpen: menuItems.isOpen }).from(menuItems).where(inArray(menuItems.id, lockIds))
          : [];
        const freshById = new Map(fresh.map(r => [r.id, r]));
        for (const rl of resolvedLines) {
          const fr = freshById.get(rl.menuItemId);
          if (!fr || (fr as { isOpen: boolean }).isOpen !== true || (fr as { availability: string }).availability !== "AVAILABLE") {
            const item = storefront.items.find(mi => mi.id === rl.menuItemId)!;
            throw new CartValidationError(`"${item.name}" is currently unavailable.`);
          }
        }
      }
      // Lock coupon row when a coupon is applied.
      let couponDiscountPaise = 0;
      if (appliedCoupon) {
        await tx.execute(sql`SELECT id FROM coupons WHERE id = ${appliedCoupon.id} FOR UPDATE`);
        // Cancelled/rejected orders release their coupon burn (usage rows for live
        // orders only). PENDING_PAYMENT rows still count to prevent oversell.
        // NOTE: burn-on-create blocks coupon retry with a fresh key after a failed
        // payment — full fix defers burn to confirmPayment (razorpay seam).
        const totalUsageCount = Number((await tx.execute(sql`
          SELECT count(*)::int AS count FROM coupon_usage cu
          JOIN orders o ON o.id = cu.order_id
          WHERE cu.coupon_id = ${appliedCoupon.id} AND o.status NOT IN ('CANCELLED', 'REJECTED')
        `) as unknown as { rows: Array<{ count: number }> }).rows?.[0]?.count ?? 0);
        // Guest limits by verified phone: guests share no customerId, so count by phone.
        const isGuest = !profile?.mobileNumber;
        let customerUsageCount = 0;
        let customerOrderCount = 0;
        if (isGuest) {
          customerOrderCount = Number((await tx.select({ count: sql<number>`count(*)::int` })
            .from(orders).where(and(eq(orders.restaurantId, storefront.restaurant.id), eq(orders.customerPhone, phone))))[0]?.count ?? 0);
          const usageByPhone = await tx.execute(sql`
            SELECT count(*)::int AS count FROM coupon_usage cu
            JOIN orders o ON o.id = cu.order_id
            WHERE cu.coupon_id = ${appliedCoupon.id} AND o.customer_phone = ${phone}
              AND o.status NOT IN ('CANCELLED', 'REJECTED')
          `);
          customerUsageCount = Number((usageByPhone as unknown as { rows: Array<{ count: number }> }).rows?.[0]?.count ?? 0);
        } else {
          customerUsageCount = Number((await tx.execute(sql`
            SELECT count(*)::int AS count FROM coupon_usage cu
            JOIN orders o ON o.id = cu.order_id
            WHERE cu.coupon_id = ${appliedCoupon.id} AND cu.customer_id = ${customerId}
              AND o.status NOT IN ('CANCELLED', 'REJECTED')
          `) as unknown as { rows: Array<{ count: number }> }).rows?.[0]?.count ?? 0);
          customerOrderCount = Number((await tx.select({ count: sql<number>`count(*)::int` })
            .from(orders).where(eq(orders.customerId, customerId)))[0]?.count ?? 0);
        }

        const couponResult = validateCoupon({
          coupon: {
            code: appliedCoupon.code,
            discountType: appliedCoupon.discountType,
            discountValue: appliedCoupon.discountValue,
            minOrderPaise: appliedCoupon.minOrderPaise,
            maxDiscountPaise: appliedCoupon.maxDiscountPaise,
            isActive: appliedCoupon.isActive,
            startsAt: appliedCoupon.startsAt,
            endsAt: appliedCoupon.endsAt,
            isNewCustomerOnly: appliedCoupon.isNewCustomerOnly,
            totalUsageLimit: appliedCoupon.totalUsageLimit,
            perCustomerLimit: appliedCoupon.perCustomerLimit,
          },
          cartTotalPaise: baseQuote.itemTotalPaise,
          now: new Date(),
          customerOrderCount,
          customerCouponUsageCount: customerUsageCount,
          totalCouponUsageCount: totalUsageCount,
        });
        if (!couponResult.valid) {
          throw new CartValidationError(couponResult.error ?? "Invalid coupon.");
        }
        couponDiscountPaise = couponResult.discountPaise;
      }

      finalQuote = calculateAuthoritativeQuote({
        lines: resolvedLines,
        catalog: storefront.items,
        packagingFeePaise: storefront.restaurant.packagingFeePaise,
        deliveryFeePaise: storefront.restaurant.deliveryFeePaise,
        couponDiscountPaise,
        taxPercent: parseGstRate(storefront.restaurant.gstPercentage, 5),
      });

      if (finalQuote.itemTotalPaise < storefront.restaurant.minOrderPaise) {
        throw new Error(`Minimum order is ₹${Math.ceil(storefront.restaurant.minOrderPaise / 100)}.`);
      }

      const cleanEmail = args.customerEmail != null && String(args.customerEmail).trim() !== ""
        ? String(args.customerEmail).trim().slice(0, 320)
        : null;
      await tx.insert(orders).values({
        id: orderId,
        orderNumber,
        trackingToken,
        idempotencyKey,
        restaurantId: storefront.restaurant.id,
        outletId: selectedOutlet.id,
        customerId,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        addressSnapshot,
        customerName,
        customerPhone: phone,
        customerEmail: cleanEmail,
        ...finalQuote,
        couponCode: cleanCoupon ?? null,
        couponDiscountPaise: finalQuote.couponDiscountPaise,
        deliveryNotes: args.deliveryNotes ? String(args.deliveryNotes).slice(0, 1000) : null,
        specialInstructions: resolvedLines.map(l => l.specialInstructions).filter(Boolean).join("; ").slice(0, 2000) || null,
        cutleryPreference: args.cutleryPreference ?? false,
        estimatedMinutes: selectedOutlet.preparationMinutes + 15,
      });

      // Atomic stock decrement: UPDATE ... WHERE stock >= qty (rowCount check).
      for (const line of resolvedLines) {
        const item = storefront.items.find(mi => mi.id === line.menuItemId)!;
        if (item.stock != null) {
          const dec = await tx.update(menuItems)
            .set({ stock: sql`${menuItems.stock} - ${line.quantity}` })
            .where(and(eq(menuItems.id, item.id), sql`${menuItems.stock} >= ${line.quantity}`))
            .returning({ id: menuItems.id });
          if (dec.length === 0) {
            throw new CartValidationError(`Insufficient stock for "${item.name}".`);
          }
        }
      }

      // Create order items (server-resolved prices; variant upcharge folded into
      // unitPrice so invoice subtotal matches the authoritative quote).
      await tx.insert(orderItems).values(
        resolvedLines.map(line => {
          const item = storefront.items.find(mi => mi.id === line.menuItemId)!;
          const base = (item.offerPricePaise != null && item.offerPricePaise > 0 && item.offerPricePaise < item.pricePaise)
            ? item.offerPricePaise
            : item.pricePaise;
          const variantUp = (line as { variantPricePaise?: number }).variantPricePaise ?? 0;
          const unitPrice = base + variantUp;
          return {
            id: id(),
            orderId,
            menuItemId: item.id,
            itemNameSnapshot: item.name,
            unitPricePaise: unitPrice,
            quantity: line.quantity,
            dietaryType: item.dietaryType,
            selectedVariantId: (line as { variantId?: string }).variantId ?? null,
            variantNameSnapshot: (line as { variantName?: string }).variantName ?? null,
            selectedModifiers: line.modifiers.map(m => ({
              groupId: (m as { groupId?: string }).groupId ?? "",
              groupName: (m as { groupName?: string }).groupName ?? "",
              optionId: m.optionId,
              optionName: m.name,
              pricePaise: m.pricePaise,
            })),
            specialInstructions: (line as { specialInstructions?: string | null }).specialInstructions
              ? String((line as { specialInstructions?: string | null }).specialInstructions).slice(0, 300)
              : null,
          };
        })
      );

      await tx.insert(orderStatusHistory).values({
        id: id(),
        orderId,
        status: "PENDING_PAYMENT",
        note: "Order created; awaiting payment.",
      });

      // Zero-total (fully discounted + free fees) orders have no chargeable payment;
      // the payments CHECK requires amount > 0, so record a Re 1 placeholder? No —
      // fail closed with a clear message and let the caller (seam) handle free orders
      // via a dedicated free-checkout path. Prevents CHECK-violation 500s.
      if (!Number.isSafeInteger(finalQuote.totalPaise) || finalQuote.totalPaise < 0) {
        throw new CartValidationError("Invalid order total.");
      }
      if (finalQuote.totalPaise === 0) {
        throw new CartValidationError("Order total is zero. Free orders are not supported for online payment.");
      }
      await tx.insert(payments).values({
        id: id(),
        orderId,
        amountPaise: finalQuote.totalPaise,
      });

      // Record coupon usage (counts were locked above; unique(orderId) guards double-apply).
      if (cleanCoupon && finalQuote.couponDiscountPaise > 0 && appliedCoupon) {
        await tx.insert(couponUsage).values({
          id: id(),
          couponId: appliedCoupon.id,
          orderId,
          customerId,
          discountPaise: finalQuote.couponDiscountPaise,
        });
      }
    });
  } catch (err) {
    // Never leak PG internals (constraint names, values) to callers.
    if (err instanceof CartValidationError) throw err;
    // Unique idempotency key race: another request won — return the winner.
    if (idempotencyKey && isUniqueViolation(err)) {
      const winner = (await db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey)).limit(1))[0];
      if (winner) {
        if (winner.restaurantId !== storefront.restaurant.id) {
          throw new CartValidationError("Duplicate order request. Please retry with a new idempotency key.");
        }
        return {
          id: winner.id,
          orderNumber: winner.orderNumber,
          trackingToken: winner.trackingToken,
          restaurantId: winner.restaurantId,
          itemTotalPaise: winner.itemTotalPaise,
          discountPaise: winner.discountPaise,
          couponDiscountPaise: winner.couponDiscountPaise,
          packagingFeePaise: winner.packagingFeePaise,
          deliveryFeePaise: winner.deliveryFeePaise,
          taxPaise: winner.taxPaise,
          totalPaise: winner.totalPaise,
          estimatedMinutes: winner.estimatedMinutes ?? selectedOutlet.preparationMinutes + 15,
        };
      }
      throw new CartValidationError("Order could not be created. Please retry.");
    }
    if (isUniqueViolation(err)) {
      throw new CartValidationError("Order could not be created. Please retry.");
    }
    throw err;
  }

  return {
    id: orderId,
    orderNumber,
    trackingToken,
    restaurantId: storefront.restaurant.id,
    ...finalQuote,
    estimatedMinutes: selectedOutlet.preparationMinutes + 15,
  };
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  actorId?: number,
  note?: string
) {
  const db = await requireDb();
  const { validateTransition } = await import("./domain/orderStateMachine");

  // Get current status
  const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order) throw new Error("Order not found.");

  // Idempotent retry: same-state re-delivery (webhook/KDS double-click) is a no-op.
  if ((order.status as string) === (status as string)) {
    return { alreadyInState: true as const };
  }

  // Payment minting guard: PENDING_PAYMENT -> PAYMENT_CONFIRMED must go through
  // confirmPayment() (razorpay seam) with signature + amount binding. Admin/KDS
  // paths must never mint PAID without provider verification.
  if (order.status === "PENDING_PAYMENT" && status === "PAYMENT_CONFIRMED") {
    throw new Error("Payment confirmation must go through the payment verification flow.");
  }

  // Enforce valid state transition
  const transition = validateTransition(order.status as OrderStatus, status);

  const updateData: Record<string, unknown> = { status };

  // Apply payment status from state machine when applicable
  if (transition.paymentStatus) {
    updateData.paymentStatus = transition.paymentStatus;
  }

  // Set timestamp fields
  if (status === "RESTAURANT_ACCEPTED") updateData.acceptedAt = new Date();
  if (status === "PREPARING") updateData.preparingAt = new Date();
  if (status === "READY_FOR_PICKUP") updateData.readyAt = new Date();
  if (status === "DELIVERED") updateData.deliveredAt = new Date();
  if (status === "CANCELLED" || status === "REJECTED") {
    updateData.cancelledAt = new Date();
    updateData.cancelReason = typeof note === "string" ? note.slice(0, 500) : note;
    updateData.paymentStatus = "CANCELLED";
  }

  await db.transaction(async (tx) => {
    // Row lock + lost-update guard: fail if status changed since the pre-read.
    await tx.execute(sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);
    const fresh = (await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!fresh) throw new Error("Order not found.");
    if ((fresh.status as string) !== (order.status as string)) {
      throw new Error("Order was modified concurrently. Please retry.");
    }
    const bumped = await tx.update(orders).set(updateData).where(eq(orders.id, orderId)).returning({ id: orders.id });
    if (bumped.length === 0) {
      throw new Error("Order was modified concurrently. Please retry.");
    }

    await tx.insert(orderStatusHistory).values({
      id: id(),
      orderId,
      status,
      note: (note ?? `Status changed to ${status}`).slice(0, 500),
      actorId: actorId ?? null,
    });

    // Stock restore on cancel/reject for DIRECT (storefront) orders, which
    // decrement at creation. Manual aggregator orders never decrement, so they
    // must NOT restore (would mint stock). Single restore: machine prevents
    // double-cancel (CANCELLED only -> REFUND_PENDING).
    if ((status === "CANCELLED" || status === "REJECTED") && (order as { orderSource?: string }).orderSource === "DIRECT") {
      const lines = await tx.select({ menuItemId: orderItems.menuItemId, quantity: orderItems.quantity })
        .from(orderItems).where(eq(orderItems.orderId, orderId));
      for (const ln of lines) {
        if (!ln.menuItemId || typeof ln.quantity !== "number" || ln.quantity <= 0) continue;
        await tx.update(menuItems)
          .set({ stock: sql`${menuItems.stock} + ${ln.quantity}` })
          .where(eq(menuItems.id, ln.menuItemId));
      }
    }

    // Update customer stats
    if (status === "DELIVERED" && order.customerId) {
      await tx.execute(sql`
        UPDATE customer_profiles
        SET total_orders = total_orders + 1,
            total_spent_paise = total_spent_paise + ${order.totalPaise}
        WHERE id = ${order.customerId}
      `);
    }

    // Audit trail for every status mutation (KDS callers don't log separately).
    await tx.insert(auditLogs).values({
      id: id(),
      actorId: actorId ?? null,
      action: `Order status changed to ${status}`,
      targetType: "order",
      targetId: orderId,
      afterData: { status, note: typeof note === "string" ? note.slice(0, 500) : null },
      restaurantId: (order as { restaurantId?: string }).restaurantId ?? null,
    });
  });

  // Fire notification async — never blocks order update
  const STATUS_TO_NOTIFICATION: Record<string, string> = {
    RESTAURANT_ACCEPTED: "order_confirmed",
    PREPARING: "preparing",
    OUT_FOR_DELIVERY: "out_for_delivery",
    DELIVERED: "delivered",
    CANCELLED: "cancelled",
    REJECTED: "cancelled",
  };
  const notificationType = STATUS_TO_NOTIFICATION[status];
  if (notificationType && order.customerPhone) {
    fireAndForgetNotification(notificationType, order).catch((err) => {
      console.error(`[notification] Failed to send ${notificationType} for order ${orderId}:`, err);
    });
  }
}

async function fireAndForgetNotification(
  type: string,
  order: typeof orders.$inferSelect
) {
  if (!order.customerPhone) return;

  const { buildNotificationMessage } = await import("./integrations/whatsapp");

  const db = await requireDb();
  const restaurant = (await db.select({ slug: restaurants.slug, name: restaurants.name })
    .from(restaurants)
    .where(eq(restaurants.id, order.restaurantId))
    .limit(1))[0];

  const baseUrl = process.env.PUBLIC_URL || "";
  const trackUrl = restaurant
    ? `${baseUrl}/${restaurant.slug}/track/${order.orderNumber}?token=${order.trackingToken}`
    : `${baseUrl}/track/${order.orderNumber}?token=${order.trackingToken}`;

  const message = buildNotificationMessage(type, {
    orderNumber: order.orderNumber,
    trackUrl,
    rateUrl: trackUrl,
    restaurantName: restaurant?.name || "Restaurant",
  });

  if (!message) return;

  // Check if notifications are enabled for this restaurant
  const settingsRow = (await db.select().from(settings)
    .where(and(eq(settings.key, `notifications_${type}`), eq(settings.restaurantId, order.restaurantId)))
    .limit(1))[0];
  if (settingsRow && settingsRow.value === "false") return;

  // Try WhatsApp first, fall back to SMS
  const waToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const smsKey = process.env.MSG91_AUTH_KEY;

  if (waToken && waPhoneId) {
    const { WhatsAppCloudAdapter } = await import("./integrations/whatsapp");
    const provider = new WhatsAppCloudAdapter(waToken, waPhoneId);
    const result = await provider.sendText(order.customerPhone, message);
    if (!result.success && smsKey) {
      const { SmsFallbackAdapter } = await import("./integrations/whatsapp");
      await new SmsFallbackAdapter(smsKey).sendText(order.customerPhone, message);
    }
  } else if (smsKey) {
    const { SmsFallbackAdapter } = await import("./integrations/whatsapp");
    await new SmsFallbackAdapter(smsKey).sendText(order.customerPhone, message);
  }
}

export async function getOrders(
  restaurantId: string,
  filters?: {
    status?: OrderStatus;
    startDate?: Date;
    endDate?: Date;
    customerId?: string;
  },
  limit = 50,
  offset = 0
) {
  const db = await requireDb();
  const conditions = [eq(orders.restaurantId, restaurantId)];

  if (filters?.status) conditions.push(eq(orders.status, filters.status));
  if (filters?.customerId) conditions.push(eq(orders.customerId, filters.customerId));
  if (filters?.startDate && filters?.endDate) {
    conditions.push(between(orders.createdAt, filters.startDate, filters.endDate));
  }

  return db.select().from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getOrderWithItems(orderId: string) {
  const db = await requireDb();
  const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const history = await db.select().from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(orderStatusHistory.createdAt);

  const payment = (await db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1))[0];

  const delivery = (await db.select().from(deliveries).where(eq(deliveries.orderId, orderId)).limit(1))[0];

  return { ...order, items, history, payment, delivery };
}

/**
 * Issue 1: Secure order tracking — requires tracking token.
 * Returns a restricted subset of order data safe for public consumption.
 * Never exposes: payment provider IDs, full customer PII, admin notes.
 */
export async function getOrderForTracking(orderNumber: string, trackingToken: string) {
  const db = await requireDb();
  // Fail closed on malformed lookup keys (router enforces min lengths; DB hardens too).
  if (typeof orderNumber !== "string" || typeof trackingToken !== "string") return null;
  if (orderNumber.trim().length < 5 || trackingToken.trim().length < 16) return null;
  const order = (await db.select().from(orders).where(
    and(eq(orders.orderNumber, orderNumber), eq(orders.trackingToken, trackingToken))
  ).limit(1))[0];
  if (!order) return null;

  const items = await db.select({
    id: orderItems.id,
    itemNameSnapshot: orderItems.itemNameSnapshot,
    unitPricePaise: orderItems.unitPricePaise,
    quantity: orderItems.quantity,
    dietaryType: orderItems.dietaryType,
    selectedModifiers: orderItems.selectedModifiers,
  }).from(orderItems).where(eq(orderItems.orderId, order.id));

  const history = await db.select({
    status: orderStatusHistory.status,
    note: orderStatusHistory.note,
    createdAt: orderStatusHistory.createdAt,
  }).from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, order.id))
    .orderBy(orderStatusHistory.createdAt);

  const delivery = (await db.select({
    status: deliveries.status,
    estimatedDelivery: deliveries.estimatedDelivery,
    trackingUrl: deliveries.trackingUrl,
    riderName: deliveries.riderName,
  }).from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1))[0];

  // Restricted response — no PII, no payment internals
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    itemTotalPaise: order.itemTotalPaise,
    couponDiscountPaise: order.couponDiscountPaise,
    deliveryFeePaise: order.deliveryFeePaise,
    taxPaise: order.taxPaise,
    totalPaise: order.totalPaise,
    estimatedMinutes: order.estimatedMinutes,
    createdAt: order.createdAt,
    items,
    history,
    delivery: delivery ?? null,
    // Masked address — city and area only, no full address
    deliveryCity: (order.addressSnapshot as Record<string, string>)?.city ?? null,
    deliveryArea: (order.addressSnapshot as Record<string, string>)?.area ?? null,
  };
}

/**
 * Issue 1: Guest checkout — create a cryptographically random guest identity.
 *
 * SAFETY: Guest openId is NEVER derived from an unverified phone number.
 * An unverified phone typed during checkout is only contact information;
 * it does NOT create identity linkage. Two guests typing the same phone
 * receive completely independent guest identities.
 *
 * When a guest later verifies their phone via OTP, their *session* becomes
 * authenticated — but their historical guest orders are NOT automatically
 * transferred to their verified account. A verified phone proves ownership
 * of the phone NOW; it does not prove the customer created past orders
 * where someone typed that phone number.
 */
export async function getOrCreateGuestUser(): Promise<number> {
  const db = await requireDb();

  // Cryptographically random guest identity — not derivable from any PII.
  // Explicit-id inserts can collide (random 900M space or sequence overlap);
  // retry on unique violation instead of surfacing a 500.
  for (let attempt = 0; attempt < 3; attempt++) {
    const guestId = randomInt(100_000_000, 999_999_999);
    const guestOpenId = `guest_${nanoid(24)}`;
    try {
      await db.insert(users).values({
        id: guestId,
        openId: guestOpenId,
        name: null,
        mobile: null,
        role: "user",
      });
      return guestId;
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 2) throw err;
    }
  }
  throw new Error("Could not create guest session. Please retry.");
}

// =============================================================================
// Customer Phone Auth (OTP) — hashed OTP codes, guest merging, session-based
// =============================================================================

import { hashOtp, verifyOtpHash } from "./security/otpHash";
// normalizePhone is already defined locally at line 55

/** Generate a cryptographically secure 6-digit OTP code (including leading zeros). */
export function generateOtpCode(): string {
  // randomInt(0, 900000) gives 0-899999, +100000 gives 100000-999999
  return String(randomInt(0, 900000) + 100000);
}

// Resend cooldown: 60 seconds between OTP sends per phone
const RESEND_COOLDOWN_MS = 60 * 1000;

/** Create and store an OTP for phone verification (hash stored, code returned once) */
export async function createOtp(phone: string): Promise<{ code: string; expiresAt: Date; cooldownRemaining?: number }> {
  const db = await requireDb();
  const normalizedPhone = normalizePhone(phone) ?? phone.replace(/\D/g, "");
  if (!normalizedPhone || normalizedPhone.length < 10) throw new Error("Invalid phone number.");

  // --- Fix 3: Enforce resend cooldown ---
  const lastOtp = (await db.select().from(otpVerifications)
    .where(and(
      eq(otpVerifications.phone, normalizedPhone),
      eq(otpVerifications.purpose, "login"),
    ))
    .orderBy(desc(otpVerifications.createdAt))
    .limit(1))[0];

  if (lastOtp) {
    const elapsed = Date.now() - lastOtp.createdAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const remaining = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw new Error(`Please wait ${remaining} seconds before requesting a new code.`);
    }
  }

  const code = generateOtpCode();
  const hashedCode = hashOtp(normalizedPhone, "login", code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Invalidate any existing active OTPs for this phone
  await db.update(otpVerifications)
    .set({ usedAt: new Date() })
    .where(and(
      eq(otpVerifications.phone, normalizedPhone),
      eq(otpVerifications.purpose, "login"),
      sql`${otpVerifications.usedAt} IS NULL`,
    ));

  // Insert new OTP (hash stored, never plaintext). Concurrent double-submit
  // hits the partial unique (phone,purpose WHERE usedAt IS NULL) — surface as
  // cooldown instead of a 500 with PG internals.
  try {
    await db.insert(otpVerifications).values({
      phone: normalizedPhone,
      code: hashedCode,
      purpose: "login",
      expiresAt,
      attempts: 0,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new Error("Please wait 60 seconds before requesting a new code.");
    }
    throw err;
  }

  return { code, expiresAt };
}

/** Verify an OTP code — returns openId for session, handles guest merging */
export async function verifyOtp(phone: string, code: string): Promise<{
  openId: string;
  userId: number;
  isNewUser: boolean;
  phone: string;
} | null> {
  const db = await requireDb();
  const normalizedPhone = normalizePhone(phone) ?? phone.replace(/\D/g, "");
  if (!normalizedPhone || normalizedPhone.length < 10) return null;
  const purpose = "login";

  // Find the latest active OTP for this phone using hashed comparison
  const records = await db.select().from(otpVerifications)
    .where(and(
      eq(otpVerifications.phone, normalizedPhone),
      eq(otpVerifications.purpose, purpose),
    ))
    .orderBy(desc(otpVerifications.createdAt))
    .limit(5);

  // Find matching OTP among recent records (HMAC comparison, timing-safe inside).
  const record = records.find(r => verifyOtpHash(normalizedPhone, purpose, code, r.code));

  if (!record) {
    // Brute-force guard: count failed guesses against the newest active OTP so
    // the 5-attempt limit actually binds (previously only successes incremented).
    const latest = records.find(r => !r.usedAt && new Date() <= r.expiresAt);
    if (latest) {
      await db.update(otpVerifications)
        .set({ attempts: sql`${otpVerifications.attempts} + 1` })
        .where(eq(otpVerifications.id, latest.id));
    }
    return null;
  }
  if (record.usedAt) return null; // already used
  if (new Date() > record.expiresAt) return null; // expired
  if ((record.attempts ?? 0) >= 5) return null; // too many attempts

  // --- Fix 6: Atomic attempt increment + single-use consumption ---
  // Single UPDATE with WHERE guards: usedAt IS NULL AND attempts < 5.
  // .returning() is the rowCount check: 0 rows = concurrently consumed/exhausted.
  const consumed = await db.update(otpVerifications)
    .set({
      usedAt: new Date(),
      attempts: sql`${otpVerifications.attempts} + 1`,
    })
    .where(and(
      eq(otpVerifications.id, record.id),
      sql`${otpVerifications.usedAt} IS NULL`,
      sql`${otpVerifications.attempts} < 5`,
    ))
    .returning({ id: otpVerifications.id });
  if (consumed.length === 0) return null;

  // --- SAFETY: No automatic guest-to-verified merging ---
  //
  // Design rule: A verified phone proves ownership of the phone NOW.
  // It does NOT prove the customer created every past order where
  // someone typed that phone number. Attacker-checkout attacks are
  // prevented by never merging guest data automatically.
  //
  // Guest orders remain under their random guest_<nanoid> identity.
  // If needed later, guest orders can be claimed via the order
  // tracking token — not by phone matching.
  //
  // The current session (which may have guest_*) will simply become
  // an authenticated customer_<phone> session going forward.

  const verifiedOpenId = `customer_${normalizedPhone}`;

  // Check for existing verified customer
  const existingVerified = (await db.select().from(users).where(eq(users.openId, verifiedOpenId)).limit(1))[0];

  if (existingVerified) {
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, existingVerified.id));
    return { openId: verifiedOpenId, userId: existingVerified.id, isNewUser: false, phone: normalizedPhone };
  }

  // Create new verified customer. Concurrent verifies for the same phone race
  // on openId unique — second re-reads the winner instead of 500ing.
  // NOTE: explicit random ids can collide; retry once, then re-read by openId.
  for (let attempt = 0; attempt < 2; attempt++) {
    const candidateId = randomInt(100_000_000, 999_999_999);
    const candidateProfileId = `cust_${nanoid(12)}`;
    try {
      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          id: candidateId,
          openId: verifiedOpenId,
          name: null,
          mobile: normalizedPhone,
          role: "user",
        });
        await tx.insert(customerProfiles).values({
          id: candidateProfileId,
          userId: candidateId,
          mobileNumber: normalizedPhone, // Only set here — verified via OTP
        });
        // NO guest order merge — see safety comment above.
      });
      return { openId: verifiedOpenId, userId: candidateId, isNewUser: true, phone: normalizedPhone };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const winner = (await db.select().from(users).where(eq(users.openId, verifiedOpenId)).limit(1))[0];
      if (winner) {
        return { openId: verifiedOpenId, userId: winner.id, isNewUser: false, phone: normalizedPhone };
      }
      if (attempt === 1) throw err;
    }
  }
  throw new Error("Could not verify phone. Please retry.");
}

// =============================================================================
// Admin Dashboard
// =============================================================================

export async function getAdminDashboard(restaurantId: string) {
  const db = await requireDb();

  const restaurant = (await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1))[0];
  if (!restaurant) return null;

  const outlet = (await db.select().from(outlets).where(eq(outlets.restaurantId, restaurantId)).limit(1))[0];
  const categories = await db.select().from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId));
  const items = await db.select().from(menuItems).where(eq(menuItems.restaurantId, restaurantId));
  const offers = await db.select().from(coupons).where(eq(coupons.restaurantId, restaurantId));
  // Recent orders capped at SQL level (LIMIT 100) — never load the full table.
  const recentOrders = await db.select().from(orders)
    .where(eq(orders.restaurantId, restaurantId))
    .orderBy(desc(orders.createdAt))
    .limit(100);

  // Push aggregates to SQL.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const agg = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_orders,
      COUNT(*) FILTER (WHERE status IN ('PLACED','RESTAURANT_ACCEPTED','PREPARING','READY_FOR_PICKUP','DELIVERY_REQUESTED','RIDER_ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY'))::int AS open_orders,
      COUNT(*) FILTER (WHERE created_at >= ${todayStart})::int AS today_orders,
      COALESCE(SUM(total_paise) FILTER (WHERE payment_status = 'PAID'), 0)::bigint AS total_sales_paise,
      COALESCE(SUM(total_paise) FILTER (WHERE payment_status = 'PAID' AND created_at >= ${todayStart}), 0)::bigint AS today_sales_paise,
      COUNT(*) FILTER (WHERE payment_status = 'PAID')::int AS paid_count,
      COUNT(*) FILTER (WHERE status = 'PLACED')::int AS pending_orders,
      COUNT(*) FILTER (WHERE status = 'PREPARING')::int AS preparing_orders,
      COUNT(*) FILTER (WHERE status = 'DELIVERED')::int AS delivered_orders,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_orders
    FROM orders WHERE restaurant_id = ${restaurantId}
  `) as unknown as { rows: Array<Record<string, string | number>> }).rows?.[0];
  const num = (v: unknown) => Number(v ?? 0);
  const totalOrders = num(agg?.total_orders);
  const paidCount = num(agg?.paid_count);
  const totalSalesPaise = num(agg?.total_sales_paise);

  return {
    restaurant,
    outlet,
    categories,
    items,
    offers,
    orders: recentOrders,
    metrics: {
      todayOrders: num(agg?.today_orders),
      openOrders: num(agg?.open_orders),
      totalOrders,
      todaySalesPaise: num(agg?.today_sales_paise),
      totalSalesPaise,
      availableItems: items.filter(i => i.availability === "AVAILABLE").length,
      totalItems: items.length,
      pendingOrders: num(agg?.pending_orders),
      preparingOrders: num(agg?.preparing_orders),
      deliveredOrders: num(agg?.delivered_orders),
      cancelledOrders: num(agg?.cancelled_orders),
      // Guard on paid count (not total) to avoid NaN AOV.
      averageOrderValue: paidCount > 0 ? Math.round(totalSalesPaise / paidCount) : 0,
    },
  };
}

// =============================================================================
// Customer Management
// =============================================================================

export async function getCustomerList(filters?: { search?: string; restaurantId?: string }, limit = 50, offset = 0) {
  const db = await requireDb();

  let query = db.select({
    id: customerProfiles.id,
    userId: customerProfiles.userId,
    mobileNumber: customerProfiles.mobileNumber,
    preferredName: customerProfiles.preferredName,
    totalOrders: customerProfiles.totalOrders,
    totalSpentPaise: customerProfiles.totalSpentPaise,
    createdAt: customerProfiles.createdAt,
    userName: users.name,
    userEmail: users.email,
  })
    .from(customerProfiles)
    .innerJoin(users, eq(customerProfiles.userId, users.id));

  const conditions = [];
  if (filters?.search) {
    // Escape LIKE wildcards so search is literal (prevents %/_ broadening results).
    const escaped = String(filters.search).replace(/[\\%_]/g, m => `\\${m}`);
    const searchPattern = `%${escaped}%`;
    conditions.push(
      or(
        like(users.name, searchPattern),
        like(users.email, searchPattern),
        like(customerProfiles.mobileNumber, searchPattern),
      )
    );
  }
  if (filters?.restaurantId) {
    const { inArray } = await import("drizzle-orm");
    const customerIds = db.select({ customerId: orders.customerId })
      .from(orders)
      .where(eq(orders.restaurantId, filters.restaurantId));
    conditions.push(inArray(customerProfiles.id, customerIds));
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions.filter(Boolean)) as any) as any;
  }

  return query.orderBy(desc(customerProfiles.createdAt)).limit(limit).offset(offset);
}

export async function getCustomerById(customerId: string, restaurantId?: string) {
  const db = await requireDb();
  const profile = (await db.select({
    id: customerProfiles.id,
    userId: customerProfiles.userId,
    mobileNumber: customerProfiles.mobileNumber,
    preferredName: customerProfiles.preferredName,
    totalOrders: customerProfiles.totalOrders,
    totalSpentPaise: customerProfiles.totalSpentPaise,
    adminNotes: customerProfiles.adminNotes,
    createdAt: customerProfiles.createdAt,
    userName: users.name,
    userEmail: users.email,
  })
    .from(customerProfiles)
    .innerJoin(users, eq(customerProfiles.userId, users.id))
    .where(eq(customerProfiles.id, customerId))
    .limit(1))[0];

  if (!profile) return null;

  const addresses = await db.select().from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId));
  const orderCondition = restaurantId
    ? and(eq(orders.customerId, customerId), eq(orders.restaurantId, restaurantId))
    : eq(orders.customerId, customerId);
  const orderHistory = await db.select().from(orders)
    .where(orderCondition)
    .orderBy(desc(orders.createdAt))
    .limit(50);

  return { ...profile, addresses, orderHistory };
}

// =============================================================================
// Reporting
// =============================================================================

export async function getSalesReport(restaurantId: string, startDate: Date, endDate: Date) {
  const db = await requireDb();

  // Push aggregates to SQL (no unbounded row fetch).
  const row = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_orders,
      COUNT(*) FILTER (WHERE payment_status = 'PAID')::int AS paid_count,
      COALESCE(SUM(item_total_paise) FILTER (WHERE payment_status = 'PAID'), 0)::bigint AS gross_sales,
      COALESCE(SUM(total_paise) FILTER (WHERE payment_status = 'PAID'), 0)::bigint AS net_sales,
      COALESCE(SUM(coupon_discount_paise) FILTER (WHERE payment_status = 'PAID'), 0)::bigint AS total_discounts,
      COALESCE(SUM(tax_paise) FILTER (WHERE payment_status = 'PAID'), 0)::bigint AS total_taxes,
      COALESCE(SUM(delivery_fee_paise) FILTER (WHERE payment_status = 'PAID'), 0)::bigint AS total_delivery,
      COALESCE(SUM(packaging_fee_paise) FILTER (WHERE payment_status = 'PAID'), 0)::bigint AS total_packaging,
      COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_orders,
      COALESCE(SUM(total_paise) FILTER (WHERE status = 'CANCELLED'), 0)::bigint AS cancelled_value
    FROM orders
    WHERE restaurant_id = ${restaurantId} AND created_at BETWEEN ${startDate} AND ${endDate}
  `) as unknown as { rows: Array<Record<string, string | number>> }).rows?.[0];
  const num = (v: unknown) => Number(v ?? 0);
  const paidCount = num(row?.paid_count);
  const netSales = num(row?.net_sales);

  return {
    period: { startDate, endDate },
    orderCount: paidCount,
    totalOrders: num(row?.total_orders),
    grossSales: num(row?.gross_sales),
    netSales,
    averageOrderValue: paidCount > 0 ? Math.round(netSales / paidCount) : 0,
    totalDiscounts: num(row?.total_discounts),
    totalTaxes: num(row?.total_taxes),
    totalDeliveryCharges: num(row?.total_delivery),
    totalPackagingCharges: num(row?.total_packaging),
    cancelledOrders: num(row?.cancelled_orders),
    cancelledValue: num(row?.cancelled_value),
  };
}

// =============================================================================
// Audit Logging
// =============================================================================

export async function logAudit(args: {
  actorId?: number;
  actorName?: string;
  action: string;
  targetType: string;
  targetId?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  ipAddress?: string;
  restaurantId?: string;
}) {
  const db = await requireDb();
  await db.insert(auditLogs).values({
    id: id(),
    ...args,
  });
}

// =============================================================================
// Settings
// =============================================================================

export async function getSetting(key: string) {
  const db = await requireDb();
  const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function setSetting(key: string, value: string, category = "general", updatedBy?: number, restaurantId?: string | null) {
  const db = await requireDb();
  await db.insert(settings).values({ id: id(), key, value, category, updatedBy, restaurantId: restaurantId ?? null })
    .onConflictDoUpdate({ target: [settings.key, settings.restaurantId], set: { value, updatedBy } });
}

// =============================================================================
// Seed Data — REMOVED
// All restaurant data is managed through admin panel and self-serve signup.
// No dummy/mock data is seeded automatically.
// =============================================================================

// ensureRestaurantSeed() removed — no dummy data.
// Use /signup to create a real restaurant, or manage via admin panel.

export async function ensureRestaurantSeed() {
  // Return the first restaurant from the database, or null if none exist.
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(restaurants).limit(1);
  return result[0] ?? null;
}
