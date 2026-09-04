/**
 * Cloud-Kitchen Platform — PostgreSQL Database Schema
 *
 * Supports: multi-brand, multi-outlet, scheduling, RBAC, delivery, payments,
 * coupons, audit logging, webhooks, bulk import, and reporting.
 *
 * All monetary values are stored in paise (integer minor units).
 * All timestamps are timezone-aware (Asia/Kolkata default).
 */
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
// NOTE (P0 schema hardening, additive-only):
// - Existing columns are never renamed/removed; all changes below are additive
//   (new columns, new partial unique indexes, new CHECKs, onDelete actions).
// - Existing timestamp() columns are left as-is to avoid a heavy rewrite
//   migration. ALL NEW timestamp columns must use timestamp(..., { withTimezone: true, mode: "date" }).
// - Existing lat/lng varchar columns are kept for compat. Numeric mirrors
//   (latitude_num/longitude_num numeric(9,6)) are added alongside; new code
//   should prefer the numeric columns. CHECKs below validate varchar format.
// - deliveries.status stays varchar for compat; a CHECK constrains values and
//   deliveryStatusEnum is the canonical code-level enum for future migration.

// =============================================================================
// ENUMS
// =============================================================================

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING_PAYMENT", "PAYMENT_CONFIRMED", "PLACED", "RESTAURANT_ACCEPTED",
  "PREPARING", "READY_FOR_PICKUP", "DELIVERY_REQUESTED", "RIDER_ASSIGNED",
  "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REJECTED",
  "REFUND_PENDING", "REFUNDED",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING", "PAID", "FAILED", "CANCELLED", "REFUND_PENDING", "REFUNDED",
]);

export const paymentProviderStatusEnum = pgEnum("payment_provider_status", [
  "CREATED", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED", "REFUNDED",
]);

export const fulfillmentTypeEnum = pgEnum("fulfillment_type", ["DELIVERY", "PICKUP"]);
export const orderSourceEnum = pgEnum("order_source", ["DIRECT", "ZOMATO", "SWIGGY", "PHONE", "WALK_IN"]);

export const dietaryTypeEnum = pgEnum("dietary_type", ["veg", "nonveg", "egg"]);

export const availabilityEnum = pgEnum("availability", [
  "AVAILABLE", "SOLD_OUT", "SCHEDULED_UNAVAILABLE", "OUT_OF_STOCK", "DISABLED",
]);

export const discountTypeEnum = pgEnum("discount_type", ["flat", "percent"]);

export const addressLabelEnum = pgEnum("address_label", ["Home", "Work", "Other"]);

export const modifierSelectionTypeEnum = pgEnum("modifier_selection_type", ["single", "multiple"]);

export const refundStatusEnum = pgEnum("refund_status", ["PENDING", "PROCESSED", "FAILED"]);

// Canonical delivery lifecycle. Kept as code-level enum; the deliveries.status
// and delivery_status_history.status columns stay varchar + CHECK (compat)
// until a dedicated enum-migration is approved.
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "PENDING", "QUOTED", "REQUESTED", "ASSIGNED", "RIDER_ASSIGNED",
  "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "FAILED",
]);

export const importJobStatusEnum = pgEnum("import_job_status", ["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);

export const importJobTypeEnum = pgEnum("import_job_type", ["products", "coupons", "categories"]);
export const restaurantMemberRoleEnum = pgEnum("restaurant_member_role", ["owner", "admin", "manager", "staff", "kitchen"]);
export const sslStatusEnum = pgEnum("ssl_status", ["pending", "active", "expired", "failed"]);

// =============================================================================
// AUTHENTICATION & RBAC
// =============================================================================

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  mobile: varchar("mobile", { length: 24 }),
  loginMethod: varchar("login_method", { length: 64 }),
  passwordHash: varchar("password_hash", { length: 256 }),
  role: userRoleEnum("role").default("user").notNull(),
  // P0: bump to invalidate existing sessions on demand (additive, default 0).
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("users_email_unique_idx").on(t.email).where(sql`${t.email} IS NOT NULL`),
  check("users_session_version_nonneg_chk", sql`${t.sessionVersion} >= 0`),
]);

// =============================================================================
// Customer Phone Verification (OTP)
// =============================================================================

export const otpVerifications = pgTable("otp_verifications", {
  id: serial("id").primaryKey(),
  phone: varchar("phone", { length: 15 }).notNull(),
  code: varchar("code", { length: 64 }).notNull(), // SHA-256 hash, not plaintext
  purpose: varchar("purpose", { length: 32 }).notNull().default("login"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  attempts: smallint("attempts").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("otp_phone_idx").on(table.phone),
  index("otp_lookup_idx").on(table.phone, table.purpose, table.usedAt),
  // P0: at most one active (unused) OTP per phone+purpose. Partial unique.
  uniqueIndex("otp_active_unique_idx").on(table.phone, table.purpose).where(sql`${table.usedAt} IS NULL`),
]);

export const adminRoles = pgTable("admin_roles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adminRolePermissions = pgTable("admin_role_permissions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  roleId: varchar("role_id", { length: 36 }).notNull().references(() => adminRoles.id, { onDelete: "cascade" }),
  permission: varchar("permission", { length: 120 }).notNull(),
}, (t) => [
  // P0: one row per (role, permission).
  uniqueIndex("role_permission_unique_idx").on(t.roleId, t.permission),
]);

