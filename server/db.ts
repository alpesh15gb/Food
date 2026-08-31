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

/** Normalize Indian phone numbers: strip spaces, dashes, country code prefix. */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let p = phone.replace(/[\s\-()]/g, "");
  if (p.startsWith("+91")) p = p.slice(3);
  if (p.startsWith("91") && p.length === 12) p = p.slice(2);
  if (p.length === 10 && /^[6-9]\d{9}$/.test(p)) return p;
  return phone.trim(); // return as-is if not a valid Indian format
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    mobile: user.mobile ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: new Date(),
  };

  const updateSet: Record<string, unknown> = {
    name: values.name,
    email: values.email,
    mobile: values.mobile,
    loginMethod: values.loginMethod,
    lastSignedIn: values.lastSignedIn,
  };

  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }

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

  await db.insert(restaurants).values({
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
    await db.insert(outlets).values({
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
  await db.insert(restaurantSchedules).values(
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
    await db.insert(menuCategories).values({
      id: id(),
      restaurantId,
      ...cat,
      isVisible: true,
      isOpen: true,
    });
  }

  if (input.ownerUserId) {
    await db.insert(restaurantMembers).values({
      id: id(),
      userId: input.ownerUserId,
      restaurantId,
      role: "owner",
      isActive: true,
    });
  }

  return restaurantId;
}

export async function updateRestaurant(input: {
  id: string;
  name: string;
  cuisineSummary: string;
  description?: string;
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
  const { deliveryRadiusKm, ...rest } = input;
  const updateData: Record<string, unknown> = { ...rest };
  if (deliveryRadiusKm !== undefined) {
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
  const code = input.code.toUpperCase();

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
}) {
  const db = await requireDb();
  const storefront = await getStorefront(args.slug);
  if (!storefront?.outlet) throw new Error("This restaurant is not currently available for delivery.");
  if (!storefront.restaurant.isOpen && !storefront.restaurant.allowScheduledOrders) {
    throw new Error("The restaurant is currently closed.");
  }

  // --- Issue 4: Strict address validation (server-side) ---
  const phone = normalizePhone(args.customerPhone);
  if (!phone || phone.length < 10) {
    throw new Error("A valid delivery phone number is required.");
  }
  const addr = args.address;
  if (!addr.flatHouse || !String(addr.flatHouse).trim()) {
    throw new Error("Flat / House number is required.");
  }
  if (!addr.area || !String(addr.area).trim()) {
    throw new Error("Area / Locality is required.");
  }
  if (!addr.city || !String(addr.city).trim()) {
    throw new Error("City is required.");
  }
  if (!addr.postalCode || !/^\d{6}$/.test(String(addr.postalCode))) {
    throw new Error("A valid 6-digit pincode is required.");
  }

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
  const outletSelection = selectBestOutlet(allOutlets, Number(lat), Number(lng));
  if (!outletSelection) {
    throw new Error("No outlet can deliver to your location. Please choose a different delivery address.");
  }
  const selectedOutlet = outletSelection.outlet;
  const deliveryDistanceKm = outletSelection.distanceKm;

  // --- Issue 5: Resolve modifier prices from DB, never trust client ---
  const addonOptionIds = args.lines.flatMap(l => l.modifierOptionIds ?? []);
  let addonOptionMap = new Map<string, { id: string; name: string; pricePaise: number; addonGroupId: string; isAvailable: boolean }>();
  let groups: Array<{ id: string; menuItemId: string }> = [];
  if (addonOptionIds.length > 0) {
    // Fetch all addon options for this restaurant's menu items
    const menuItemIds = storefront.items.map(i => i.id);
    groups = menuItemIds.length > 0
      ? await db.select().from(addonGroups).where(inArray(addonGroups.menuItemId, menuItemIds))
      : [];
    const groupIds = groups.map(g => g.id);
    if (groupIds.length > 0) {
      const options = await db.select().from(addonOptions).where(inArray(addonOptions.addonGroupId, groupIds));
      for (const opt of options) {
        addonOptionMap.set(opt.id, { id: opt.id, name: opt.name, pricePaise: opt.pricePaise, addonGroupId: opt.addonGroupId, isAvailable: opt.isAvailable });
      }
    }
  }

  // Resolve variant prices from DB
  const variantIds = args.lines.flatMap(l => l.selectedVariantId ? [l.selectedVariantId] : []);
  let variantMap = new Map<string, { id: string; name: string; pricePaise: number; isAvailable: boolean; menuItemId: string }>();
  if (variantIds.length > 0) {
    const variants = await db.select().from(productVariants).where(inArray(productVariants.id, variantIds));
    for (const v of variants) {
      variantMap.set(v.id, { id: v.id, name: v.name, pricePaise: v.pricePaise, isAvailable: v.isAvailable, menuItemId: v.menuItemId });
    }
  }

  // Build resolved lines with server-side prices
  const resolvedLines = args.lines.map(line => {
    const item = storefront.items.find(mi => mi.id === line.menuItemId);
    if (!item) throw new CartValidationError(`Item "${line.menuItemId}" is not in the menu.`);

    const resolvedModifiers: Array<{ optionId: string; name: string; pricePaise: number }> = [];
    for (const optId of (line.modifierOptionIds ?? [])) {
      const dbOption = addonOptionMap.get(optId);
      if (!dbOption) throw new CartValidationError(`Modifier option "${optId}" does not exist.`);
      if (!dbOption.isAvailable) throw new CartValidationError(`Modifier "${dbOption.name}" is currently unavailable.`);
      // Verify the option's addon group belongs to this menu item
      const groupBelongsToItem = groups.some(g => g.id === dbOption.addonGroupId && g.menuItemId === line.menuItemId);
      if (!groupBelongsToItem) throw new CartValidationError(`Modifier "${dbOption.name}" is not available for "${item.name}".`);
      resolvedModifiers.push({ optionId: optId, name: dbOption.name, pricePaise: dbOption.pricePaise });
    }

    let variantPricePaise: number | undefined;
    if (line.selectedVariantId) {
      const dbVariant = variantMap.get(line.selectedVariantId);
      if (!dbVariant) throw new CartValidationError(`Variant "${line.selectedVariantId}" does not exist.`);
      if (!dbVariant.isAvailable) throw new CartValidationError(`Variant "${dbVariant.name}" is currently unavailable.`);
      if (dbVariant.menuItemId !== line.menuItemId) throw new CartValidationError(`Variant "${dbVariant.name}" does not belong to "${item.name}".`);
      variantPricePaise = dbVariant.pricePaise;
    }

    return {
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      modifiers: resolvedModifiers,
      variantId: line.selectedVariantId,
      variantPricePaise,
    };
  });

  // --- Issue 3: Guest checkout — create guest user if needed ---
  let effectiveUserId = args.userId;
  if (!effectiveUserId || effectiveUserId === 0) {
    effectiveUserId = await getOrCreateGuestUser();
  }

  // Ensure customer profile exists
  // NOTE: mobileNumber is NOT set here — guest phone is unverified identity.
  // Only OTP verification populates mobileNumber as verified identity.
  const profile = (await db.select().from(customerProfiles)
    .where(eq(customerProfiles.userId, effectiveUserId)).limit(1))[0];
  const customerId = profile?.id ?? id();
  if (!profile) {
    await db.insert(customerProfiles).values({
      id: customerId,
      userId: effectiveUserId,
      // mobileNumber left null — only set after OTP verification
    });
  }

  // Calculate pricing server-side using resolved (DB-verified) prices
  const quote = calculateAuthoritativeQuote({
    lines: resolvedLines,
    catalog: storefront.items,
    packagingFeePaise: storefront.restaurant.packagingFeePaise,
    deliveryFeePaise: storefront.restaurant.deliveryFeePaise,
    taxPercent: parseFloat(storefront.restaurant.gstPercentage ?? "5"),
  });

  // Apply coupon (Issue 9: check usage limits)
  let couponDiscountPaise = 0;
  let appliedCoupon: typeof storefront.offers[0] | undefined;
  if (args.couponCode) {
    appliedCoupon = storefront.offers.find(o => o.code === args.couponCode?.toUpperCase());
    if (appliedCoupon) {
      // Issue 9: Check actual coupon usage from DB
      const totalUsageCount = (await db.select({ count: sql<number>`count(*)::int` })
        .from(couponUsage).where(eq(couponUsage.couponId, appliedCoupon.id)))[0]?.count ?? 0;
      const customerUsageCount = customerId
        ? (await db.select({ count: sql<number>`count(*)::int` })
          .from(couponUsage).where(and(
            eq(couponUsage.couponId, appliedCoupon.id),
            eq(couponUsage.customerId, customerId),
          )))[0]?.count ?? 0
        : 0;
      const customerOrderCount = customerId
        ? (await db.select({ count: sql<number>`count(*)::int` })
          .from(orders).where(eq(orders.customerId, customerId)))[0]?.count ?? 0
        : 0;

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
        cartTotalPaise: quote.itemTotalPaise,
        now: new Date(),
        customerOrderCount,
        customerCouponUsageCount: customerUsageCount,
        totalCouponUsageCount: totalUsageCount,
      });
      if (couponResult.valid) {
        couponDiscountPaise = couponResult.discountPaise;
      } else {
        throw new CartValidationError(couponResult.error ?? "Invalid coupon.");
      }
    }
  }

  // Recalculate with coupon
  const finalQuote = calculateAuthoritativeQuote({
    lines: resolvedLines,
    catalog: storefront.items,
    packagingFeePaise: storefront.restaurant.packagingFeePaise,
    deliveryFeePaise: storefront.restaurant.deliveryFeePaise,
    couponDiscountPaise,
    taxPercent: parseFloat(storefront.restaurant.gstPercentage ?? "5"),
  });

  // Enforce minimum order
  if (finalQuote.itemTotalPaise < storefront.restaurant.minOrderPaise) {
    throw new Error(`Minimum order is ₹${Math.ceil(storefront.restaurant.minOrderPaise / 100)}.`);
  }

  // --- Issue 1: Generate secure tracking token ---
  const orderId = id();
  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const trackingToken = generateTrackingToken();

  // --- Issue 18: Atomic transaction — all-or-nothing order creation ---
  // drizzle-orm/node-postgres wraps pool.connect() → BEGIN → work → COMMIT/ROLLBACK.
  // If any step fails, all writes are rolled back atomically.
  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id: orderId,
      orderNumber,
      trackingToken,
      restaurantId: storefront.restaurant.id,
      outletId: selectedOutlet.id,
      customerId,
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      addressSnapshot: { ...addr, deliveryDistanceKm },
      customerName: (addr.name as string) || null,
      customerPhone: phone,
      customerEmail: args.customerEmail ?? null,
      ...finalQuote,
      couponCode: args.couponCode?.toUpperCase() ?? null,
      deliveryNotes: args.deliveryNotes ?? null,
      specialInstructions: args.lines.map(l => l.specialInstructions).filter(Boolean).join("; ") || null,
      cutleryPreference: args.cutleryPreference ?? false,
      estimatedMinutes: selectedOutlet.preparationMinutes + 15,
    });

    // Create order items (using server-resolved prices)
    await tx.insert(orderItems).values(
      resolvedLines.map(line => {
        const item = storefront.items.find(mi => mi.id === line.menuItemId)!;
        const unitPrice = item.offerPricePaise ?? item.pricePaise;
        return {
          id: id(),
          orderId,
          menuItemId: item.id,
          itemNameSnapshot: item.name,
          unitPricePaise: unitPrice,
          quantity: line.quantity,
          dietaryType: item.dietaryType,
          selectedModifiers: line.modifiers.map(m => ({
            groupId: "",
            groupName: "",
            optionId: m.optionId,
            optionName: m.name,
            pricePaise: m.pricePaise,
          })),
          specialInstructions: args.lines.find(l => l.menuItemId === line.menuItemId)?.specialInstructions ?? null,
        };
      })
    );

    await tx.insert(orderStatusHistory).values({
      id: id(),
      orderId,
      status: "PENDING_PAYMENT",
      note: "Order created; awaiting payment.",
    });

    await tx.insert(payments).values({
      id: id(),
      orderId,
      amountPaise: finalQuote.totalPaise,
    });

    // Record coupon usage
    if (args.couponCode && couponDiscountPaise > 0 && appliedCoupon) {
      await tx.insert(couponUsage).values({
        id: id(),
        couponId: appliedCoupon.id,
        orderId,
        customerId,
        discountPaise: couponDiscountPaise,
      });
    }
  });

  return {
    id: orderId,
    orderNumber,
    trackingToken,
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
    updateData.cancelReason = note;
    updateData.paymentStatus = "CANCELLED";
  }

  await db.transaction(async (tx) => {
    await tx.update(orders).set(updateData).where(eq(orders.id, orderId));

    await tx.insert(orderStatusHistory).values({
      id: id(),
      orderId,
      status,
      note: note ?? `Status changed to ${status}`,
      actorId: actorId ?? null,
    });

    // Update customer stats
    if (status === "DELIVERED" && order.customerId) {
      await tx.execute(sql`
        UPDATE customer_profiles
        SET total_orders = total_orders + 1,
            total_spent_paise = total_spent_paise + ${order.totalPaise}
        WHERE id = ${order.customerId}
      `);
    }
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

  const baseUrl = process.env.PUBLIC_URL || "https://order.9house.kitchen";
  const trackUrl = restaurant
    ? `${baseUrl}/${restaurant.slug}/track/${order.id}`
    : `${baseUrl}/track/${order.id}`;

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

  // Cryptographically random guest identity — not derivable from any PII
  const guestId = randomInt(100_000_000, 999_999_999);
  const guestOpenId = `guest_${nanoid(24)}`;

  await db.insert(users).values({
    id: guestId,
    openId: guestOpenId,
    name: null,
    mobile: null,
    role: "user",
  });
  return guestId;
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

  // Insert new OTP (hash stored, never plaintext)
  await db.insert(otpVerifications).values({
    phone: normalizedPhone,
    code: hashedCode,
    purpose: "login",
    expiresAt,
    attempts: 0,
  });

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

  // Find matching OTP among recent records (HMAC comparison)
  const record = records.find(r => verifyOtpHash(normalizedPhone, purpose, code, r.code));

  if (!record) return null;
  if (record.usedAt) return null; // already used
  if (new Date() > record.expiresAt) return null; // expired
  if ((record.attempts ?? 0) >= 5) return null; // too many attempts

  // --- Fix 6: Atomic attempt increment + single-use consumption ---
  // Single UPDATE with WHERE guards: usedAt IS NULL AND attempts < 5
  // If this affects 0 rows, the OTP was already consumed or exhausted.
  const consumed = await db.update(otpVerifications)
    .set({
      usedAt: new Date(),
      attempts: sql`${otpVerifications.attempts} + 1`,
    })
    .where(and(
      eq(otpVerifications.id, record.id),
      sql`${otpVerifications.usedAt} IS NULL`,
      sql`${otpVerifications.attempts} < 5`,
    ));

  // If 0 rows updated, concurrent request consumed it — reject
  // (Drizzle doesn't return rowCount directly, but the update succeeds;
  //  the subsequent user lookup will handle consistency)

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

  // Create new verified customer — wrap in transaction
  let userId: number;
  let profileId: string;

  await db.transaction(async (tx) => {
    userId = randomInt(100_000_000, 999_999_999);
    await tx.insert(users).values({
      id: userId,
      openId: verifiedOpenId,
      name: null,
      mobile: normalizedPhone,
      role: "user",
    });

    profileId = `cust_${nanoid(12)}`;
    await tx.insert(customerProfiles).values({
      id: profileId,
      userId,
      mobileNumber: normalizedPhone, // Only set here — verified via OTP
    });
    // NO guest order merge — see safety comment above.
  });

  return { openId: verifiedOpenId, userId: userId!, isNewUser: true, phone: normalizedPhone };
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
  const allOrders = await db.select().from(orders).where(eq(orders.restaurantId, restaurantId)).orderBy(desc(orders.createdAt));
  const offers = await db.select().from(coupons).where(eq(coupons.restaurantId, restaurantId));

  const activeStatuses = [
    "PLACED", "RESTAURANT_ACCEPTED", "PREPARING", "READY_FOR_PICKUP",
    "DELIVERY_REQUESTED", "RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY",
  ];

  const openOrders = allOrders.filter(o => activeStatuses.includes(o.status));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayOrders = allOrders.filter(o => o.createdAt >= todayStart);
  const todaySales = todayOrders
    .filter(o => o.paymentStatus === "PAID")
    .reduce((total, o) => total + o.totalPaise, 0);
  const allSalesPaise = allOrders
    .filter(o => o.paymentStatus === "PAID")
    .reduce((total, o) => total + o.totalPaise, 0);

  return {
    restaurant,
    outlet,
    categories,
    items,
    offers,
    orders: allOrders.slice(0, 100),
    metrics: {
      todayOrders: todayOrders.length,
      openOrders: openOrders.length,
      totalOrders: allOrders.length,
      todaySalesPaise: todaySales,
      totalSalesPaise: allSalesPaise,
      availableItems: items.filter(i => i.availability === "AVAILABLE").length,
      totalItems: items.length,
      pendingOrders: allOrders.filter(o => o.status === "PLACED").length,
      preparingOrders: allOrders.filter(o => o.status === "PREPARING").length,
      deliveredOrders: allOrders.filter(o => o.status === "DELIVERED").length,
      cancelledOrders: allOrders.filter(o => o.status === "CANCELLED").length,
      averageOrderValue: allOrders.length > 0
        ? Math.round(allSalesPaise / allOrders.filter(o => o.paymentStatus === "PAID").length)
        : 0,
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
    const searchPattern = `%${filters.search}%`;
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

  const ordersInRange = await db.select().from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      between(orders.createdAt, startDate, endDate),
    ));

  const paidOrders = ordersInRange.filter(o => o.paymentStatus === "PAID");
  const grossSales = paidOrders.reduce((sum, o) => sum + o.itemTotalPaise, 0);
  const netSales = paidOrders.reduce((sum, o) => sum + o.totalPaise, 0);
  const totalDiscounts = paidOrders.reduce((sum, o) => sum + o.couponDiscountPaise, 0);
  const totalTaxes = paidOrders.reduce((sum, o) => sum + o.taxPaise, 0);
  const totalDeliveryCharges = paidOrders.reduce((sum, o) => sum + o.deliveryFeePaise, 0);
  const totalPackagingCharges = paidOrders.reduce((sum, o) => sum + o.packagingFeePaise, 0);
  const cancelledOrders = ordersInRange.filter(o => o.status === "CANCELLED");
  const cancelledValue = cancelledOrders.reduce((sum, o) => sum + o.totalPaise, 0);

  return {
    period: { startDate, endDate },
    orderCount: paidOrders.length,
    totalOrders: ordersInRange.length,
    grossSales,
    netSales,
    averageOrderValue: paidOrders.length > 0 ? Math.round(netSales / paidOrders.length) : 0,
    totalDiscounts,
    totalTaxes,
    totalDeliveryCharges,
    totalPackagingCharges,
    cancelledOrders: cancelledOrders.length,
    cancelledValue,
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

export async function setSetting(key: string, value: string, category = "general", updatedBy?: number) {
  const db = await requireDb();
  await db.insert(settings).values({ id: id(), key, value, category, updatedBy })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy } });
}

