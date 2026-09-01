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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("users_email_unique_idx").on(t.email).where(sql`${t.email} IS NOT NULL`),
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
  roleId: varchar("role_id", { length: 36 }).notNull().references(() => adminRoles.id),
  permission: varchar("permission", { length: 120 }).notNull(),
});

export const adminUserRoles = pgTable("admin_user_roles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  roleId: varchar("role_id", { length: 36 }).notNull().references(() => adminRoles.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("admin_user_role_idx").on(t.userId, t.roleId)]);

// =============================================================================
// CUSTOMER MANAGEMENT
// =============================================================================

export const customerProfiles = pgTable("customer_profiles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id),
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
  customerId: varchar("customer_id", { length: 36 }).notNull().references(() => customerProfiles.id),
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
  accuracyMeters: integer("accuracy_meters"),
  locationSource: varchar("location_source", { length: 32 }),
  placeId: varchar("place_id", { length: 256 }),
  deliveryInstructions: text("delivery_instructions"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
});

export const restaurantSchedules = pgTable("restaurant_schedules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
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
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  name: varchar("name", { length: 180 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  postalCode: varchar("postal_code", { length: 16 }),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  phone: varchar("phone", { length: 24 }),
  preparationMinutes: integer("preparation_minutes").notNull().default(25),
  deliveryRadiusKm: numeric("delivery_radius_km", { precision: 5, scale: 2 }).default("5"),
  isActive: boolean("is_active").notNull().default(true),
  isOpen: boolean("is_open").notNull().default(true),
  coordinatesConfirmedAt: timestamp("coordinates_confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("outlet_restaurant_idx").on(t.restaurantId)]);

export const outletSchedules = pgTable("outlet_schedules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  outletId: varchar("outlet_id", { length: 36 }).notNull().references(() => outlets.id),
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
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
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
  categoryId: varchar("category_id", { length: 36 }).notNull().references(() => menuCategories.id),
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
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  categoryId: varchar("category_id", { length: 36 }).notNull().references(() => menuCategories.id),
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
]);

export const menuItemImages = pgTable("menu_item_images", {
  id: varchar("id", { length: 36 }).primaryKey(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  altText: varchar("alt_text", { length: 255 }),
});

export const productSchedules = pgTable("product_schedules", {
  id: varchar("id", { length: 36 }).primaryKey(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id),
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
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id),
  name: varchar("name", { length: 120 }).notNull(),
  pricePaise: integer("price_paise").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const addonGroups = pgTable("addon_groups", {
  id: varchar("id", { length: 36 }).primaryKey(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id),
  name: varchar("name", { length: 120 }).notNull(),
  selectionType: modifierSelectionTypeEnum("selection_type").notNull().default("single"),
  isRequired: boolean("is_required").notNull().default(false),
  minSelections: integer("min_selections").notNull().default(0),
  maxSelections: integer("max_selections").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const addonOptions = pgTable("addon_options", {
  id: varchar("id", { length: 36 }).primaryKey(),
  addonGroupId: varchar("addon_group_id", { length: 36 }).notNull().references(() => addonGroups.id),
  name: varchar("name", { length: 120 }).notNull(),
  pricePaise: integer("price_paise").notNull().default(0),
  isAvailable: boolean("is_available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// =============================================================================
// CART
// =============================================================================

export const carts = pgTable("carts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  outletId: varchar("outlet_id", { length: 36 }).notNull().references(() => outlets.id),
  customerId: varchar("customer_id", { length: 36 }).references(() => customerProfiles.id),
  sessionKey: varchar("session_key", { length: 96 }),
  couponCode: varchar("coupon_code", { length: 48 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cartItems = pgTable("cart_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  cartId: varchar("cart_id", { length: 36 }).notNull().references(() => carts.id),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id),
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
});

// =============================================================================
// ORDERS
// =============================================================================

export const orders = pgTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderNumber: varchar("order_number", { length: 32 }).notNull().unique(),
  trackingToken: varchar("tracking_token", { length: 36 }).notNull().unique(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  outletId: varchar("outlet_id", { length: 36 }).notNull().references(() => outlets.id),
  customerId: varchar("customer_id", { length: 36 }).references(() => customerProfiles.id),
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
]);

export const orderItems = pgTable("order_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  menuItemId: varchar("menu_item_id", { length: 36 }).references(() => menuItems.id),
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
});

export const orderStatusHistory = pgTable("order_status_history", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
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
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
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
}, (t) => [index("payment_order_idx").on(t.orderId)]);

export const refunds = pgTable("refunds", {
  id: varchar("id", { length: 36 }).primaryKey(),
  paymentId: varchar("payment_id", { length: 36 }).notNull().references(() => payments.id),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  providerRefundId: varchar("provider_refund_id", { length: 120 }),
  amountPaise: integer("amount_paise").notNull(),
  reason: varchar("reason", { length: 500 }),
  status: refundStatusEnum("status").notNull().default("PENDING"),
  initiatedBy: integer("initiated_by").references(() => users.id),
  providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =============================================================================
// DELIVERY (Shadowfax integration)
// =============================================================================

export const deliveries = pgTable("deliveries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  provider: varchar("provider", { length: 64 }).notNull().default("shadowfax"),
  providerDeliveryId: varchar("provider_delivery_id", { length: 120 }),
  trackingId: varchar("tracking_id", { length: 120 }),
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
}, (t) => [index("delivery_order_idx").on(t.orderId)]);

export const deliveryStatusHistory = pgTable("delivery_status_history", {
  id: varchar("id", { length: 36 }).primaryKey(),
  deliveryId: varchar("delivery_id", { length: 36 }).notNull().references(() => deliveries.id),
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
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
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
  couponId: varchar("coupon_id", { length: 36 }).notNull().references(() => coupons.id),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  customerId: varchar("customer_id", { length: 36 }).references(() => customerProfiles.id),
  discountPaise: integer("discount_paise").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("coupon_usage_idx").on(t.couponId, t.customerId)]);

// =============================================================================
// WEBHOOKS
// =============================================================================

export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  provider: varchar("provider", { length: 64 }).notNull(),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  externalId: varchar("external_id", { length: 120 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  processed: boolean("processed").notNull().default(false),
  processingError: varchar("processing_error", { length: 1000 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("webhook_event_idx").on(t.provider, t.externalId)]);

// =============================================================================
// BULK IMPORT
// =============================================================================

export const importJobs = pgTable("import_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  type: importJobTypeEnum("type").notNull().default("products"),
  status: importJobStatusEnum("status").notNull().default("PENDING"),
  fileName: varchar("file_name", { length: 255 }),
  totalRows: integer("total_rows").default(0),
  processedRows: integer("processed_rows").default(0),
  errorRows: integer("error_rows").default(0),
  errorReportUrl: varchar("error_report_url", { length: 500 }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// =============================================================================
// AUDIT LOG
// =============================================================================

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  actorId: integer("actor_id").references(() => users.id),
  actorName: varchar("actor_name", { length: 180 }),
  action: varchar("action", { length: 120 }).notNull(),
  targetType: varchar("target_type", { length: 64 }).notNull(),
  targetId: varchar("target_id", { length: 64 }),
  restaurantId: varchar("restaurant_id", { length: 36 }).references(() => restaurants.id),
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
  restaurantId: varchar("restaurant_id", { length: 36 }).references(() => restaurants.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("settings_key_restaurant_idx").on(t.key, t.restaurantId)]);

// =============================================================================
// INTEGRATION SECRETS (encrypted)
// =============================================================================

export const integrationSecrets = pgTable("integration_secrets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
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
  userId: integer("user_id").notNull().references(() => users.id),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  role: restaurantMemberRoleEnum("role").notNull().default("staff"),
  invitedByUserId: integer("invited_by_user_id").references(() => users.id),
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("restaurant_member_user_idx").on(t.userId, t.restaurantId),
  index("restaurant_member_restaurant_idx").on(t.restaurantId),
]);

export const customDomains = pgTable("custom_domains", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  domain: varchar("domain", { length: 253 }).notNull().unique(),
  isVerified: boolean("is_verified").notNull().default(false),
  verifiedAt: timestamp("verified_at"),
  sslStatus: sslStatusEnum("ssl_status").notNull().default("pending"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("custom_domain_restaurant_idx").on(t.restaurantId),
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
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
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
]);

// =============================================================================
// INVENTORY & RECIPE MANAGEMENT
// =============================================================================

export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["IN", "OUT", "WASTAGE", "ADJUSTMENT"]);
export const stockReferenceTypeEnum = pgEnum("stock_reference_type", ["PURCHASE", "SALE", "WASTAGE", "MANUAL"]);
export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", ["DRAFT", "SENT", "RECEIVED", "CANCELLED"]);

export const suppliers = pgTable("suppliers", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  name: varchar("name", { length: 180 }).notNull(),
  phone: varchar("phone", { length: 24 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("supplier_restaurant_idx").on(t.restaurantId)]);

export const rawMaterials = pgTable("raw_materials", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  name: varchar("name", { length: 180 }).notNull(),
  unit: varchar("unit", { length: 16 }).notNull(),
  currentStock: numeric("current_stock", { precision: 12, scale: 3 }).notNull().default("0"),
  minStock: numeric("min_stock", { precision: 12, scale: 3 }).notNull().default("0"),
  costPerUnitPaise: integer("cost_per_unit_paise").notNull().default(0),
  supplierId: varchar("supplier_id", { length: 36 }).references(() => suppliers.id),
  category: varchar("category", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("raw_material_restaurant_idx").on(t.restaurantId)]);

export const recipes = pgTable("recipes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  menuItemId: varchar("menu_item_id", { length: 36 }).notNull().references(() => menuItems.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: varchar("id", { length: 36 }).primaryKey(),
  recipeId: varchar("recipe_id", { length: 36 }).notNull().references(() => recipes.id),
  rawMaterialId: varchar("raw_material_id", { length: 36 }).notNull().references(() => rawMaterials.id),
  quantityPerServing: numeric("quantity_per_serving", { precision: 12, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 16 }).notNull(),
});

export const stockMovements = pgTable("stock_movements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  rawMaterialId: varchar("raw_material_id", { length: 36 }).notNull().references(() => rawMaterials.id),
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
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  supplierId: varchar("supplier_id", { length: 36 }).references(() => suppliers.id),
  status: purchaseOrderStatusEnum("status").notNull().default("DRAFT"),
  totalPaise: integer("total_paise").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  receivedAt: timestamp("received_at"),
}, (t) => [index("po_restaurant_idx").on(t.restaurantId)]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  purchaseOrderId: varchar("purchase_order_id", { length: 36 }).notNull().references(() => purchaseOrders.id),
  rawMaterialId: varchar("raw_material_id", { length: 36 }).notNull().references(() => rawMaterials.id),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unitCostPaise: integer("unit_cost_paise").notNull(),
});

// =============================================================================
// LOYALTY PROGRAM
// =============================================================================

export const loyaltyTransactionTypeEnum = pgEnum("loyalty_transaction_type", ["EARN", "REDEEM", "EXPIRE"]);

export const loyaltyPrograms = pgTable("loyalty_programs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  name: varchar("name", { length: 120 }).notNull().default("Rewards"),
  pointsPerRupee: numeric("points_per_rupee", { precision: 5, scale: 2 }).notNull().default("1"),
  redemptionRatePaise: integer("redemption_rate_paise").notNull().default(100),
  maxRedemptionPercent: integer("max_redemption_percent").notNull().default(50),
  pointsExpiryDays: integer("points_expiry_days").notNull().default(365),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("loyalty_program_restaurant_idx").on(t.restaurantId)]);

export const loyaltyBalances = pgTable("loyalty_balances", {
  id: varchar("id", { length: 36 }).primaryKey(),
  customerId: varchar("customer_id", { length: 36 }).notNull().references(() => customerProfiles.id),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  points: integer("points").notNull().default(0),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  tier: varchar("tier", { length: 32 }).notNull().default("bronze"),
  lastEarnedAt: timestamp("last_earned_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("loyalty_balance_customer_restaurant_idx").on(t.customerId, t.restaurantId)]);

export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  customerId: varchar("customer_id", { length: 36 }).notNull().references(() => customerProfiles.id),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => restaurants.id),
  type: loyaltyTransactionTypeEnum("type").notNull(),
  points: integer("points").notNull(),
  orderId: varchar("order_id", { length: 36 }),
  description: varchar("description", { length: 300 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("loyalty_txn_customer_idx").on(t.customerId, t.restaurantId)]);

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