export const adminUserRoles = pgTable("admin_user_roles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: varchar("role_id", { length: 36 }).notNull().references(() => adminRoles.id, { onDelete: "cascade" }),
  // P0 (additive): NULL = global role; non-NULL = restaurant-scoped role.
  restaurantId: varchar("restaurant_id", { length: 36 }).references(() => restaurants.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  // P0: split legacy unique(user,role) into global vs scoped partial uniques
  // so the same (user,role) can exist across different restaurants.
  uniqueIndex("admin_user_role_idx").on(t.userId, t.roleId).where(sql`${t.restaurantId} IS NULL`),
  uniqueIndex("admin_user_role_scoped_idx").on(t.userId, t.restaurantId, t.roleId).where(sql`${t.restaurantId} IS NOT NULL`),
]);

// =============================================================================
// CUSTOMER MANAGEMENT
// =============================================================================

export const customerProfiles = pgTable("customer_profiles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  mobileNumber: varchar("mobile_number", { length: 24 }),
  preferredName: varchar("preferred_name", { length: 120 }),
  adminNotes: text("admin_notes"),
  totalOrders: integer("total_orders").notNull().default(0),
  totalSpentPaise: integer("total_spent_paise").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  // Prevent duplicate verified customer profiles per phone number
  // PostgreSQL UNIQUE allows multiple NULLs, so guest profiles without phones are safe
  uniqueIndex("customer_phone_unique").on(t.mobileNumber),
]);