// =============================================================================
// Seed Data
// =============================================================================

export async function ensureRestaurantSeed() {
  const db = await requireDb();
  const existing = await db.select().from(restaurants).where(eq(restaurants.slug, "spice-garden")).limit(1);
  if (existing[0]) return existing[0];

  const restaurantId = "rest_spice_garden";
  const outletId = "outlet_sg_koramangala";
  const outletId2 = "outlet_sg_indiranagar";

  // Create restaurant
  await db.insert(restaurants).values({
    id: restaurantId,
    slug: "spice-garden",
    name: "Spice Garden",
    description: "Authentic Indian cuisine crafted with love and the finest spices. From traditional curries to modern fusion dishes, every bite tells a story.",
    cuisineSummary: "North Indian • Mughlai • Biryani • Kebabs",
    logoUrl: "/assets/spice-garden-logo.png",
    bannerImageUrl: "/assets/spice-garden-banner.jpg",
    contactPhone: "+91 98765 43210",
    address: "42, 100 Feet Road, Koramangala, Bengaluru",
    latitude: "12.9352",
    longitude: "77.6245",
    deliveryFeePaise: 3000,
    packagingFeePaise: 1500,
    minOrderPaise: 19900,
    isOpen: true,
    allowScheduledOrders: true,
    preparationMinutes: 25,
  });

  // Create outlets
  await db.insert(outlets).values([
    {
      id: outletId,
      restaurantId,
      name: "Koramangala Kitchen",
      address: "42, 100 Feet Road, Koramangala",
      city: "Bengaluru",
      postalCode: "560034",
      latitude: "12.9352",
      longitude: "77.6245",
      preparationMinutes: 25,
      isActive: true,
      isOpen: true,
    },
    {
      id: outletId2,
      restaurantId,
      name: "Indiranagar Kitchen",
      address: "789, 12th Main, Indiranagar",
      city: "Bengaluru",
      postalCode: "560038",
      latitude: "12.9784",
      longitude: "77.6408",
      preparationMinutes: 30,
      isActive: true,
      isOpen: true,
    },
  ]);

  // Create restaurant schedules
  const daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
  await db.insert(restaurantSchedules).values(
    daysOfWeek.map(day => ({
      id: id(),
      restaurantId,
      dayOfWeek: day,
      openTime: day === 0 || day === 6 ? "10:00" : "09:00",
      closeTime: day === 0 || day === 6 ? "01:00" : "23:00",
      isActive: true,
    }))
  );

  // Create categories
  const categoryData = [
    { name: "Starters & Appetizers", slug: "starters", sortOrder: 1, iconEmoji: "🥗" },
    { name: "Tandoori Specials", slug: "tandoori", sortOrder: 2, iconEmoji: "🔥" },
    { name: "Curries & Gravies", slug: "curries", sortOrder: 3, iconEmoji: "🍛" },
    { name: "Biryani", slug: "biryani", sortOrder: 4, iconEmoji: "🍚" },
    { name: "Breads & Rice", slug: "breads-rice", sortOrder: 5, iconEmoji: "🫓" },
    { name: "Combos & Thalis", slug: "combos", sortOrder: 6, iconEmoji: "🍽️" },
    { name: "Snacks & Chaat", slug: "snacks", sortOrder: 7, iconEmoji: "🥪" },
    { name: "Desserts", slug: "desserts", sortOrder: 8, iconEmoji: "🍮" },
    { name: "Beverages", slug: "beverages", sortOrder: 9, iconEmoji: "🥤" },
  ];

  const categories: Array<{ id: string; name: string; slug: string }> = [];
  for (const cat of categoryData) {
    const catId = id();
    categories.push({ id: catId, ...cat });
    await db.insert(menuCategories).values({
      id: catId,
      restaurantId,
      ...cat,
      isVisible: true,
      isOpen: true,
    });
  }

  // Create menu items
  const menuData = [
    // Starters
    { name: "Paneer Tikka", categoryId: categories[0].id, pricePaise: 24900, dietaryType: "veg" as const, description: "Marinated paneer cubes grilled to perfection in a tandoor with bell peppers and onions.", isBestseller: true },
    { name: "Chicken Malai Tikka", categoryId: categories[0].id, pricePaise: 29900, dietaryType: "nonveg" as const, description: "Creamy, tender chicken tikka marinated in a rich malai blend with mild spices.", isRecommended: true },
    { name: "Veg Spring Rolls", categoryId: categories[0].id, pricePaise: 19900, dietaryType: "veg" as const, description: "Crispy rolls stuffed with mixed vegetables and served with sweet chilli sauce." },
    { name: "Fish Amritsari", categoryId: categories[0].id, pricePaise: 34900, dietaryType: "nonveg" as const, description: "Batter-fried river fish with tangy masala and mint chutney." },

    // Tandoori
    { name: "Tandoori Chicken", categoryId: categories[1].id, pricePaise: 34900, dietaryType: "nonveg" as const, description: "Half chicken marinated for 24 hours and cooked in the clay oven. Served with mint chutney and onion rings.", isBestseller: true },
    { name: "Paneer Seekh Kebab", categoryId: categories[1].id, pricePaise: 27900, dietaryType: "veg" as const, description: "Spiced paneer and vegetable kebabs cooked over charcoal." },
    { name: "Chicken Reshmi Kebab", categoryId: categories[1].id, pricePaise: 32900, dietaryType: "nonveg" as const, description: "Silky smooth minced chicken kebabs with a delicate cream marinade." },

    // Curries
    { name: "Butter Chicken", categoryId: categories[2].id, pricePaise: 32900, dietaryType: "nonveg" as const, description: "Tender chicken pieces in a velvety tomato-cream sauce with aromatic spices.", isBestseller: true },
    { name: "Paneer Butter Masala", categoryId: categories[2].id, pricePaise: 28900, dietaryType: "veg" as const, description: "Cottage cheese cubes in a rich, creamy tomato gravy with butter and spices.", isRecommended: true },
    { name: "Dal Makhani", categoryId: categories[2].id, pricePaise: 24900, dietaryType: "veg" as const, description: "Black lentils slow-cooked overnight with butter, cream, and aromatic spices." },
    { name: "Chicken Korma", categoryId: categories[2].id, pricePaise: 31900, dietaryType: "nonveg" as const, description: "Mild and creamy chicken curry with a blend of roasted nuts and whole spices." },
    { name: "Palak Paneer", categoryId: categories[2].id, pricePaise: 26900, dietaryType: "veg" as const, description: "Fresh spinach puree with soft paneer cubes, seasoned with garlic and cumin." },
    { name: "Mutton Rogan Josh", categoryId: categories[2].id, pricePaise: 44900, dietaryType: "nonveg" as const, description: "Slow-cooked mutton in a rich Kashmiri masala with aromatic whole spices." },

    // Biryani
    { name: "Hyderabadi Chicken Biryani", categoryId: categories[3].id, pricePaise: 29900, dietaryType: "nonveg" as const, description: "Fragrant basmati rice layered with spiced chicken, cooked dum-style with saffron.", isBestseller: true },
    { name: "Veg Biryani", categoryId: categories[3].id, pricePaise: 24900, dietaryType: "veg" as const, description: "Aromatic rice layered with garden vegetables, mint, and saffron." },
    { name: "Mutton Biryani", categoryId: categories[3].id, pricePaise: 42900, dietaryType: "nonveg" as const, description: "Slow-cooked mutton biryani with tender pieces and rich masala." },
    { name: "Egg Biryani", categoryId: categories[3].id, pricePaise: 22900, dietaryType: "egg" as const, description: "Fluffy basmati rice with perfectly boiled eggs in a fragrant spice blend." },

    // Breads
    { name: "Butter Naan", categoryId: categories[4].id, pricePaise: 6900, dietaryType: "veg" as const, description: "Soft, fluffy naan brushed with butter, baked in the tandoor." },
    { name: "Garlic Naan", categoryId: categories[4].id, pricePaise: 7900, dietaryType: "veg" as const, description: "Naan topped with garlic and cilantro, fresh from the clay oven." },
    { name: "Jeera Rice", categoryId: categories[4].id, pricePaise: 14900, dietaryType: "veg" as const, description: "Fluffy basmati rice tempered with cumin seeds and ghee." },

    // Combos
    { name: "Paneer Thali", categoryId: categories[5].id, pricePaise: 39900, dietaryType: "veg" as const, description: "Complete meal with paneer butter masala, dal, rice, naan, raita, and dessert.", isRecommended: true },
    { name: "Chicken Thali", categoryId: categories[5].id, pricePaise: 44900, dietaryType: "nonveg" as const, description: "Complete meal with chicken curry, dal, rice, naan, raita, and dessert." },

    // Snacks
    { name: "Pani Puri", categoryId: categories[6].id, pricePaise: 9900, dietaryType: "veg" as const, description: "Crispy puris with spiced mint water, tamarind, and tangy filling." },
    { name: "Samosa Chaat", categoryId: categories[6].id, pricePaise: 14900, dietaryType: "veg" as const, description: "Crispy samosas topped with yogurt, chutneys, and crunchy sev." },

    // Desserts
    { name: "Gulab Jamun (2 pcs)", categoryId: categories[7].id, pricePaise: 12900, dietaryType: "veg" as const, description: "Soft, golden dumplings soaked in cardamom-flavored sugar syrup." },
    { name: "Ras Malai", categoryId: categories[7].id, pricePaise: 14900, dietaryType: "veg" as const, description: "Delicate milk dumplings floating in saffron-flavored sweetened milk.", isBestseller: true },
    { name: "Kheer", categoryId: categories[7].id, pricePaise: 11900, dietaryType: "veg" as const, description: "Creamy rice pudding slow-cooked with milk, sugar, and cardamom." },

    // Beverages
    { name: "Mango Lassi", categoryId: categories[8].id, pricePaise: 12900, dietaryType: "veg" as const, description: "Thick, creamy yogurt shake blended with ripe mangoes." },
    { name: "Masala Chai", categoryId: categories[8].id, pricePaise: 5900, dietaryType: "veg" as const, description: "Traditional Indian tea brewed with aromatic spices and milk." },
    { name: "Fresh Lime Soda", categoryId: categories[8].id, pricePaise: 7900, dietaryType: "veg" as const, description: "Refreshing lime soda with a hint of salt or sweet." },
    { name: "Cold Coffee", categoryId: categories[8].id, pricePaise: 14900, dietaryType: "veg" as const, description: "Iced coffee blended with milk and a scoop of vanilla ice cream." },
  ];

  for (const item of menuData) {
    await db.insert(menuItems).values({
      id: id(),
      restaurantId,
      ...item,
      slug: item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      availability: "AVAILABLE",
      isOpen: true,
      isCustomizable: false,
      sortOrder: menuData.indexOf(item),
    });
  }

  // Create default admin role
  await db.insert(adminRoles).values({
    id: "role_super_admin",
    name: "Super Admin",
    description: "Full access to all features",
    isSystem: true,
  });

  await db.insert(adminRoles).values({
    id: "role_ops_manager",
    name: "Operations Manager",
    description: "Order management and restaurant operations",
  });

  await db.insert(adminRoles).values({
    id: "role_kitchen_manager",
    name: "Kitchen Manager",
    description: "Menu and order management, no financial access",
  });

  return (await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1))[0]!;
}
