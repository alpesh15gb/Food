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
  postalCode: z.string().regex(/^\\d{6}$/),
  // Required: precise delivery coordinates
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(10000).optional(),
  locationSource: z.enum(["device_gps", "map_pin", "place_search", "saved_address"]),
  placeId: z.string().max(256).optional(),
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

  /**
   * Resolve the restaurant slug for the request's Host header via verified
   * custom domains (primary first). Lets restaurant roots (9housekitchen.in/)
   * load their storefront with no slug in the path. Null on platform /
   * unknown hosts — callers fall back to slug routing or the platform page.
   */
  defaultSlug: publicProcedure.query(async ({ ctx }) => {
    const raw = (ctx.req.headers.host ?? "").split(":")[0]?.toLowerCase() ?? "";
    const host = raw.replace(/^www\./, "");
    if (!host) return { slug: null } as const;
    try {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return { slug: null } as const;
      const { customDomains, restaurants } = await import("../../drizzle/schema");
      const { and, eq } = await import("drizzle-orm");
      const rows = await db.select({
        slug: restaurants.slug,
        isPrimary: customDomains.isPrimary,
      }).from(customDomains)
        .innerJoin(restaurants, eq(customDomains.restaurantId, restaurants.id))
        .where(and(eq(customDomains.domain, host), eq(customDomains.isVerified, true)));
      if (rows.length === 0) return { slug: null } as const;
      const best = rows.find(r => r.isPrimary) ?? rows[0];
      return { slug: best?.slug ?? null };
    } catch {
      return { slug: null } as const;
    }
  }),

  paymentConfig: publicProcedure.query(() => getRazorpayConfig()),

  // =========================================================================
  // Customer Phone Auth — server-side session via HttpOnly cookie
  // =========================================================================
  sendOtp: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(15) }))
    .mutation(async ({ ctx, input }) => {
      const { createOtp } = await import("../db");
      const { normalizePhone, isValidIndianPhone } = await import("../security/phoneValidation");
      const { checkPhoneSendLimit, checkIpOtpLimit } = await import("../security/rateLimit");
      const phone = normalizePhone(input.phone);
      if (!isValidIndianPhone(phone)) {
        throw new Error("Please enter a valid 10-digit Indian mobile number.");
      }
      // --- Fix 2: Phone-specific rate limit for OTP sends ---
      const sendLimit = checkPhoneSendLimit(phone);
      if (!sendLimit.allowed) {
        throw new Error(`Please wait ${sendLimit.retryAfterSeconds} seconds before requesting a new code.`);
      }
      // --- IP-level rate limit for OTP sends (protects against SMS bombing) ---
      const clientIp = (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || "unknown";
      const ipLimit = checkIpOtpLimit(clientIp);
      if (!ipLimit.allowed) {
        throw new Error(`Too many requests. Please try again in ${ipLimit.retryAfterSeconds} seconds.`);
      }
      const result = await createOtp(phone);
      if (process.env.OTP_DEV_LOG_ENABLED === "true" && process.env.NODE_ENV !== "production") {
        console.log(`[OTP-DEV] Phone ${phone}: code = ${result.code}`);
      }
      return { success: true, expiresIn: 600 };
    }),

  verifyOtp: publicProcedure
    .input(z.object({
      phone: z.string().min(10).max(15),
      code: z.string().length(6),
    }))
    .mutation(async ({ ctx, input }) => {
      const { verifyOtp } = await import("../db");
      const { normalizePhone, isValidIndianPhone } = await import("../security/phoneValidation");
      const { checkPhoneVerifyLimit } = await import("../security/rateLimit");
      const phone = normalizePhone(input.phone);
      if (!isValidIndianPhone(phone)) {
        throw new Error("Invalid phone number.");
      }
      // --- Per-phone verify rate limit ---
      const verifyLimit = checkPhoneVerifyLimit(phone);
      if (!verifyLimit.allowed) {
        throw new Error(`Too many verification attempts. Please try again in ${verifyLimit.retryAfterSeconds} seconds.`);
      }
      // --- Per-IP verify rate limit (protects brute-force across phones) ---
      const clientIp = (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || "unknown";
      const { checkIpOtpLimit } = await import("../security/rateLimit");
      const ipVerifyLimit = checkIpOtpLimit(`verify:${clientIp}`);
      if (!ipVerifyLimit.allowed) {
        throw new Error(`Too many verification attempts. Please try again in ${ipVerifyLimit.retryAfterSeconds} seconds.`);
      }
      const result = await verifyOtp(phone, input.code);
      if (!result) {
        throw new Error("Invalid or expired verification code.");
      }
      // --- Set customer session cookie (SameSite=Strict, not None) ---
      const { COOKIE_NAME } = await import("@shared/const");
      const { getCustomerCookieOptions } = await import("../_core/cookies");
      const { sdk } = await import("../_core/sdk");
      const sessionToken = await sdk.signSession(
        { openId: result.openId, appId: "customer-phone", name: result.phone },
        { expiresInMs: 1000 * 60 * 60 * 24 * 30 } // 30 days
      );
      ctx.res.cookie(COOKIE_NAME, sessionToken, getCustomerCookieOptions(ctx.req));
      return {
        success: true,
        isNewUser: result.isNewUser,
        phone: result.phone,
      };
    }),

  // --- Fix 2: customerMe reads identity from session cookie, not client input ---
  customerMe: publicProcedure
    .query(async ({ ctx }) => {
      const { COOKIE_NAME } = await import("@shared/const");
      const { parse: parseCookieHeader } = await import("cookie");
      const { sdk } = await import("../_core/sdk");
      const cookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
      const sessionToken = cookies[COOKIE_NAME];
      if (!sessionToken) return null;
      const session = await sdk.verifySession(sessionToken);
      if (!session) return null;
      const db = await import("../db").then(m => m.getDb());
      if (!db) return null;
      const { users, customerProfiles } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const user = (await db.select().from(users).where(eq(users.openId, session.openId)).limit(1))[0];
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

  customerLogout: publicProcedure
    .mutation(({ ctx }) => {
      const { COOKIE_NAME } = require("@shared/const");
      const { getCustomerCookieOptions } = require("../_core/cookies");
      ctx.res.clearCookie(COOKIE_NAME, {
        ...getCustomerCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true } as const;
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
  // Serviceability — coordinate-based, server-side authoritative
  // =========================================================================
  checkServiceability: publicProcedure
    .input(z.object({
      slug: z.string().min(2),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }))
    .query(async ({ input }) => {
      const { checkServiceability, validateGeoLocation } = await import("../domain/locationService");
      const { getDb } = await import("../db");
      const { restaurants, outlets } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Validate coordinates server-side
      const loc = validateGeoLocation({ latitude: input.latitude, longitude: input.longitude });
      if (!loc.valid) {
        return { serviceable: false as const, reason: "INVALID_LOCATION" as const };
      }

      const db = await getDb();
      if (!db) return { serviceable: false as const, reason: "NO_ACTIVE_OUTLET" as const };

      // Find restaurant
      const restaurant = (await db.select().from(restaurants).where(eq(restaurants.slug, input.slug)).limit(1))[0];
      if (!restaurant) return { serviceable: false as const, reason: "NO_ACTIVE_OUTLET" as const };

      const getOutlets = async (restId: string) => {
        return db.select().from(outlets).where(eq(outlets.restaurantId, restId)) as any;
      };

      // Thread restaurant delivery radius into outlet selection.
      const defaultRadiusKm = restaurant.deliveryRadiusKm ? parseFloat(String(restaurant.deliveryRadiusKm)) : 5;
      const result = await checkServiceability(
        loc.latitude!,
        loc.longitude!,
        restaurant.id,
        getOutlets,
        async (pickup, drop) => {
          const { getDeliveryProvider } = await import("../integrations/shadowfax");
          const provider = getDeliveryProvider(restaurant.id);
          if (provider.checkRouteServiceability) {
            return provider.checkRouteServiceability(pickup, drop);
          }
          return provider.checkServiceability("");
        },
        { defaultRadiusKm: Number.isFinite(defaultRadiusKm) ? defaultRadiusKm : 5 },
      );

      return result;
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

      // Issue 18 / H-07: idempotency via orders.idempotencyKey (unique partial index).
      // Legacy fallback: match orderNumber for rows created before the column existed.
      if (input.idempotencyKey) {
        const { getDb } = await import("../db");
        const db = await getDb();
        if (db) {
          const { orders, payments } = await import("../../drizzle/schema");
          const { eq, or } = await import("drizzle-orm");
          const existing = await db.select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            trackingToken: orders.trackingToken,
            totalPaise: orders.totalPaise,
          })
            .from(orders)
            .where(or(eq(orders.idempotencyKey, input.idempotencyKey), eq(orders.orderNumber, input.idempotencyKey)))
            .limit(1);
          if (existing[0]) {
            // Idempotent return: real trackingToken + provider binding + amount.
            const payment = (await db.select({
              providerOrderId: payments.providerOrderId,
              amountPaise: payments.amountPaise,
            }).from(payments).where(eq(payments.orderId, existing[0].id)).limit(1))[0];
            const idempotentConfig = await getRazorpayConfig();
            return {
              orderId: existing[0].id,
              orderNumber: existing[0].orderNumber,
              trackingToken: existing[0].trackingToken,
              keyId: idempotentConfig.keyId ?? "",
              providerOrderId: payment?.providerOrderId ?? "",
              amountPaise: payment?.amountPaise ?? existing[0].totalPaise,
              currency: "INR",
              alreadyExists: true,
            };
          }
        }
      }

      const localOrder = await createOrderFromValidatedCart({
        userId: 0, // Issue 3: guest user — createOrderFromValidatedCart handles this
        slug: input.slug,
        lines: input.lines,
        address: input.address as Record<string, unknown>,
        couponCode: input.couponCode,
        deliveryNotes: input.deliveryNotes,
        cutleryPreference: input.cutleryPreference,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        idempotencyKey: input.idempotencyKey,
      });

      const provider = await createRazorpayPaymentOrder({
        localOrderId: localOrder.id,
        orderNumber: localOrder.orderNumber,
        amountPaise: localOrder.totalPaise,
        restaurantId: localOrder.restaurantId,
      });

      return {
        orderId: localOrder.id,
        orderNumber: localOrder.orderNumber,
        trackingToken: localOrder.trackingToken,
        ...provider,
      };
    }),

  // M-18: Rate limit payment verification to prevent abuse
  verifyPayment: publicProcedure
    .input(z.object({
      orderId: z.string().min(5),
      providerOrderId: z.string().min(5),
      providerPaymentId: z.string().min(5),
      signature: z.string().min(32).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const { checkIpOtpLimit } = await import("../security/rateLimit");
      const clientIp = (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || "unknown";
      const limit = checkIpOtpLimit(`payment:${clientIp}`);
      if (!limit.allowed) {
        throw new Error(`Too many payment attempts. Please try again in ${limit.retryAfterSeconds} seconds.`);
      }
      return confirmPayment({
        localOrderId: input.orderId,
        providerOrderId: input.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        signature: input.signature,
        source: "browser_callback",
      });
    }),

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
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable.");
      const { deliveries, deliveryStatusHistory, orders, orderStatusHistory, webhookEvents } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");
      const { mapDeliveryStatusToOrderStatus } = await import("../integrations/shadowfax");

      // Verify via provider first (HMAC checked inside handleWebhook).
      // Provider is resolved per-tenant after we locate the delivery row below;
      // start with the default provider for signature verification.
      const bootstrapProvider = getDeliveryProvider();
      const update = await bootstrapProvider.handleWebhook(input.payload, input.signature);
      if (!update) {
        return { ok: true, processed: false };
      }

      // Lookup delivery by providerDeliveryId (canonical webhook key).
      const delivery = (await db.select().from(deliveries)
        .where(eq(deliveries.providerDeliveryId, update.deliveryId))
        .limit(1))[0];
      if (!delivery) {
        // Unknown delivery — record event for observability, acknowledge to stop retries.
        const rawId = String((input.payload as Record<string, unknown>).order_id ?? update.deliveryId ?? "unknown");
        try {
          await db.insert(webhookEvents).values({
            id: nanoid(18),
            provider: "shadowfax",
            eventType: "delivery.status.unknown",
            externalId: rawId,
            payload: input.payload,
            processed: true,
            processingError: "Delivery not found for providerDeliveryId.",
          });
        } catch {
          // Ignore duplicate webhook event (23505) — already recorded.
        }
        return { ok: true, processed: false };
      }

      // Re-verify via the tenant's provider instance (vault credentials).
      const order = (await db.select().from(orders).where(eq(orders.id, delivery.orderId)).limit(1))[0];
      if (order) {
        const tenantProvider = getDeliveryProvider(order.restaurantId);
        if (tenantProvider.getDelivery && delivery.providerDeliveryId) {
          try {
            await tenantProvider.getDelivery(delivery.providerDeliveryId);
          } catch {
            // Provider verification failed — still process the webhook payload
            // (signature already verified); verification failure is noted below.
          }
        }
      }

      const eventExternalId = `${update.deliveryId}:${update.status}:${update.timestamp.toISOString()}`;
      try {
        await db.insert(webhookEvents).values({
          id: nanoid(18),
          provider: "shadowfax",
          eventType: `delivery.${update.status.toLowerCase()}`,
          externalId: eventExternalId,
          payload: input.payload,
          processed: false,
        });
      } catch {
        return { ok: true, processed: true, duplicate: true as const };
      }

      await db.transaction(async (tx) => {
        await tx.update(deliveries).set({
          status: update.status,
          riderName: update.riderName ?? undefined,
          riderPhone: update.riderPhone ?? undefined,
          riderLocation: update.riderLocation ?? undefined,
          providerPayload: update.rawPayload ?? undefined,
        }).where(eq(deliveries.id, delivery.id));

        await tx.insert(deliveryStatusHistory).values({
          id: nanoid(18),
          deliveryId: delivery.id,
          status: update.status,
          note: update.note ?? `Provider status: ${update.status}`,
          rawPayload: update.rawPayload ?? undefined,
        });

        const mappedOrderStatus = mapDeliveryStatusToOrderStatus(update.status);
        if (mappedOrderStatus && order && (order.status === "DELIVERY_REQUESTED" || order.status === "RIDER_ASSIGNED" || order.status === "PICKED_UP" || order.status === "OUT_FOR_DELIVERY")) {
          await tx.update(orders).set({ status: mappedOrderStatus as typeof order.status }).where(eq(orders.id, order.id));
          await tx.insert(orderStatusHistory).values({
            id: nanoid(18),
            orderId: order.id,
            status: mappedOrderStatus as typeof order.status,
            note: `Delivery update: ${update.status}${update.riderName ? ` (rider ${update.riderName})` : ""}`,
          });
        }

        await tx.update(webhookEvents).set({ processed: true })
          .where(and(eq(webhookEvents.provider, "shadowfax"), eq(webhookEvents.externalId, eventExternalId)));
      });

      return { ok: true, processed: true };
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
      const { TRPCError } = await import("@trpc/server");
      const { getOrderForTracking } = await import("../db");
      const result = await getOrderForTracking(input.orderNumber, input.trackingToken);
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      }
      return result;
    }),
});