export const customerAddresses = pgTable("customer_addresses", {
  id: varchar("id", { length: 36 }).primaryKey(),
  customerId: varchar("customer_id", { length: 36 }).notNull().references(() => customerProfiles.id, { onDelete: "cascade" }),
  label: addressLabelEnum("label").default("Home").notNull(),
  flatHouse: varchar("flat_house", { length: 180 }).notNull(),
  building: varchar("building", { length: 180 }),
  street: varchar("street", { length: 180 }),
  landmark: varchar("landmark", { length: 180 }),
  area: varchar("area", { length: 180 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  postalCode: varchar("postal_code", { length: 16 }),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  // P0 (additive numeric mirrors; varchar kept for compat — prefer these).
  latitudeNum: numeric("latitude_num", { precision: 9, scale: 6 }),
  longitudeNum: numeric("longitude_num", { precision: 9, scale: 6 }),
  accuracyMeters: integer("accuracy_meters"),
  locationSource: varchar("location_source", { length: 32 }),
  placeId: varchar("place_id", { length: 256 }),
  deliveryInstructions: text("delivery_instructions"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  // P0: at most one default address per customer. Partial unique.
  uniqueIndex("customer_address_default_unique_idx").on(t.customerId).where(sql`${t.isDefault} = true`),
  // P0 (compat CHECK on legacy varchar coords; NULLs allowed).
  check("customer_addr_lat_fmt_chk", sql`${t.latitude} IS NULL OR ${t.latitude} ~ '^-?[0-9]+(\\.[0-9]+)?$'`),
  check("customer_addr_lng_fmt_chk", sql`${t.longitude} IS NULL OR ${t.longitude} ~ '^-?[0-9]+(\\.[0-9]+)?$'`),
]);

// =============================================================================
// RESTAURANT / BRAND MANAGEMENT
// =============================================================================

export const restaurants = pgTable("restaurants", {
  id: varchar("id", { length: 36 }).primaryKey(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"),
  cuisineSummary: varchar("cuisine_summary", { length: 255 }).notNull(),
  logoUrl: text("logo_url"),
  bannerImageUrl: text("banner_image_url"),
  primaryColor: varchar("primary_color", { length: 16 }).notNull().default("#C84630"),
  secondaryColor: varchar("secondary_color", { length: 16 }).notNull().default("#F7E4D3"),
  accentColor: varchar("accent_color", { length: 16 }).default("#38271F"),
  fontFamily: varchar("font_family", { length: 120 }).default("Playfair Display"),
  bodyFontFamily: varchar("body_font_family", { length: 120 }).default("Inter"),
  faviconUrl: text("favicon_url"),
  contactPhone: varchar("contact_phone", { length: 32 }),
  contactEmail: varchar("contact_email", { length: 320 }),
  address: text("address"),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  // P0 (additive numeric mirrors; varchar kept for compat — prefer these).
  latitudeNum: numeric("latitude_num", { precision: 9, scale: 6 }),
  longitudeNum: numeric("longitude_num", { precision: 9, scale: 6 }),
  gstNumber: varchar("gst_number", { length: 32 }),
  gstPercentage: numeric("gst_percentage", { precision: 5, scale: 2 }).default("0"),
  deliveryFeePaise: integer("delivery_fee_paise").notNull().default(3900),
  packagingFeePaise: integer("packaging_fee_paise").notNull().default(2500),
  minOrderPaise: integer("min_order_paise").notNull().default(19900),
  isOpen: boolean("is_open").notNull().default(true),
  opensAt: varchar("opens_at", { length: 24 }).notNull().default("11:00 AM"),
  allowScheduledOrders: boolean("allow_scheduled_orders").notNull().default(true),
  preparationMinutes: integer("preparation_minutes").notNull().default(25),
  deliveryRadiusKm: numeric("delivery_radius_km", { precision: 5, scale: 2 }).default("5"),
  tempClosureStart: timestamp("temp_closure_start"),
  tempClosureEnd: timestamp("temp_closure_end"),
  tempClosureMessage: varchar("temp_closure_message", { length: 500 }),
  razorpayAccountId: varchar("razorpay_account_id", { length: 64 }),
  platformFeePercent: numeric("platform_fee_percent", { precision: 5, scale: 2 }).default("0"),
  razorpayAccountStatus: varchar("razorpay_account_status", { length: 32 }).default("not_linked"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  check("restaurants_delivery_fee_nonneg_chk", sql`${t.deliveryFeePaise} >= 0`),
  check("restaurants_packaging_fee_nonneg_chk", sql`${t.packagingFeePaise} >= 0`),
  check("restaurants_min_order_nonneg_chk", sql`${t.minOrderPaise} >= 0`),
  // Compat CHECKs on legacy varchar coords; NULLs allowed.
  check("restaurants_lat_fmt_chk", sql`${t.latitude} IS NULL OR ${t.latitude} ~ '^-?[0-9]+(\\.[0-9]+)?$'`),
  check("restaurants_lng_fmt_chk", sql`${t.longitude} IS NULL OR ${t.longitude} ~ '^-?[0-9]+(\\.[0-9]+)?$'`),
]);

export const restaurantSchedules = pgTable("restaurant_schedules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  openTime: varchar("open_time", { length: 8 }).notNull(),
  closeTime: varchar("close_time", { length: 8 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("rest_schedule_day_idx").on(t.restaurantId, t.dayOfWeek)]);

// =============================================================================
// OUTLETS
// =============================================================================

export const outlets = pgTable("outlets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 180 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  postalCode: varchar("postal_code", { length: 16 }),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  // P0 (additive numeric mirrors; varchar kept for compat — prefer these).
  latitudeNum: numeric("latitude_num", { precision: 9, scale: 6 }),
  longitudeNum: numeric("longitude_num", { precision: 9, scale: 6 }),
  phone: varchar("phone", { length: 24 }),
  preparationMinutes: integer("preparation_minutes").notNull().default(25),
  deliveryRadiusKm: numeric("delivery_radius_km", { precision: 5, scale: 2 }).default("5"),
  isActive: boolean("is_active").notNull().default(true),
  isOpen: boolean("is_open").notNull().default(true),
  coordinatesConfirmedAt: timestamp("coordinates_confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("outlet_restaurant_idx").on(t.restaurantId),
  check("outlets_lat_fmt_chk", sql`${t.latitude} IS NULL OR ${t.latitude} ~ '^-?[0-9]+(\\.[0-9]+)?$'`),
  check("outlets_lng_fmt_chk", sql`${t.longitude} IS NULL OR ${t.longitude} ~ '^-?[0-9]+(\\.[0-9]+)?$'`),
]);

export const outletSchedules = pgTable("outlet_schedules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  outletId: varchar("outlet_id", { length: 36 }).notNull().references(() => outlets.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  openTime: varchar("open_time", { length: 8 }).notNull(),
  closeTime: varchar("close_time", { length: 8 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("outlet_schedule_day_idx").on(t.outletId, t.dayOfWeek)]);

// =============================================================================
// MENU CATEGORIES
// =============================================================================

export const menuCategories = pgTable("menu_categories", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  iconEmoji: varchar("icon_emoji", { length: 8 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  isOpen: boolean("is_open").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("category_slug_per_restaurant").on(t.restaurantId, t.slug)]);

export const categorySchedules = pgTable("category_schedules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  categoryId: varchar("category_id", { length: 36 }).notNull().references(() => menuCategories.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week"),
  openTime: varchar("open_time", { length: 8 }),
  closeTime: varchar("close_time", { length: 8 }),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [index("cat_schedule_idx").on(t.categoryId)]);

// =============================================================================
// MENU ITEMS / PRODUCTS
// =============================================================================

export const menuItems = pgTable("menu_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id", { length: 36 }).notNull().references(() => menuCategories.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 64 }),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 180 }),
  description: text("description"),
  shortDescription: varchar("short_description", { length: 300 }),
  pricePaise: integer("price_paise").notNull(),
  offerPricePaise: integer("offer_price_paise"),
  costPricePaise: integer("cost_price_paise"),
  imageUrl: text("image_url"),
  dietaryType: dietaryTypeEnum("dietary_type").notNull().default("veg"),
  tag: varchar("tag", { length: 48 }),
  isBestseller: boolean("is_bestseller").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  isRecommended: boolean("is_recommended").notNull().default(false),
  spiceLevel: smallint("spice_level"),
  preparationMinutes: integer("preparation_minutes"),
  availability: availabilityEnum("availability").notNull().default("AVAILABLE"),
  availableNote: varchar("available_note", { length: 160 }),
  isOpen: boolean("is_open").notNull().default(true),
  isCustomizable: boolean("is_customizable").notNull().default(false),
  taxPercent: numeric("tax_percent", { precision: 5, scale: 2 }).default("0"),
  packagingFeePaise: integer("packaging_fee_paise").default(0),
  stock: integer("stock"),
  maxQuantityPerOrder: integer("max_quantity_per_order").default(10),
  sortOrder: integer("sort_order").notNull().default(0),
  tags: jsonb("tags").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("menu_item_restaurant_idx").on(t.restaurantId),
  index("menu_item_category_idx").on(t.categoryId),
  index("menu_item_sku_idx").on(t.restaurantId, t.sku),
  // P0: SKU unique per restaurant when set (NULL SKUs allowed). Partial unique.
  uniqueIndex("menu_item_sku_unique_idx").on(t.restaurantId, t.sku).where(sql`${t.sku} IS NOT NULL`),
  check("menu_item_price_pos_chk", sql`${t.pricePaise} > 0`),
  check("menu_item_stock_nonneg_chk", sql`${t.stock} IS NULL OR ${t.stock} >= 0`),
]);

export const menuItemImages = pgTable("menu_item_images", {
  id: varchar("id", { length: 36 }).primaryKey(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  altText: varchar("alt_text", { length: 255 }),
});

export const productSchedules = pgTable("product_schedules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week"),
  openTime: varchar("open_time", { length: 8 }),
  closeTime: varchar("close_time", { length: 8 }),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [index("product_schedule_idx").on(t.menuItemId)]);

// =============================================================================
// PRODUCT VARIANTS & ADD-ONS
// =============================================================================

export const productVariants = pgTable("product_variants", {
  id: varchar("id", { length: 36 }).primaryKey(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  pricePaise: integer("price_paise").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [
  check("product_variant_price_nonneg_chk", sql`${t.pricePaise} >= 0`),
]);

export const addonGroups = pgTable("addon_groups", {
  id: varchar("id", { length: 36 }).primaryKey(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  selectionType: modifierSelectionTypeEnum("selection_type").notNull().default("single"),
  isRequired: boolean("is_required").notNull().default(false),
  minSelections: integer("min_selections").notNull().default(0),
  maxSelections: integer("max_selections").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const addonOptions = pgTable("addon_options", {
  id: varchar("id", { length: 36 }).primaryKey(),
  addonGroupId: varchar("addon_group_id", { length: 36 }).notNull().references(() => addonGroups.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  pricePaise: integer("price_paise").notNull().default(0),
  isAvailable: boolean("is_available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [
  check("addon_option_price_nonneg_chk", sql`${t.pricePaise} >= 0`),
]);

// =============================================================================
// CART
// =============================================================================

export const carts = pgTable("carts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  outletId: varchar("outlet_id", { length: 36 }).notNull().references(() => outlets.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id", { length: 36 }).references(() => customerProfiles.id, { onDelete: "set null" }),
  sessionKey: varchar("session_key", { length: 96 }),
  couponCode: varchar("coupon_code", { length: 48 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cartItems = pgTable("cart_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  cartId: varchar("cart_id", { length: 36 }).notNull().references(() => carts.id, { onDelete: "cascade" }),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  selectedVariantId: varchar("selected_variant_id", { length: 36 }),
  selectedModifiers: jsonb("selected_modifiers").$type<Array<{
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    pricePaise: number;
  }>>().notNull(),
  specialInstructions: varchar("special_instructions", { length: 300 }),
  unitPricePaise: integer("unit_price_paise").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  check("cart_item_qty_pos_chk", sql`${t.quantity} > 0`),
  check("cart_item_unit_price_nonneg_chk", sql`${t.unitPricePaise} >= 0`),
]);

// =============================================================================
// ORDERS
// =============================================================================

export const orders = pgTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderNumber: varchar("order_number", { length: 32 }).notNull().unique(),
  trackingToken: varchar("tracking_token", { length: 36 }).notNull().unique(),
  // P0 (additive): client-supplied idempotency key for safe order retries.
  idempotencyKey: varchar("idempotency_key", { length: 64 }),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  outletId: varchar("outlet_id", { length: 36 }).notNull().references(() => outlets.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id", { length: 36 }).references(() => customerProfiles.id, { onDelete: "set null" }),
  status: orderStatusEnum("status").notNull().default("PENDING_PAYMENT"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("PENDING"),
  fulfillmentType: fulfillmentTypeEnum("fulfillment_type").notNull().default("DELIVERY"),
  orderSource: orderSourceEnum("order_source").notNull().default("DIRECT"),
  customerName: varchar("customer_name", { length: 180 }),
  customerPhone: varchar("customer_phone", { length: 24 }),
  customerEmail: varchar("customer_email", { length: 320 }),
  addressSnapshot: jsonb("address_snapshot").$type<Record<string, unknown>>().notNull(),
  itemTotalPaise: integer("item_total_paise").notNull(),
  discountPaise: integer("discount_paise").notNull().default(0),
  packagingFeePaise: integer("packaging_fee_paise").notNull().default(0),
  deliveryFeePaise: integer("delivery_fee_paise").notNull().default(0),
  taxPaise: integer("tax_paise").notNull().default(0),
  totalPaise: integer("total_paise").notNull(),
  couponCode: varchar("coupon_code", { length: 48 }),
  couponDiscountPaise: integer("coupon_discount_paise").notNull().default(0),
  deliveryNotes: text("delivery_notes"),
  specialInstructions: text("special_instructions"),
  cutleryPreference: boolean("cutlery_preference").notNull().default(false),
  estimatedMinutes: integer("estimated_minutes"),
  scheduledFor: timestamp("scheduled_for"),
  acceptedAt: timestamp("accepted_at"),
  preparingAt: timestamp("preparing_at"),
  readyAt: timestamp("ready_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: varchar("cancel_reason", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("order_restaurant_status_idx").on(t.restaurantId, t.status),
  index("order_customer_idx").on(t.customerId),
  index("order_created_idx").on(t.createdAt),
  // P0: idempotency — at most one order per key (NULL keys allowed for legacy rows).
  uniqueIndex("order_idempotency_key_unique_idx").on(t.idempotencyKey).where(sql`${t.idempotencyKey} IS NOT NULL`),
  check("order_item_total_nonneg_chk", sql`${t.itemTotalPaise} >= 0`),
  check("order_total_nonneg_chk", sql`${t.totalPaise} >= 0`),
  check("order_discount_nonneg_chk", sql`${t.discountPaise} >= 0`),
]);

export const orderItems = pgTable("order_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  // P0: keep line items when the menu item is removed (snapshot columns preserve display).
  menuItemId: varchar("menu_item_id", { length: 36 }).references(() => menuItems.id, { onDelete: "set null" }),
  itemNameSnapshot: varchar("item_name_snapshot", { length: 180 }).notNull(),
  unitPricePaise: integer("unit_price_paise").notNull(),
  quantity: integer("quantity").notNull(),
  dietaryType: dietaryTypeEnum("dietary_type"),
  selectedVariantId: varchar("selected_variant_id", { length: 36 }),
  variantNameSnapshot: varchar("variant_name_snapshot", { length: 120 }),
  selectedModifiers: jsonb("selected_modifiers").$type<Array<{
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    pricePaise: number;
  }>>().notNull(),
  specialInstructions: varchar("special_instructions", { length: 300 }),
}, (t) => [
  check("order_item_qty_pos_chk", sql`${t.quantity} > 0`),
  check("order_item_unit_price_nonneg_chk", sql`${t.unitPricePaise} >= 0`),
]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  status: orderStatusEnum("status").notNull(),
  note: varchar("note", { length: 500 }),
  actorId: integer("actor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("order_history_order_idx").on(t.orderId, t.createdAt)]);

// =============================================================================
// PAYMENTS
// =============================================================================

export const payments = pgTable("payments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 64 }).notNull().default("razorpay"),
  providerOrderId: varchar("provider_order_id", { length: 120 }),
  providerPaymentId: varchar("provider_payment_id", { length: 120 }),
  status: paymentProviderStatusEnum("status").notNull().default("CREATED"),
  amountPaise: integer("amount_paise").notNull(),
  method: varchar("method", { length: 64 }),
  failureReason: varchar("failure_reason", { length: 500 }),
  providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
  transferAmountPaise: integer("transfer_amount_paise"),
  platformFeePaise: integer("platform_fee_paise"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("payment_order_idx").on(t.orderId),
  // P0: provider ids must be globally unique when present. Partial uniques.
  uniqueIndex("payment_provider_order_unique_idx").on(t.providerOrderId).where(sql`${t.providerOrderId} IS NOT NULL`),
  uniqueIndex("payment_provider_payment_unique_idx").on(t.providerPaymentId).where(sql`${t.providerPaymentId} IS NOT NULL`),
  check("payment_amount_pos_chk", sql`${t.amountPaise} > 0`),
]);

export const refunds = pgTable("refunds", {
  id: varchar("id", { length: 36 }).primaryKey(),
  paymentId: varchar("payment_id", { length: 36 }).notNull().references(() => payments.id, { onDelete: "cascade" }),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  providerRefundId: varchar("provider_refund_id", { length: 120 }),
  amountPaise: integer("amount_paise").notNull(),
  reason: varchar("reason", { length: 500 }),
  status: refundStatusEnum("status").notNull().default("PENDING"),
  // P0: keep refund rows when the initiating admin is removed.
  initiatedBy: integer("initiated_by").references(() => users.id, { onDelete: "set null" }),
  providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("refund_provider_unique_idx").on(t.providerRefundId).where(sql`${t.providerRefundId} IS NOT NULL`),
  check("refund_amount_pos_chk", sql`${t.amountPaise} > 0`),
]);

// =============================================================================
// DELIVERY (Shadowfax integration)
// =============================================================================

export const deliveries = pgTable("deliveries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 64 }).notNull().default("shadowfax"),
  providerDeliveryId: varchar("provider_delivery_id", { length: 120 }),
  trackingId: varchar("tracking_id", { length: 120 }),
  // P0: stays varchar for compat; CHECK below constrains to deliveryStatusEnum
  // values. Migrate to deliveryStatusEnum column in a future breaking migration.
  status: varchar("status", { length: 64 }).notNull().default("PENDING"),
  riderName: varchar("rider_name", { length: 120 }),
  riderPhone: varchar("rider_phone", { length: 24 }),
  riderLocation: jsonb("rider_location").$type<{ lat: number; lng: number }>(),
  quotedChargePaise: integer("quoted_charge_paise"),
  finalChargePaise: integer("final_charge_paise"),
  estimatedPickup: timestamp("estimated_pickup"),
  estimatedDelivery: timestamp("estimated_delivery"),
  actualPickup: timestamp("actual_pickup"),
  actualDelivery: timestamp("actual_delivery"),
  trackingUrl: varchar("tracking_url", { length: 500 }),
  providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("delivery_order_idx").on(t.orderId),
  // P0: one live delivery row per order; terminal CANCELLED/FAILED rows are
  // excluded so retries/replacements can be recorded.
  uniqueIndex("delivery_order_live_unique_idx").on(t.orderId).where(sql`${t.status} NOT IN ('CANCELLED', 'FAILED')`),
  uniqueIndex("delivery_provider_unique_idx").on(t.providerDeliveryId).where(sql`${t.providerDeliveryId} IS NOT NULL`),
  check("delivery_status_allowed_chk", sql`${t.status} IN ('PENDING','QUOTED','REQUESTED','ASSIGNED','RIDER_ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','FAILED')`),
  check("delivery_quoted_charge_nonneg_chk", sql`${t.quotedChargePaise} IS NULL OR ${t.quotedChargePaise} >= 0`),
  check("delivery_final_charge_nonneg_chk", sql`${t.finalChargePaise} IS NULL OR ${t.finalChargePaise} >= 0`),
]);

export const deliveryStatusHistory = pgTable("delivery_status_history", {
  id: varchar("id", { length: 36 }).primaryKey(),
  deliveryId: varchar("delivery_id", { length: 36 }).notNull().references(() => deliveries.id, { onDelete: "cascade" }),
  // P0: varchar for compat; CHECK constrains to deliveryStatusEnum values.
  status: varchar("status", { length: 64 }).notNull(),
  note: varchar("note", { length: 500 }),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("delivery_history_idx").on(t.deliveryId, t.createdAt)]);

// =============================================================================
// COUPONS
// =============================================================================

export const coupons = pgTable("coupons", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 48 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  discountType: discountTypeEnum("discount_type").notNull().default("flat"),
  discountValue: integer("discount_value").notNull(),
  minOrderPaise: integer("min_order_paise").notNull().default(0),
  maxDiscountPaise: integer("max_discount_paise"),
  totalUsageLimit: integer("total_usage_limit"),
  perCustomerLimit: integer("per_customer_limit").default(1),
  isNewCustomerOnly: boolean("is_new_customer_only").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("coupon_code_per_restaurant").on(t.restaurantId, t.code)]);

export const couponUsage = pgTable("coupon_usage", {
  id: varchar("id", { length: 36 }).primaryKey(),
  couponId: varchar("coupon_id", { length: 36 }).notNull().references(() => coupons.id, { onDelete: "cascade" }),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id", { length: 36 }).references(() => customerProfiles.id, { onDelete: "set null" }),
  discountPaise: integer("discount_paise").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("coupon_usage_idx").on(t.couponId, t.customerId),
  // P0: one coupon application per order.
  uniqueIndex("coupon_usage_order_unique_idx").on(t.orderId),
  check("coupon_usage_discount_nonneg_chk", sql`${t.discountPaise} >= 0`),
]);

// =============================================================================
// WEBHOOKS
// =============================================================================

export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  provider: varchar("provider", { length: 64 }).notNull(),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  externalId: varchar("external_id", { length: 120 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  // P0 (additive): link back to the payment when the webhook can be matched.
  paymentId: varchar("payment_id", { length: 36 }).references(() => payments.id, { onDelete: "set null" }),
  processed: boolean("processed").notNull().default(false),
  processingError: varchar("processing_error", { length: 1000 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("webhook_event_idx").on(t.provider, t.externalId),
  index("webhook_payment_idx").on(t.paymentId),
]);

// =============================================================================
// BULK IMPORT
// =============================================================================

export const importJobs = pgTable("import_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  type: importJobTypeEnum("type").notNull().default("products"),
  status: importJobStatusEnum("status").notNull().default("PENDING"),
  fileName: varchar("file_name", { length: 255 }),
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  errorRows: integer("error_rows").default(0),
  errorReportUrl: varchar("error_report_url", { length: 500 }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// =============================================================================
// AUDIT LOG
// =============================================================================

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorName: varchar("actor_name", { length: 180 }),
  action: varchar("action", { length: 120 }).notNull(),
  targetType: varchar("target_type", { length: 64 }).notNull(),
  targetId: varchar("target_id", { length: 64 }),
  restaurantId: varchar("restaurant_id", { length: 36 }).references(() => restaurants.id, { onDelete: "set null" }),
  beforeData: jsonb("before_data").$type<Record<string, unknown>>(),
  afterData: jsonb("after_data").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("audit_actor_idx").on(t.actorId), index("audit_target_idx").on(t.targetType, t.targetId), index("audit_restaurant_idx").on(t.restaurantId)]);

// =============================================================================
// SETTINGS
// =============================================================================

export const settings = pgTable("settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  key: varchar("key", { length: 120 }).notNull(),
  value: text("value"),
  category: varchar("category", { length: 64 }).notNull().default("general"),
  description: varchar("description", { length: 500 }),
  restaurantId: varchar("restaurant_id", { length: 36 }).references(() => restaurants.id, { onDelete: "cascade" }),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  // Legacy composite unique kept for compat (NULL restaurantId rows are exempt
  // from uniqueness in Postgres, hence the partials below).
  uniqueIndex("settings_key_restaurant_idx").on(t.key, t.restaurantId),
  // P0: global settings — one row per key where restaurant is NULL.
  uniqueIndex("settings_global_key_unique_idx").on(t.key).where(sql`${t.restaurantId} IS NULL`),
  // P0: scoped settings — one row per (key, restaurant) where set.
  uniqueIndex("settings_scoped_key_unique_idx").on(t.key, t.restaurantId).where(sql`${t.restaurantId} IS NOT NULL`),
]);

// =============================================================================
// INTEGRATION SECRETS (encrypted)
// =============================================================================

export const integrationSecrets = pgTable("integration_secrets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 48 }).notNull(),
  keyName: varchar("key_name", { length: 96 }).notNull(),
  cipherText: text("cipher_text").notNull(),
  iv: varchar("iv", { length: 64 }).notNull(),
  authTag: varchar("auth_tag", { length: 64 }).notNull(),
  updatedByUserId: integer("updated_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("integration_secret_key_idx").on(t.restaurantId, t.provider, t.keyName)]);

// =============================================================================
// MULTI-TENANT: Restaurant Members & Custom Domains
// =============================================================================

export const restaurantMembers = pgTable("restaurant_members", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  role: restaurantMemberRoleEnum("role").notNull().default("staff"),
  invitedByUserId: integer("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("restaurant_member_user_idx").on(t.userId, t.restaurantId),
  index("restaurant_member_restaurant_idx").on(t.restaurantId),
]);

export const customDomains = pgTable("custom_domains", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  domain: varchar("domain", { length: 253 }).notNull().unique(),
  isVerified: boolean("is_verified").notNull().default(false),
  verifiedAt: timestamp("verified_at"),
  sslStatus: sslStatusEnum("ssl_status").notNull().default("pending"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("custom_domain_restaurant_idx").on(t.restaurantId),
  // P0: at most one primary domain per restaurant. Partial unique.
  uniqueIndex("custom_domain_primary_unique_idx").on(t.restaurantId).where(sql`${t.isPrimary} = true`),
]);

// =============================================================================
// BILLING / SUBSCRIPTIONS
// =============================================================================

export const subscriptionPlanEnum = pgEnum("subscription_plan", ["free", "pro", "enterprise"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "trialing", "past_due", "cancelled", "expired"]);

export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  tier: subscriptionPlanEnum("tier").notNull(),
  pricePaiseMonthly: integer("price_paise_monthly").notNull().default(0),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  maxOutlets: integer("max_outlets").notNull().default(1),
  maxMenuItems: integer("max_menu_items").notNull().default(50),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const restaurantSubscriptions = pgTable("restaurant_subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  planId: varchar("plan_id", { length: 36 }).notNull().references(() => subscriptionPlans.id),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at"),
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  paymentProviderId: varchar("payment_provider_id", { length: 120 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("restaurant_subscription_idx").on(t.restaurantId),
  // P0: at most one live (active/trialing) subscription per restaurant.
  uniqueIndex("restaurant_subscription_active_unique_idx").on(t.restaurantId).where(sql`${t.status} IN ('active', 'trialing')`),
]);

// =============================================================================
// INVENTORY & RECIPE MANAGEMENT
// =============================================================================

export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["IN", "OUT", "WASTAGE", "ADJUSTMENT"]);
export const stockReferenceTypeEnum = pgEnum("stock_reference_type", ["PURCHASE", "SALE", "WASTAGE", "MANUAL"]);
export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", ["DRAFT", "SENT", "RECEIVED", "CANCELLED"]);

export const suppliers = pgTable("suppliers", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 180 }).notNull(),
  phone: varchar("phone", { length: 24 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("supplier_restaurant_idx").on(t.restaurantId)]);

export const rawMaterials = pgTable("raw_materials", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 180 }).notNull(),
  unit: varchar("unit", { length: 16 }).notNull(),
  currentStock: numeric("current_stock", { precision: 12, scale: 3 }).notNull().default("0"),
  minStock: numeric("min_stock", { precision: 12, scale: 3 }).notNull().default("0"),
  costPerUnitPaise: integer("cost_per_unit_paise").notNull().default(0),
  supplierId: varchar("supplier_id", { length: 36 }).references(() => suppliers.id, { onDelete: "set null" }),
  category: varchar("category", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("raw_material_restaurant_idx").on(t.restaurantId),
  check("raw_material_stock_nonneg_chk", sql`${t.currentStock} >= 0`),
  check("raw_material_min_stock_nonneg_chk", sql`${t.minStock} >= 0`),
]);

export const recipes = pgTable("recipes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: varchar("id", { length: 36 }).primaryKey(),
  recipeId: varchar("recipe_id", { length: 36 }).notNull().references(() => recipes.id, { onDelete: "cascade" }),
  rawMaterialId: varchar("raw_material_id", { length: 36 }).notNull().references(() => rawMaterials.id, { onDelete: "cascade" }),
  quantityPerServing: numeric("quantity_per_serving", { precision: 12, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 16 }).notNull(),
});

export const stockMovements = pgTable("stock_movements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  rawMaterialId: varchar("raw_material_id", { length: 36 }).notNull().references(() => rawMaterials.id, { onDelete: "cascade" }),
  type: stockMovementTypeEnum("type").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  referenceType: stockReferenceTypeEnum("reference_type").notNull(),
  referenceId: varchar("reference_id", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("stock_movement_restaurant_idx").on(t.restaurantId),
  index("stock_movement_material_idx").on(t.rawMaterialId),
]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  supplierId: varchar("supplier_id", { length: 36 }).references(() => suppliers.id, { onDelete: "set null" }),
  status: purchaseOrderStatusEnum("status").notNull().default("DRAFT"),
  totalPaise: integer("total_paise").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  receivedAt: timestamp("received_at"),
}, (t) => [
  index("po_restaurant_idx").on(t.restaurantId),
  check("po_total_nonneg_chk", sql`${t.totalPaise} >= 0`),
]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  purchaseOrderId: varchar("purchase_order_id", { length: 36 }).notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  rawMaterialId: varchar("raw_material_id", { length: 36 }).notNull().references(() => rawMaterials.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unitCostPaise: integer("unit_cost_paise").notNull(),
}, (t) => [
  check("po_item_unit_cost_nonneg_chk", sql`${t.unitCostPaise} >= 0`),
]);

// =============================================================================
// LOYALTY PROGRAM
// =============================================================================

export const loyaltyTransactionTypeEnum = pgEnum("loyalty_transaction_type", ["EARN", "REDEEM", "EXPIRE"]);

export const loyaltyPrograms = pgTable("loyalty_programs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull().default("Rewards"),
  pointsPerRupee: numeric("points_per_rupee", { precision: 5, scale: 2 }).notNull().default("1"),
  redemptionRatePaise: integer("redemption_rate_paise").notNull().default(100),
  maxRedemptionPercent: integer("max_redemption_percent").notNull().default(50),
  // P0 (additive): absolute cap per redemption in paise (NULL = no cap).
  maxRedemptionPaise: integer("max_redemption_paise"),
  pointsExpiryDays: integer("points_expiry_days").notNull().default(365),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("loyalty_program_restaurant_idx").on(t.restaurantId),
  check("loyalty_max_redemption_nonneg_chk", sql`${t.maxRedemptionPaise} IS NULL OR ${t.maxRedemptionPaise} >= 0`),
]);

export const loyaltyBalances = pgTable("loyalty_balances", {
  id: varchar("id", { length: 36 }).primaryKey(),
  customerId: varchar("customer_id", { length: 36 }).notNull().references(() => customerProfiles.id, { onDelete: "cascade" }),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  points: integer("points").notNull().default(0),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  tier: varchar("tier", { length: 32 }).notNull().default("bronze"),
  lastEarnedAt: timestamp("last_earned_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("loyalty_balance_customer_restaurant_idx").on(t.customerId, t.restaurantId),
  check("loyalty_balance_points_nonneg_chk", sql`${t.points} >= 0`),
  check("loyalty_balance_lifetime_nonneg_chk", sql`${t.lifetimePoints} >= 0`),
]);

export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  customerId: varchar("customer_id", { length: 36 }).notNull().references(() => customerProfiles.id, { onDelete: "cascade" }),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  type: loyaltyTransactionTypeEnum("type").notNull(),
  points: integer("points").notNull(),
  // P0 (additive FK): keep txn rows when the order is removed.
  orderId: varchar("order_id", { length: 36 }).references(() => orders.id, { onDelete: "set null" }),
  description: varchar("description", { length: 300 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("loyalty_txn_customer_idx").on(t.customerId, t.restaurantId),
  index("loyalty_txn_order_idx").on(t.orderId),
]);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type OrderStatus = typeof orders.$inferSelect.status;
export type PaymentStatus = typeof payments.$inferSelect.status;
export type MenuItemRow = typeof menuItems.$inferSelect;
export type RestaurantRow = typeof restaurants.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
