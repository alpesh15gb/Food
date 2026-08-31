/**
 * Storefront API — public menu reads, search, and authenticated checkout.
 * All pricing is computed server-side. Frontend never submits trusted totals.
 */
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { createOrderFromValidatedCart, getStorefront } from "../db";
import {
  createRazorpayPaymentOrder,
  getRazorpayConfig,
  verifyAndCaptureRazorpayPayment,
  handleRazorpayWebhook,
} from "../integrations/razorpay";
import { getDeliveryProvider } from "../integrations/shadowfax";

const checkoutInput = z.object({
  slug: z.string().min(2),
  lines: z.array(z.object({
    menuItemId: z.string().min(3),
    quantity: z.number().int().min(1).max(20),
    modifiers: z.array(z.object({
      optionId: z.string(),
      name: z.string(),
      pricePaise: z.number().int().nonnegative().default(0),
    })).optional(),
    specialInstructions: z.string().max(300).optional(),
  })).min(1),
  address: z.record(z.string(), z.string()).refine(
    value => Boolean(value.flatHouse && value.area && value.city),
    "A complete delivery address is required."
  ),
  couponCode: z.string().max(48).optional(),
  deliveryNotes: z.string().max(1000).optional(),
  cutleryPreference: z.boolean().optional(),
  customerPhone: z.string().max(24).optional(),
  customerEmail: z.string().max(320).optional(),
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

      // Text search across name, description, category, tags
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

      // Filters
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
    .input(z.object({ pincode: z.string().min(4).max(10) }))
    .query(async ({ input }) => {
      const provider = getDeliveryProvider();
      return provider.checkServiceability(input.pincode);
    }),

  // =========================================================================
  // Checkout & Payment
  // =========================================================================
  initiatePayment: protectedProcedure
    .input(checkoutInput)
    .mutation(async ({ ctx, input }) => {
      const config = await getRazorpayConfig();
      if (!config.enabled) {
        throw new Error("Online payment is not configured yet. Please contact the restaurant.");
      }

      const localOrder = await createOrderFromValidatedCart({
        userId: ctx.user.id,
        ...input,
      });

      const provider = await createRazorpayPaymentOrder({
        localOrderId: localOrder.id,
        orderNumber: localOrder.orderNumber,
        amountPaise: localOrder.totalPaise,
      });

      return {
        orderId: localOrder.id,
        orderNumber: localOrder.orderNumber,
        ...provider,
      };
    }),

  verifyPayment: protectedProcedure
    .input(z.object({
      orderId: z.string().min(5),
      providerOrderId: z.string().min(5),
      providerPaymentId: z.string().min(5),
      signature: z.string().min(32),
    }))
    .mutation(({ input }) =>
      verifyAndCaptureRazorpayPayment({
        localOrderId: input.orderId,
        providerOrderId: input.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        signature: input.signature,
      })
    ),

  // =========================================================================
  // Webhooks (called by Razorpay/Shadowfax, not by frontend)
  // =========================================================================
  razorpayWebhook: publicProcedure
    .input(z.object({
      event: z.string(),
      payload: z.record(z.string(), z.unknown()),
    }))
    .mutation(({ input }) => handleRazorpayWebhook(input)),

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
  // Order Tracking (for customers)
  // =========================================================================
  orderTracking: publicProcedure
    .input(z.object({ orderNumber: z.string().min(5) }))
    .query(async ({ input }) => {
      const { getOrderWithItems } = await import("../db");
      const drizzleOrm = await import("drizzle-orm");
      const schema = await import("../../drizzle/schema");
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");

      const order = (await db.select().from(schema.orders).where(drizzleOrm.eq(schema.orders.orderNumber, input.orderNumber)).limit(1))[0];
      if (!order) return null;

      return getOrderWithItems(order.id);
    }),
});
