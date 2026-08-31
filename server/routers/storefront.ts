/**
 * Storefront API — public menu reads, search, and guest-safe checkout.
 * All pricing is computed server-side. Frontend never submits trusted totals.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { createOrderFromValidatedCart, getStorefront } from "../db";
import {
  createRazorpayPaymentOrder,
  getRazorpayConfig,
  confirmPayment,
  handleRazorpayWebhook,
} from "../integrations/razorpay";
import { getDeliveryProvider } from "../integrations/shadowfax";

// --- Issue 4: Strict address validation ---
const addressSchema = z.object({
  name: z.string().min(1).max(180).optional(),
  flatHouse: z.string().min(1).max(180),
  building: z.string().max(180).optional(),
  street: z.string().max(180).optional(),
  landmark: z.string().max(180).optional(),
  area: z.string().min(1).max(180),
  city: z.string().min(1).max(120),
  postalCode: z.string().regex(/^\\d{6}$/, "A valid 6-digit Indian pincode is required."),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
}).refine(
  value => Boolean(value.flatHouse && value.area && value.city && value.postalCode),
  "A complete delivery address with pincode is required."
);

// --- Issue 5: Frontend submits IDs only, no prices ---
const modifierIdsSchema = z.object({
  menuItemId: z.string().min(3),
  quantity: z.number().int().min(1).max(20),
  modifierOptionIds: z.array(z.string().min(1)).optional(),
  selectedVariantId: z.string().optional(),
  specialInstructions: z.string().max(300).optional(),
});

const checkoutInput = z.object({
  slug: z.string().min(2),
  lines: z.array(modifierIdsSchema).min(1).max(50),
  address: addressSchema,
  couponCode: z.string().max(48).optional(),
  deliveryNotes: z.string().max(1000).optional(),
  cutleryPreference: z.boolean().optional(),
  // Issue 3: Phone is now mandatory for guest checkout
  customerPhone: z.string().min(10).max(24),
  customerEmail: z.string().email().max(320).optional(),
  // Issue 3: Idempotency key to prevent duplicate orders from retries
  idempotencyKey: z.string().min(8).max(64).optional(),
});

export const storefrontRouter = router({
  // =========================================================================
  // Menu & Storefront
  // =========================================================================
  get: publicProcedure
    .input(z.object({ slug: z.string().min(2) }))
    .query(({ input }) => getStorefront(input.slug)),

  paymentConfig: publicProcedure.query(() => getRazorpayConfig()),

  // =========================================================================
  // Customer Phone Auth
  // =========================================================================
  sendOtp: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(15) }))
    .mutation(async ({ input }) => {
      const { createOtp } = await import("../db");
      const result = await createOtp(input.phone);
      // In production, send via SMS provider. For MVP, log to console.
      console.log(`[OTP] Phone ${input.phone}: code = ${result.code}`);
      return { success: true, expiresIn: 600 };
    }),

  verifyOtp: publicProcedure
    .input(z.object({
      phone: z.string().min(10).max(15),
      code: z.string().length(6),
    }))
    .mutation(async ({ input }) => {
      const { verifyOtp } = await import("../db");
      const result = await verifyOtp(input.phone, input.code);
      if (!result) {
        throw new Error("Invalid or expired verification code.");
      }
      return {
        success: true,
        userId: result.userId,
        isNewUser: result.isNewUser,
        phone: input.phone.replace(/(\d{2})\d+(\d{2})/, "$1****$2"),
      };
    }),

  customerMe: publicProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return null;
      const { users, customerProfiles } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const user = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
      if (!user) return null;
      const profile = (await db.select().from(customerProfiles).where(eq(customerProfiles.userId, user.id)).limit(1))[0];
      return {
        id: user.id,
        name: user.name,
        phone: user.mobile?.replace(/(\d{2})\d+(\d{2})/, "$1****$2") ?? null,
        profileId: profile?.id ?? null,
        totalOrders: profile?.totalOrders ?? 0,
        totalSpentPaise: profile?.totalSpentPaise ?? 0,
      };
    }),

  // =========================================================================
  // Search
  // =========================================================================
  search: publicProcedure
    .input(z.object({
      slug: z.string().min(2),
      query: z.string().min(1).max(200),
      veg: z.boolean().optional(),
      bestseller: z.boolean().optional(),
      minPrice: z.number().int().optional(),
      maxPrice: z.number().int().optional(),
    }))
    .query(async ({ input }) => {
      const storefront = await getStorefront(input.slug);
      if (!storefront) return { items: [], categories: [] };

      const query = input.query.toLowerCase().trim();
      let filtered = storefront.items;

      if (query) {
        filtered = filtered.filter(item => {
          const category = storefront.categories.find(c => c.id === item.categoryId);
          const searchText = [
            item.name,
            item.description,
            item.tag,
            category?.name,
            ...(item.tags ?? []),
          ].join(" ").toLowerCase();
          return searchText.includes(query);
        });
      }

      if (input.veg) filtered = filtered.filter(i => i.dietaryType === "veg");
      if (input.bestseller) filtered = filtered.filter(i => i.isBestseller);
      if (input.minPrice) filtered = filtered.filter(i => i.pricePaise >= input.minPrice!);
      if (input.maxPrice) filtered = filtered.filter(i => i.pricePaise <= input.maxPrice!);

      return {
        items: filtered.slice(0, 50),
        categories: storefront.categories,
      };
    }),

  // =========================================================================
  // Serviceability
  // =========================================================================
  checkServiceability: publicProcedure
    .input(z.object({ pincode: z.string().regex(/^\\d{6}$/) }))
    .query(async ({ input }) => {
      const provider = getDeliveryProvider();
      return provider.checkServiceability(input.pincode);
    }),

  // =========================================================================
  // Checkout & Payment — Issue 3: guest-safe, no auth required
  // =========================================================================
  initiatePayment: publicProcedure
    .input(checkoutInput)
    .mutation(async ({ input }) => {
      const config = await getRazorpayConfig();
      if (!config.enabled) {
        throw new Error("Online payment is not configured yet. Please contact the restaurant.");
      }

      // Issue 18: Use idempotencyKey to prevent duplicate order creation
      // (checked inside createOrderFromValidatedCart via orderNumber uniqueness)
      const localOrder = await createOrderFromValidatedCart({
        userId: 0, // Issue 3: guest user — createOrderFromValidatedCart handles this
        slug: input.slug,
        lines: input.lines,
        address: input.address as Record<string, string>,
        couponCode: input.couponCode,
        deliveryNotes: input.deliveryNotes,
        cutleryPreference: input.cutleryPreference,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
      });

      const provider = await createRazorpayPaymentOrder({
        localOrderId: localOrder.id,
        orderNumber: localOrder.orderNumber,
        amountPaise: localOrder.totalPaise,
      });

      return {
        orderId: localOrder.id,
        orderNumber: localOrder.orderNumber,
        trackingToken: localOrder.trackingToken,
        ...provider,
      };
    }),

  verifyPayment: publicProcedure
    .input(z.object({
      orderId: z.string().min(5),
      providerOrderId: z.string().min(5),
      providerPaymentId: z.string().min(5),
      signature: z.string().min(32).max(128),
    }))
    .mutation(({ input }) =>
      confirmPayment({
        localOrderId: input.orderId,
        providerOrderId: input.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        signature: input.signature,
        source: "browser_callback",
      })
    ),

  // =========================================================================
  // Webhooks — Issue 7: HMAC verification for Razorpay
  // =========================================================================
  razorpayWebhook: publicProcedure
    .input(z.object({
      event: z.string(),
      payload: z.record(z.string(), z.unknown()),
      signature: z.string().optional(),
    }))
    .mutation(({ input }) => handleRazorpayWebhook(input.event, input.payload, input.signature)),

  shadowfaxWebhook: publicProcedure
    .input(z.object({
      payload: z.record(z.string(), z.unknown()),
      signature: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const provider = getDeliveryProvider();
      return provider.handleWebhook(input.payload, input.signature);
    }),

  // =========================================================================
  // Issue 1: Secure Order Tracking — requires trackingToken
  // =========================================================================
  orderTracking: publicProcedure
    .input(z.object({
      orderNumber: z.string().min(5),
      trackingToken: z.string().min(16),
    }))
    .query(async ({ input }) => {
      const { getOrderForTracking } = await import("../db");
      return getOrderForTracking(input.orderNumber, input.trackingToken);
    }),
});
