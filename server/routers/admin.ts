/**
 * Admin API — comprehensive restaurant operations, order management, catalogue,
 * customer management, reporting, and settings.
 *
 * Issue 8: RBAC enforcement — sensitive operations require specific permissions.
 * Issue 12: Manual delivery fallback endpoint.
 * Issue 17: Integration secret key whitelist per provider.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, requirePermission, router } from "../_core/trpc";
import {
  createMenuItem,
  getAdminDashboard,
  getOrders,
  getOrderWithItems,
  updateMenuItemAvailability,
  updateMenuItem,
  updateOrderStatus,
  updateRestaurant,
  upsertRestaurantCoupon,
  getRestaurantBySlug,
  getAllRestaurants,
  createCategory,
  updateCategory,
  getCustomerList,
  getCustomerById,
  getSalesReport,
  logAudit,
  getSetting,
  setSetting,
  getItemById,
} from "../db";
import { getIntegrationStatus } from "../integrations";
import { applyMenuImport, previewMenuImport } from "../menuImport";
import { readIntegrationSecret, saveIntegrationSecret } from "../security/secretVault";
import { getDeliveryProvider, createManualDelivery } from "../integrations/shadowfax";
import { initiateRefund } from "../integrations/razorpay";
import { orders, deliveries, outlets, restaurants, deliveryStatusHistory, orderStatusHistory } from "../../drizzle/schema";
import { getDb } from "../db";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

const availability = z.enum(["AVAILABLE", "SOLD_OUT", "SCHEDULED_UNAVAILABLE", "OUT_OF_STOCK", "DISABLED"]);
const orderStatus = z.enum([
  "PENDING_PAYMENT", "PAYMENT_CONFIRMED", "PLACED", "RESTAURANT_ACCEPTED",
  "PREPARING", "READY_FOR_PICKUP", "DELIVERY_REQUESTED", "RIDER_ASSIGNED",
  "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REJECTED",
  "REFUND_PENDING", "REFUNDED",
]);

// Issue 17: Whitelist of allowed integration secret keys per provider
const INTEGRATION_KEY_WHITELIST: Record<string, string[]> = {
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  shadowfax: ["SHADOWFAX_API_KEY", "SHADOWFAX_MERCHANT_ID", "SHADOWFAX_WEBHOOK_SECRET"],
  otp: ["OTP_PROVIDER_API_KEY"],
};

export const adminRouter = router({
  // =========================================================================
  // Dashboard & Analytics
  // =========================================================================
  dashboard: adminProcedure
    .input(z.object({ slug: z.string().min(2) }))
    .query(async ({ input }) => {
      const restaurant = await getRestaurantBySlug(input.slug);
      if (!restaurant) return null;
      return getAdminDashboard(restaurant.id);
    }),

  restaurants: adminProcedure.query(() => getAllRestaurants()),

  // =========================================================================
  // Order Management — Issue 8: basic order ops for all admins
  // =========================================================================
  orders: adminProcedure
    .input(z.object({
      restaurantId: z.string().min(4),
      status: orderStatus.optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      customerId: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(({ input }) => getOrders(
      input.restaurantId,
      { status: input.status, startDate: input.startDate, endDate: input.endDate, customerId: input.customerId },
      input.limit,
      input.offset
    )),

  orderDetail: adminProcedure
    .input(z.object({ orderId: z.string().min(4) }))
    .query(({ input }) => getOrderWithItems(input.orderId)),

  updateOrderStatus: adminProcedure
    .input(z.object({
      orderId: z.string().min(4),
      status: orderStatus,
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await updateOrderStatus(input.orderId, input.status, ctx.user.id, input.note);
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: `Order status changed to ${input.status}`,
        targetType: "order",
        targetId: input.orderId,
        afterData: { status: input.status, note: input.note },
        restaurantId: ctx.restaurantId ?? undefined,
      });
      return { success: true } as const;
    }),

  // =========================================================================
  // Restaurant Management — Issue 8: requires restaurant:write
  // =========================================================================
  updateSettings: requirePermission("restaurant:write").input(z.object({
    id: z.string().min(4),
    name: z.string().min(2).max(180),
    cuisineSummary: z.string().min(2).max(255),
    description: z.string().max(2000).optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    deliveryFeePaise: z.number().int().nonnegative(),
    packagingFeePaise: z.number().int().nonnegative(),
    minOrderPaise: z.number().int().nonnegative(),
    isOpen: z.boolean(),
    allowScheduledOrders: z.boolean(),
    preparationMinutes: z.number().int().positive().optional(),
    deliveryRadiusKm: z.number().positive().optional(),
    gstNumber: z.string().optional(),
    gstPercentage: z.string().optional(),
    tempClosureStart: z.coerce.date().nullish(),
    tempClosureEnd: z.coerce.date().nullish(),
    tempClosureMessage: z.string().max(500).nullish(),
  }))
    .mutation(async ({ ctx, input }) => {
      await updateRestaurant(input);
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: "Restaurant settings updated",
        targetType: "restaurant",
        targetId: input.id,
        afterData: { name: input.name, isOpen: input.isOpen },
        restaurantId: ctx.restaurantId ?? undefined,
      });
      return { success: true } as const;
    }),

  // =========================================================================
  // Menu / Catalogue Management — Issue 8: requires menu:write
  // =========================================================================
  createMenuItem: requirePermission("menu:write").input(z.object({
    restaurantId: z.string().min(4),
    categoryId: z.string().min(4),
    name: z.string().min(2).max(180),
    description: z.string().max(1000).optional(),
    pricePaise: z.number().int().positive(),
    offerPricePaise: z.number().int().positive().optional(),
    dietaryType: z.enum(["veg", "nonveg", "egg"]),
    imageUrl: z.string().url().optional(),
    isCustomizable: z.boolean().optional(),
    sku: z.string().max(64).optional(),
  }))
    .mutation(async ({ ctx, input }) => {
      const item = await createMenuItem(input);
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: "Menu item created",
        targetType: "menuItem",
        targetId: item.id,
        afterData: { name: input.name, pricePaise: input.pricePaise },
        restaurantId: ctx.restaurantId ?? undefined,
      });
      return item;
    }),

  updateMenuItem: requirePermission("menu:write").input(z.object({
    itemId: z.string().min(4),
    name: z.string().min(2).max(180).optional(),
    description: z.string().max(1000).optional(),
    pricePaise: z.number().int().positive().optional(),
    offerPricePaise: z.number().int().positive().nullish(),
    categoryId: z.string().optional(),
    dietaryType: z.enum(["veg", "nonveg", "egg"]).optional(),
    isBestseller: z.boolean().optional(),
    isRecommended: z.boolean().optional(),
    isOpen: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    stock: z.number().int().nullish(),
    imageUrl: z.string().nullish(),
  }))
    .mutation(async ({ ctx, input }) => {
      const { itemId, imageUrl, ...rest } = input;
      const updates: Record<string, unknown> = { ...rest };
      if (imageUrl !== null && imageUrl !== undefined) updates.imageUrl = imageUrl;
      const before = await getItemById(itemId);
      await updateMenuItem(itemId, updates as any);
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: "Menu item updated",
        targetType: "menuItem",
        targetId: itemId,
        beforeData: before ? { name: before.name, pricePaise: before.pricePaise, isOpen: before.isOpen } : undefined,
        afterData: updates,
        restaurantId: ctx.restaurantId ?? undefined,
      });
      return { success: true } as const;
    }),

  updateMenuAvailability: requirePermission("menu:write").input(z.object({
    itemId: z.string().min(4),
    availability,
    availableNote: z.string().max(160).optional(),
  }))
    .mutation(async ({ ctx, input }) => {
      await updateMenuItemAvailability(input.itemId, input.availability, input.availableNote);
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: `Item availability changed to ${input.availability}`,
        targetType: "menuItem",
        targetId: input.itemId,
        restaurantId: ctx.restaurantId ?? undefined,
      });
      return { success: true } as const;
    }),

  toggleItemOpen: requirePermission("menu:write").input(z.object({ itemId: z.string().min(4), isOpen: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await updateMenuItem(input.itemId, { isOpen: input.isOpen });
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: `Item ${input.isOpen ? "enabled" : "disabled"}`,
        targetType: "menuItem",
        targetId: input.itemId,
        restaurantId: ctx.restaurantId ?? undefined,
      });
      return { success: true } as const;
    }),

  uploadMenuImage: requirePermission("menu:write").input(z.object({
    data: z.string().min(1),
    filename: z.string().min(1).max(255),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  }))
    .mutation(async ({ input }) => {
      const maxSize = 2 * 1024 * 1024;
      const buffer = Buffer.from(input.data, "base64");
      if (buffer.length > maxSize) {
        throw new Error("Image must be under 2 MB.");
      }
      const fs = await import("fs/promises");
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const menuDir = path.resolve(__dirname, "../../images/menu");
      await fs.mkdir(menuDir, { recursive: true });
      const ext = input.filename.split(".").pop() ?? "jpg";
      const rand = Math.random().toString(36).slice(2, 8);
      const filename = `${Date.now()}_${rand}.${ext}`;
      await fs.writeFile(path.join(menuDir, filename), buffer);
      return { url: `/images/menu/${filename}` };
    }),

  deleteMenuItem: requirePermission("menu:write").input(z.object({
    itemId: z.string().min(4),
  }))
    .mutation(async ({ ctx, input }) => {
      await updateMenuItem(input.itemId, { isOpen: false });
      await updateMenuItemAvailability(input.itemId, "DISABLED");
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: "Menu item deleted (soft)",
        targetType: "menuItem",
        targetId: input.itemId,
        restaurantId: ctx.restaurantId ?? undefined,
      });
      return { success: true } as const;
    }),

  bulkUpdateMenuItems: requirePermission("menu:write").input(z.object({
    itemIds: z.array(z.string().min(4)).min(1).max(100),
    isOpen: z.boolean().optional(),
    availability: z.enum(["AVAILABLE", "SOLD_OUT", "SCHEDULED_UNAVAILABLE", "OUT_OF_STOCK", "DISABLED"]).optional(),
  }))
    .mutation(async ({ ctx, input }) => {
      for (const itemId of input.itemIds) {
        if (input.isOpen !== undefined) {
          await updateMenuItem(itemId, { isOpen: input.isOpen });
        }
        if (input.availability !== undefined) {
          await updateMenuItemAvailability(itemId, input.availability);
        }
      }
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: `Bulk updated ${input.itemIds.length} menu items`,
        targetType: "menuItem",
        afterData: { count: input.itemIds.length, isOpen: input.isOpen, availability: input.availability },
        restaurantId: ctx.restaurantId ?? undefined,
      });
      return { success: true, updated: input.itemIds.length } as const;
    }),

  // =========================================================================
  // Category Management
  // =========================================================================
  createCategory: requirePermission("menu:write").input(z.object({
    restaurantId: z.string().min(4),
    name: z.string().min(2).max(120),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().optional(),
  }))
    .mutation(({ input }) => createCategory(input)),

  updateCategory: requirePermission("menu:write").input(z.object({
    categoryId: z.string().min(4),
    name: z.string().min(2).max(120).optional(),
    sortOrder: z.number().int().optional(),
    isVisible: z.boolean().optional(),
    isOpen: z.boolean().optional(),
  }))
    .mutation(async ({ input }) => {
      const { categoryId, ...updates } = input;
      await updateCategory(categoryId, updates);
      return { success: true } as const;
    }),

  // =========================================================================
  // Coupon Management
  // =========================================================================
  upsertCoupon: requirePermission("menu:write").input(z.object({
    restaurantId: z.string().min(4),
    code: z.string().min(3).max(48),
    description: z.string().min(4).max(255),
    discountType: z.enum(["flat", "percent"]),
    discountValue: z.number().int().positive(),
    minOrderPaise: z.number().int().nonnegative(),
    maxDiscountPaise: z.number().int().positive().optional(),
    totalUsageLimit: z.number().int().positive().optional(),
    perCustomerLimit: z.number().int().positive().optional(),
    isNewCustomerOnly: z.boolean().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
  }))
    .mutation(({ input }) => upsertRestaurantCoupon(input)),

  // =========================================================================
  // Customer Management — Issue 8: requires customers:read
  // =========================================================================
  customers: requirePermission("customers:read").input(z.object({
    search: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  }))
    .query(({ input }) => getCustomerList({ search: input.search }, input.limit, input.offset)),

  customerDetail: requirePermission("customers:read").input(z.object({ customerId: z.string().min(4) }))
    .query(({ input }) => getCustomerById(input.customerId)),

  updateCustomerNotes: requirePermission("customers:write").input(z.object({ customerId: z.string().min(4), notes: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { customerProfiles, auditLogs } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      // Fetch existing notes for audit
      const existing = (await db.select({ adminNotes: customerProfiles.adminNotes })
        .from(customerProfiles).where(eq(customerProfiles.id, input.customerId)).limit(1))[0];

      await db.update(customerProfiles).set({ adminNotes: input.notes }).where(eq(customerProfiles.id, input.customerId));

      // Audit log with actor ID, customer ID, before/after (no sensitive data)
      await db.insert(auditLogs).values({
        id: nanoid(18),
        actorId: ctx.user?.id ?? 0,
        action: "customer.notes.updated",
        targetType: "customer",
        targetId: input.customerId,
        beforeData: { hasNotes: !!existing?.adminNotes },
        afterData: { hasNotes: !!input.notes },
      });

      return { success: true } as const;
    }),

  // =========================================================================
  // Reporting — Issue 8: requires reports:read
  // =========================================================================
  salesReport: requirePermission("reports:read").input(z.object({
    restaurantId: z.string().min(4),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }))
    .query(({ input }) => getSalesReport(input.restaurantId, input.startDate, input.endDate)),

  // =========================================================================
  // Integration Status & Settings — Issue 8: requires integrations:read
  // =========================================================================
  integrationStatus: requirePermission("integrations:read").input(z.object({
    restaurantId: z.string().min(4),
  })).query(({ input }) => getIntegrationStatus(input.restaurantId)),

  // Issue 17: Integration secret save with key whitelist
  saveIntegrationSecret: requirePermission("integrations:write").input(z.object({
    restaurantId: z.string().min(4),
    provider: z.enum(["razorpay", "otp", "delivery"]),
    keyName: z.string().min(3).max(96),
    value: z.string().min(1).max(4096),
  }))
    .mutation(async ({ ctx, input }) => {
      // Issue 17: Validate key name against whitelist
      const allowedKeys = INTEGRATION_KEY_WHITELIST[input.provider];
      if (allowedKeys && !allowedKeys.includes(input.keyName)) {
        throw new Error(`Key name \"${input.keyName}\" is not allowed for provider \"${input.provider}\". Allowed: ${allowedKeys.join(", ")}`);
      }

      await saveIntegrationSecret({ ...input, userId: ctx.user.id });
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: `Integration secret saved for ${input.provider}/${input.keyName}`,
        targetType: "integration",
        targetId: input.restaurantId,
        restaurantId: input.restaurantId,
      });
      return { success: true } as const;
    }),

  verifyIntegrationSecret: requirePermission("integrations:read").input(z.object({
    restaurantId: z.string().min(4),
    provider: z.enum(["razorpay", "otp", "delivery"]),
    keyName: z.string().min(3).max(96),
  }))
    .mutation(async ({ input }) => ({
      readable: Boolean(await readIntegrationSecret(input.restaurantId, input.provider, input.keyName)),
    })),

  // =========================================================================
  // Menu Import / Export
  // =========================================================================
  previewMenuImport: requirePermission("menu:write").input(z.object({ csv: z.string().min(10).max(1_500_000) }))
    .mutation(({ input }) => previewMenuImport(input.csv)),

  applyMenuImport: requirePermission("menu:write").input(z.object({ restaurantId: z.string().min(4), csv: z.string().min(10).max(1_500_000) }))
    .mutation(async ({ ctx, input }) => {
      const result = await applyMenuImport(input.restaurantId, input.csv);
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: `Menu import: ${result.created} created, ${result.updated} updated`,
        targetType: "restaurant",
        targetId: input.restaurantId,
        restaurantId: input.restaurantId,
      });
      return result;
    }),

  // =========================================================================
  // Delivery Integration — Issue 12: manual delivery fallback
  // =========================================================================
  checkDeliveryServiceability: adminProcedure.input(z.object({ pincode: z.string().regex(/^\\d{6}$/) }))
    .query(async ({ input }) => {
      const provider = getDeliveryProvider();
      return provider.checkServiceability(input.pincode);
    }),

  // Issue 12: Manual delivery dispatch — for when Shadowfax is unavailable
  manualDeliveryDispatch: requirePermission("orders:write").input(z.object({
    orderId: z.string().min(4),
    riderName: z.string().min(1).max(120),
    riderPhone: z.string().min(8).max(24),
    notes: z.string().max(500).optional(),
  }))
    .mutation(async ({ ctx, input }) => {
      const result = await createManualDelivery(input.orderId, {
        riderName: input.riderName,
        riderPhone: input.riderPhone,
        notes: input.notes,
      });
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: "Manual delivery dispatched",
        targetType: "delivery",
        targetId: input.orderId,
        afterData: { riderName: input.riderName, riderPhone: input.riderPhone },
        restaurantId: ctx.restaurantId ?? undefined,
      });
      return result;
    }),

  // --- Shadowfax dispatch: wire createDelivery with idempotency ---
  shadowfaxDispatch: requirePermission("orders:write").input(z.object({
    orderId: z.string().min(4),
  }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available.");

      // 1. Load order
      const order = (await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1))[0];
      if (!order) throw new Error("Order not found.");
      if (order.status !== "READY_FOR_PICKUP") {
        throw new Error(`Order must be READY_FOR_PICKUP to dispatch. Current status: ${order.status}`);
      }

      // 2. Check for existing active delivery (idempotency guard)
      const existingDelivery = (await db.select().from(deliveries).where(eq(deliveries.orderId, input.orderId)).limit(1))[0];
      if (existingDelivery && existingDelivery.provider !== "manual") {
        if (["DISPATCHING", "PENDING", "ASSIGNED"].includes(existingDelivery.status ?? "")) {
          throw new Error("Delivery already dispatched or in progress for this order.");
        }
      }

      // 3. Load outlet for pickup coordinates
      const outlet = (await db.select().from(outlets).where(eq(outlets.id, order.outletId)).limit(1))[0];
      if (!outlet) throw new Error("Outlet not found.");

      const { validateGeoLocation } = await import("../domain/locationService");
      const pickupLoc = validateGeoLocation({ latitude: outlet.latitude, longitude: outlet.longitude });
      if (!pickupLoc.valid) throw new Error("Outlet pickup coordinates are not configured. Please set outlet lat/lng.");

      // 4. Validate drop coordinates from immutable order snapshot
      const addrSnapshot = order.addressSnapshot as Record<string, string>;
      const dropLoc = validateGeoLocation({ latitude: addrSnapshot.latitude, longitude: addrSnapshot.longitude });
      if (!dropLoc.valid) throw new Error("Order delivery coordinates are missing. Cannot dispatch without precise location.");

      // 5. Create delivery record BEFORE external API call (idempotency)
      const deliveryId = nanoid(18);
      await db.transaction(async (tx) => {
        await tx.insert(deliveries).values({
          id: deliveryId,
          orderId: order.id,
          provider: "shadowfax",
          status: "DISPATCHING",
        });
        await tx.insert(deliveryStatusHistory).values({
          id: nanoid(18),
          deliveryId,
          status: "DISPATCHING",
          note: "Dispatch initiated — awaiting provider response.",
        });
      });

      // 6. Call Shadowfax API
      const provider = getDeliveryProvider();
      const restaurant = (await db.select().from(restaurants).where(eq(restaurants.id, order.restaurantId)).limit(1))[0];

      let result;
      try {
        result = await provider.createDelivery({
          orderId: order.id,
          orderNumber: order.orderNumber,
          restaurantName: restaurant?.name ?? "Kitchen",
          pickupAddress: {
            name: outlet.name,
            phone: outlet.phone ?? restaurant?.contactPhone ?? "",
            address: outlet.address,
            city: outlet.city,
            pincode: outlet.postalCode ?? "",
            latitude: pickupLoc.latitude,
            longitude: pickupLoc.longitude,
          },
          dropAddress: {
            name: order.customerName ?? "Customer",
            phone: order.customerPhone ?? "",
            address: [addrSnapshot.flatHouse, addrSnapshot.building, addrSnapshot.street, addrSnapshot.area].filter(Boolean).join(", "),
            city: addrSnapshot.city ?? "",
            pincode: addrSnapshot.postalCode ?? "",
            latitude: dropLoc.latitude,
            longitude: dropLoc.longitude,
          },
          items: [],
          totalAmountPaise: order.totalPaise,
          estimatedPreparationMinutes: 0,
          specialInstructions: order.specialInstructions ?? order.deliveryNotes ?? undefined,
        });
      } catch (error) {
        // External API failed — mark delivery as FAILED
        await db.update(deliveries).set({
          status: "FAILED",
          providerPayload: { error: error instanceof Error ? error.message : "Unknown error" },
        }).where(eq(deliveries.id, deliveryId));
        await db.insert(deliveryStatusHistory).values({
          id: nanoid(18),
          deliveryId,
          status: "FAILED",
          note: `Provider API call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
        throw new Error(`Shadowfax dispatch failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }

      if (!result.success) {
        // Provider returned failure — mark delivery as FAILED
        await db.update(deliveries).set({
          status: "FAILED",
          providerPayload: { error: result.error },
        }).where(eq(deliveries.id, deliveryId));
        await db.insert(deliveryStatusHistory).values({
          id: nanoid(18),
          deliveryId,
          status: "FAILED",
          note: `Provider rejected: ${result.error}`,
        });
        throw new Error(`Shadowfax dispatch failed: ${result.error}`);
      }

      // 7. Update delivery record with provider response
      await db.transaction(async (tx) => {
        await tx.update(deliveries).set({
          providerDeliveryId: result.deliveryId ?? null,
          trackingId: result.trackingId ?? null,
          status: "PENDING",
          quotedChargePaise: result.quotedChargePaise ?? null,
          estimatedPickup: result.estimatedPickup ?? null,
          estimatedDelivery: result.estimatedDelivery ?? null,
          trackingUrl: result.trackingUrl ?? null,
          providerPayload: result.rawPayload ?? null,
        }).where(eq(deliveries.id, deliveryId));

        await tx.insert(deliveryStatusHistory).values({
          id: nanoid(18),
          deliveryId,
          status: "PENDING",
          note: "Shadowfax delivery created successfully.",
        });

        await tx.update(orders).set({ status: "DELIVERY_REQUESTED" }).where(eq(orders.id, order.id));
        await tx.insert(orderStatusHistory).values({
          id: nanoid(18),
          orderId: order.id,
          status: "DELIVERY_REQUESTED",
          note: `Shadowfax delivery dispatched. Tracking: ${result.trackingId ?? "N/A"}.`,
          actorId: ctx.user.id,
        });
      });

      // 7. Audit
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: "Shadowfax delivery dispatched",
        targetType: "delivery",
        targetId: order.id,
        afterData: { providerDeliveryId: result.deliveryId, trackingId: result.trackingId },
        restaurantId: ctx.restaurantId ?? undefined,
      });

      return {
        success: true,
        deliveryId,
        providerDeliveryId: result.deliveryId,
        trackingId: result.trackingId,
        trackingUrl: result.trackingUrl,
        estimatedDelivery: result.estimatedDelivery,
      };
    }),

  // =========================================================================
  // Refunds — Issue 8: requires payments:refund
  // =========================================================================
  initiateRefund: requirePermission("payments:refund").input(z.object({
    orderId: z.string().min(4),
    paymentId: z.string().min(4),
    amountPaise: z.number().int().positive(),
    reason: z.string().max(500).optional(),
  }))
    .mutation(async ({ ctx, input }) => {
      const result = await initiateRefund({
        ...input,
        initiatedBy: ctx.user.id,
      });
      await logAudit({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? undefined,
        action: `Refund initiated: ₹${input.amountPaise / 100}`,
        targetType: "order",
        targetId: input.orderId,
        afterData: { refundId: result.refundId, amountPaise: input.amountPaise },
        restaurantId: ctx.restaurantId ?? undefined,
      });
      return result;
    }),

  // =========================================================================
  // Audit Logs
  // =========================================================================
  auditLogs: requirePermission("audit:read").input(z.object({
    targetType: z.string().optional(),
    targetId: z.string().optional(),
    restaurantId: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }))
    .query(async ({ ctx, input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { auditLogs } = await import("../../drizzle/schema");
      const { eq, and, desc } = await import("drizzle-orm");

      const rid = input.restaurantId ?? ctx.restaurantId;
      const conditions = [];
      if (rid) conditions.push(eq(auditLogs.restaurantId, rid));
      if (input.targetType) conditions.push(eq(auditLogs.targetType, input.targetType));
      if (input.targetId) conditions.push(eq(auditLogs.targetId, input.targetId));

      return db.select().from(auditLogs)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit);
    }),

  // =========================================================================
  // Settings — Issue 8: requires settings:write for mutations
  // =========================================================================
  getSetting: adminProcedure.input(z.object({ key: z.string().min(1) }))
    .query(({ input }) => getSetting(input.key)),

  setSetting: requirePermission("settings:write").input(z.object({
    key: z.string().min(1),
    value: z.string(),
    category: z.string().default("general"),
  }))
    .mutation(({ ctx, input }) => setSetting(input.key, input.value, input.category, ctx.user.id)),

  // =========================================================================
  // Custom Domain Management
  // =========================================================================
  listDomains: requirePermission("settings:write").input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { customDomains } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      return db.select().from(customDomains)
        .where(eq(customDomains.restaurantId, input.restaurantId))
        .orderBy(desc(customDomains.createdAt));
    }),

  addDomain: requirePermission("settings:write").input(z.object({
    restaurantId: z.string().min(4),
    domain: z.string().min(4).max(253).regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { customDomains } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      const existing = await db.select({ id: customDomains.id }).from(customDomains)
        .where(eq(customDomains.domain, input.domain)).limit(1);
      if (existing[0]) throw new Error("This domain is already registered.");

      await db.insert(customDomains).values({
        id: nanoid(18),
        restaurantId: input.restaurantId,
        domain: input.domain,
        isVerified: false,
        sslStatus: "pending",
      });

      return { cnameTarget: "cname.9housekitchen.com" };
    }),

  verifyDomain: requirePermission("settings:write").input(z.object({ domainId: z.string().min(4) }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { customDomains } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const dns = await import("node:dns");
      const { promisify } = await import("node:util");
      const resolveCname = promisify(dns.resolveCname);

      const [domain] = await db.select().from(customDomains)
        .where(eq(customDomains.id, input.domainId)).limit(1);
      if (!domain) throw new Error("Domain not found.");

      try {
        const records = await resolveCname(domain.domain);
        const verified = records.some(r => r.includes("9housekitchen.com"));
        if (verified) {
          await db.update(customDomains)
            .set({ isVerified: true, verifiedAt: new Date(), sslStatus: "active" })
            .where(eq(customDomains.id, input.domainId));
          return { verified: true };
        }
        return { verified: false, message: "CNAME record not pointing to cname.9housekitchen.com" };
      } catch {
        return { verified: false, message: "DNS lookup failed. Ensure the CNAME record is configured." };
      }
    }),

  removeDomain: requirePermission("settings:write").input(z.object({ domainId: z.string().min(4) }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { customDomains } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(customDomains).where(eq(customDomains.id, input.domainId));
      return { success: true };
    }),

  setPrimaryDomain: requirePermission("settings:write").input(z.object({ domainId: z.string().min(4), restaurantId: z.string().min(4) }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { customDomains } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      await db.update(customDomains)
        .set({ isPrimary: false })
        .where(eq(customDomains.restaurantId, input.restaurantId));
      await db.update(customDomains)
        .set({ isPrimary: true })
        .where(eq(customDomains.id, input.domainId));

      return { success: true };
    }),

  // =========================================================================
  // Staff / Team Management
  // =========================================================================
  listMembers: requirePermission("settings:write").input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { restaurantMembers, users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      return db.select({
        id: restaurantMembers.id,
        userId: restaurantMembers.userId,
        role: restaurantMembers.role,
        isActive: restaurantMembers.isActive,
        joinedAt: restaurantMembers.joinedAt,
        userName: users.name,
        userEmail: users.email,
      })
        .from(restaurantMembers)
        .innerJoin(users, eq(restaurantMembers.userId, users.id))
        .where(eq(restaurantMembers.restaurantId, input.restaurantId));
    }),

  inviteMember: requirePermission("settings:write").input(z.object({
    restaurantId: z.string().min(4),
    email: z.string().email(),
    role: z.enum(["owner", "admin", "manager", "staff", "kitchen"]),
  }))
    .mutation(async ({ ctx, input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { users, restaurantMembers } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      let [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (!user) {
        const openId = `self_${nanoid(16)}`;
        await db.insert(users).values({
          openId,
          email: input.email,
          loginMethod: "email",
          role: "admin",
          lastSignedIn: new Date(),
        });
        [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      }

      const [existing] = await db.select().from(restaurantMembers)
        .where(and(
          eq(restaurantMembers.userId, user.id),
          eq(restaurantMembers.restaurantId, input.restaurantId),
        )).limit(1);

      if (existing) {
        await db.update(restaurantMembers)
          .set({ role: input.role, isActive: true })
          .where(eq(restaurantMembers.id, existing.id));
      } else {
        await db.insert(restaurantMembers).values({
          id: nanoid(18),
          userId: user.id,
          restaurantId: input.restaurantId,
          role: input.role,
          invitedByUserId: ctx.user.id,
          isActive: true,
        });
      }

      return { success: true };
    }),

  updateMemberRole: requirePermission("settings:write").input(z.object({
    memberId: z.string().min(4),
    role: z.enum(["owner", "admin", "manager", "staff", "kitchen"]),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { restaurantMembers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(restaurantMembers).set({ role: input.role }).where(eq(restaurantMembers.id, input.memberId));
      return { success: true };
    }),

  deactivateMember: requirePermission("settings:write").input(z.object({ memberId: z.string().min(4) }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { restaurantMembers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(restaurantMembers).set({ isActive: false }).where(eq(restaurantMembers.id, input.memberId));
      return { success: true };
    }),

  // =========================================================================
  // Notification Settings
  // =========================================================================
  getNotificationSettings: requirePermission("settings:read").input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { settings } = await import("../../drizzle/schema");
      const { eq, like, and } = await import("drizzle-orm");
      return db.select().from(settings)
        .where(and(like(settings.key, "notifications_%"), eq(settings.restaurantId, input.restaurantId)));
    }),

  updateNotificationSetting: requirePermission("settings:write").input(z.object({
    restaurantId: z.string().min(4),
    key: z.string().min(1),
    value: z.string(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { settings } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      const existing = (await db.select().from(settings)
        .where(and(eq(settings.key, input.key), eq(settings.restaurantId, input.restaurantId)))
        .limit(1))[0];

      if (existing) {
        await db.update(settings).set({ value: input.value, updatedAt: new Date() })
          .where(and(eq(settings.key, input.key), eq(settings.restaurantId, input.restaurantId)));
      } else {
        await db.insert(settings).values({
          id: nanoid(),
          key: input.key,
          value: input.value,
          category: "notifications",
          restaurantId: input.restaurantId,
        });
      }
      return { success: true };
    }),

  // =========================================================================
  // GST Invoice Generation
  // =========================================================================
  generateInvoice: requirePermission("orders:read").input(z.object({ orderId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { orders, orderItems, restaurants } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { generateInvoiceHtml } = await import("../domain/invoiceGenerator");

      const order = (await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1))[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
      const restaurant = (await db.select().from(restaurants).where(eq(restaurants.id, order.restaurantId)).limit(1))[0];
      if (!restaurant) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant not found" });

      const subtotalPaise = items.reduce((sum, it) => sum + it.unitPricePaise * it.quantity, 0);
      const cgstPaise = Math.round(subtotalPaise * 0.025);
      const sgstPaise = Math.round(subtotalPaise * 0.025);

      const addrSnap = order.addressSnapshot as Record<string, unknown> | null;
      const deliveryAddress = [addrSnap?.address, addrSnap?.city, addrSnap?.pincode].filter(Boolean).join(", ") || "";

      const html = generateInvoiceHtml({
        restaurantName: restaurant.name,
        restaurantAddress: restaurant.address || "",
        restaurantPhone: restaurant.contactPhone || "",
        restaurantGst: (restaurant as any).gstNumber || "",
        logoUrl: restaurant.logoUrl || undefined,
        invoiceNumber: `INV-${order.orderNumber}`,
        orderNumber: order.orderNumber,
        orderDate: order.createdAt.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
        customerName: order.customerName || "",
        customerPhone: order.customerPhone || "",
        deliveryAddress,
        items: items.map(it => ({
          name: it.itemNameSnapshot,
          quantity: it.quantity,
          unitPricePaise: it.unitPricePaise,
          totalPricePaise: it.unitPricePaise * it.quantity,
        })),
        subtotalPaise,
        discountPaise: order.discountPaise ?? 0,
        packagingFeePaise: order.packagingFeePaise ?? 0,
        deliveryFeePaise: order.deliveryFeePaise ?? 0,
        cgstPaise,
        sgstPaise,
        totalPaise: order.totalPaise,
        paymentMethod: order.fulfillmentType || "-",
        paymentStatus: order.paymentStatus || "PENDING",
      });

      return { html, invoiceNumber: `INV-${order.orderNumber}` };
    }),

  listInvoices: requirePermission("reports:read").input(z.object({
    restaurantId: z.string().min(4),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { orders } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, desc, inArray } = await import("drizzle-orm");

      const conditions = [
        eq(orders.restaurantId, input.restaurantId),
        inArray(orders.status, ["DELIVERED", "READY_FOR_PICKUP"]),
      ];
      if (input.startDate) conditions.push(gte(orders.createdAt, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(orders.createdAt, new Date(input.endDate)));

      return db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        totalPaise: orders.totalPaise,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        createdAt: orders.createdAt,
        customerName: orders.customerName,
      }).from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // =========================================================================
  // Manual Aggregator Order Entry
  // =========================================================================
  createManualOrder: requirePermission("orders:write").input(z.object({
    restaurantId: z.string().min(4),
    outletId: z.string().min(4),
    source: z.enum(["ZOMATO", "SWIGGY", "PHONE", "WALK_IN"]),
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),
    items: z.array(z.object({
      name: z.string().min(1),
      quantity: z.number().int().min(1),
      unitPricePaise: z.number().int().min(0),
    })).min(1),
    totalPaise: z.number().int().min(0),
    paymentStatus: z.enum(["PAID", "COD"]).default("PAID"),
    notes: z.string().optional(),
  }))
    .mutation(async ({ input, ctx }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { orders, orderItems } = await import("../../drizzle/schema");
      const { nanoid } = await import("nanoid");

      const orderId = nanoid();
      const orderNumber = `AGG-${Date.now().toString(36).toUpperCase()}`;

      await db.insert(orders).values({
        id: orderId,
        orderNumber,
        trackingToken: nanoid(),
        restaurantId: input.restaurantId,
        outletId: input.outletId,
        status: "PLACED",
        paymentStatus: input.paymentStatus === "PAID" ? "PAID" : "PENDING",
        fulfillmentType: "DELIVERY",
        orderSource: input.source,
        customerName: input.customerName || null,
        customerPhone: input.customerPhone || null,
        addressSnapshot: { source: input.source, note: "Manual aggregator entry" },
        itemTotalPaise: input.totalPaise,
        discountPaise: 0,
        packagingFeePaise: 0,
        deliveryFeePaise: 0,
        taxPaise: 0,
        totalPaise: input.totalPaise,
        specialInstructions: input.notes || null,
      });

      for (const item of input.items) {
        await db.insert(orderItems).values({
          id: nanoid(),
          orderId,
          itemNameSnapshot: item.name,
          unitPricePaise: item.unitPricePaise,
          quantity: item.quantity,
          selectedModifiers: [],
        });
      }

      return { orderId, orderNumber };
    }),

  // =========================================================================
  // Outlet Management
  // =========================================================================
  listOutlets: requirePermission("restaurant:write").input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { outlets } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      return db.select().from(outlets)
        .where(eq(outlets.restaurantId, input.restaurantId))
        .orderBy(desc(outlets.createdAt));
    }),

  createOutlet: requirePermission("restaurant:write").input(z.object({
    restaurantId: z.string().min(4),
    name: z.string().min(1).max(180),
    address: z.string().min(1),
    city: z.string().min(1).max(120),
    phone: z.string().optional(),
    preparationMinutes: z.number().int().min(1).default(25),
    deliveryRadiusKm: z.string().default("5"),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { outlets } = await import("../../drizzle/schema");
      const { nanoid } = await import("nanoid");

      const id = nanoid();
      await db.insert(outlets).values({
        id,
        restaurantId: input.restaurantId,
        name: input.name,
        address: input.address,
        city: input.city,
        phone: input.phone || null,
        preparationMinutes: input.preparationMinutes,
        deliveryRadiusKm: input.deliveryRadiusKm,
      });
      return { id };
    }),

  updateOutlet: requirePermission("restaurant:write").input(z.object({
    outletId: z.string().min(4),
    restaurantId: z.string().min(4),
    name: z.string().min(1).max(180),
    address: z.string().min(1),
    city: z.string().min(1).max(120),
    phone: z.string().optional(),
    preparationMinutes: z.number().int().min(1),
    deliveryRadiusKm: z.string(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { outlets } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      await db.update(outlets).set({
        name: input.name,
        address: input.address,
        city: input.city,
        phone: input.phone || null,
        preparationMinutes: input.preparationMinutes,
        deliveryRadiusKm: input.deliveryRadiusKm,
      }).where(eq(outlets.id, input.outletId));
      return { success: true };
    }),

  toggleOutletActive: requirePermission("restaurant:write").input(z.object({
    outletId: z.string().min(4),
    isActive: z.boolean(),
  }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { outlets } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      await db.update(outlets).set({ isActive: input.isActive }).where(eq(outlets.id, input.outletId));
      return { success: true };
    }),
});
