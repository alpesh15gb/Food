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

// --- Issue 4: Strict address validation ---
const addressSchema = z.object({
  name: z.string().min(1).max(180).optional(),
  flatHouse: z.string().min(1).max(180),
  building: z.string().max(180).optional(),
  street: z.string().max(180).optional(),
  landmark: z.string().max(180).optional(),
  area: z.string().min(1).max(180),
  city: z.string().min(1).max(120),
  postalCode: z.string().regex(/^\d{6}$/),
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

  paymentConfig: publicProcedure
    .input(z.object({ slug: z.string().min(2).optional() }).optional())
    .query(async ({ input }) => {
      if (!input?.slug) return getRazorpayConfig();
      try {
        const { getRestaurantBySlug } = await import("../db");
        const restaurant = await getRestaurantBySlug(input.slug);
        return getRazorpayConfig(restaurant?.id);
      } catch {
        return getRazorpayConfig();
      }
    }),

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
    .mutation(async ({ ctx }) => {
      // Dynamic imports (never require()): the server bundles to ESM where
      // require is undefined and logout would throw on every call.
      const { COOKIE_NAME } = await import("@shared/const");
      const { getCustomerCookieOptions } = await import("../_core/cookies");
      ctx.res.clearCookie(COOKIE_NAME, {
        ...getCustomerCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true } as const;
    }),

  // WhatsApp-inbound OTP status: has the expected OTP arrived via our linked
  // WhatsApp account yet? Returns booleans + expiry ONLY — the OTP value is
  // never exposed. The UI uses this to prompt code entry, not to skip it.
  whatsappOtpStatus: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(15) }))
    .query(async ({ ctx, input }) => {
      const { getRateLimitClientIp, checkIpOtpLimit } = await import("../security/rateLimit");
      const limit = checkIpOtpLimit(`wastatus:${getRateLimitClientIp(ctx.req)}`);
      if (!limit.allowed) {
        throw new Error(`Too many requests. Please try again in ${limit.retryAfterSeconds} seconds.`);
      }
      const { normalizePhone } = await import("../security/phoneValidation");
      const phone = normalizePhone(input.phone);
      const { getWhatsappOtpStatus } = await import("../db");
      return (await getWhatsappOtpStatus(phone)) ?? { hasPending: false, received: false, expiresAt: null };
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
      // Customer pincode enables the Shadowfax pincode-pair check (spec §6).
      // Absent → radius-only result with provider NOT_CHECKED.
      postalCode: z.string().regex(/^\d{6}$/).optional(),
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
      // Shadowfax Unified API has NO route/lat-lng serviceability endpoint
      // (spec §6, §41) — provider checks are pincode-pair based. Radius
      // selection runs first; the provider then verifies outlet pincode
      // (seller_pickup) + customer pincode (customer_delivery) when both are
      // known and the provider is enabled. Otherwise radius-only (NOT_CHECKED).
      const { getDeliveryProvider, isDeliveryProviderConfigured } = await import("../integrations/shadowfax");
      const providerConfigured = await isDeliveryProviderConfigured(restaurant.id).catch(() => false);
      // Pre-select the nearest outlet so the provider pair-check can use its
      // pincode (radius gate still runs authoritatively inside the service).
      let outletPincode: string | null = null;
      if (providerConfigured && input.postalCode) {
        try {
          const { selectBestOutlet } = await import("../domain/locationService");
          const allOutlets = await getOutlets(restaurant.id) as Array<{ postalCode?: unknown; [k: string]: unknown }>;
          const sel = selectBestOutlet(
            allOutlets as never,
            loc.latitude!, loc.longitude!,
            Number.isFinite(defaultRadiusKm) ? defaultRadiusKm : 5,
          );
          const pin = sel ? String((sel.outlet as { postalCode?: unknown }).postalCode ?? "") : "";
          outletPincode = /^\d{6}$/.test(pin) ? pin : null;
        } catch {
          outletPincode = null;
        }
      }
      const result = await checkServiceability(
        loc.latitude!,
        loc.longitude!,
        restaurant.id,
        getOutlets,
        providerConfigured && input.postalCode && outletPincode
          ? async () => {
              const provider = getDeliveryProvider(restaurant.id);
              const pair = await (provider as unknown as {
                checkPincodeServiceability: (i: { pickupPincode: string; deliveryPincode: string }) => Promise<{ serviceable: boolean }>;
              }).checkPincodeServiceability({ pickupPincode: outletPincode as string, deliveryPincode: input.postalCode! });
              return { serviceable: pair.serviceable, estimatedMinutes: undefined };
            }
          : undefined,
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
      let restaurantId: string | undefined;
      try {
        const { getRestaurantBySlug } = await import("../db");
        restaurantId = (await getRestaurantBySlug(input.slug))?.id;
      } catch {
        restaurantId = undefined;
      }
      const config = await getRazorpayConfig(restaurantId);
      if (!config.enabled) {
        throw new Error("Online payment is not configured yet. Please contact the restaurant.");
      }

      // Issue 18 / H-07: idempotency via orders.idempotencyKey (unique partial index).
      // P0 MP-002: lookup ONLY by opaque idempotencyKey. orderNumber is guessable
      // (ORD-<time36>-<6digits>) and must never disclose trackingToken.
      if (input.idempotencyKey) {
        const { getDb } = await import("../db");
        const db = await getDb();
        if (db) {
          const { orders, payments } = await import("../../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const { getRestaurantBySlug } = await import("../db");
          const scopedRestaurant = await getRestaurantBySlug(input.slug).catch(() => null);
          const existing = await db.select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            trackingToken: orders.trackingToken,
            totalPaise: orders.totalPaise,
            restaurantId: orders.restaurantId,
          })
            .from(orders)
            .where(eq(orders.idempotencyKey, input.idempotencyKey))
            .limit(1);
          if (existing[0]) {
            // Tenant-scoped: a key from another restaurant never leaks its order.
            if (scopedRestaurant && existing[0].restaurantId !== scopedRestaurant.id) {
              throw new Error("Duplicate order request. Please retry with a new idempotency key.");
            }
            // Idempotent return: real trackingToken + provider binding + amount.
            const payment = (await db.select({
              providerOrderId: payments.providerOrderId,
              amountPaise: payments.amountPaise,
            }).from(payments).where(eq(payments.orderId, existing[0].id)).limit(1))[0];
            const idempotentConfig = await getRazorpayConfig(existing[0].restaurantId);
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

      // MP-013: free orders (₹0) need no Razorpay — already PLACED server-side.
      if (localOrder.totalPaise === 0) {
        return {
          orderId: localOrder.id,
          orderNumber: localOrder.orderNumber,
          trackingToken: localOrder.trackingToken,
          keyId: "",
          providerOrderId: "",
          amountPaise: 0,
          currency: "INR",
          freeOrder: true as const,
        };
      }

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

  // MP-011: server-authoritative quote preview (fixes client-estimate drift).
  // Computes coupon + per-item tax exactly as checkout, without creating an order.
  quote: publicProcedure
    .input(z.object({
      slug: z.string().min(2),
      lines: z.array(z.object({
        menuItemId: z.string().min(3),
        quantity: z.number().int().min(1).max(20),
        modifierOptionIds: z.array(z.string().min(1)).optional(),
        selectedVariantId: z.string().optional(),
      })).min(1).max(50),
      couponCode: z.string().max(48).optional(),
    }))
    .query(async ({ input }) => {
      const { getStorefront } = await import("../db");
      const { calculateAuthoritativeQuote, validateCoupon } = await import("../domain/orderPricing");
      const storefront = await getStorefront(input.slug);
      if (!storefront) throw new Error("Restaurant not found.");
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable.");
      const { addonGroups, addonOptions, productVariants, coupons } = await import("../../drizzle/schema");
      const { inArray, eq, and } = await import("drizzle-orm");
      // Resolve DB-verified variant/modifier prices (same as checkout).
      const variantIds = input.lines.flatMap(l => l.selectedVariantId ? [l.selectedVariantId] : []);
      const variantMap = new Map<string, number>();
      if (variantIds.length) {
        const rows = await db.select().from(productVariants).where(inArray(productVariants.id, variantIds));
        for (const r of rows) variantMap.set(r.id, r.pricePaise);
      }
      const allOptIds = input.lines.flatMap(l => l.modifierOptionIds ?? []);
      const optMap = new Map<string, { pricePaise: number; name: string }>();
      if (allOptIds.length) {
        const rows = await db.select().from(addonOptions).where(inArray(addonOptions.id, allOptIds));
        for (const r of rows) optMap.set(r.id, { pricePaise: r.pricePaise, name: r.name });
      }
      const catalog = storefront.items.map(i => ({
        id: i.id, name: i.name, pricePaise: i.pricePaise,
        offerPricePaise: i.offerPricePaise ?? null, availability: (i as { availability?: string }).availability ?? "AVAILABLE",
        taxPercent: (i as { taxPercent?: string | null }).taxPercent ?? null,
        packagingFeePaise: (i as { packagingFeePaise?: number | null }).packagingFeePaise ?? null,
        stock: (i as { stock?: number | null }).stock ?? null,
        maxQuantityPerOrder: (i as { maxQuantityPerOrder?: number | null }).maxQuantityPerOrder ?? null,
      }));
      const lines = input.lines.map(l => ({
        menuItemId: l.menuItemId, quantity: l.quantity,
        variantPricePaise: l.selectedVariantId ? (variantMap.get(l.selectedVariantId) ?? 0) : 0,
        modifiers: (l.modifierOptionIds ?? []).map(id => ({
          optionId: id, name: optMap.get(id)?.name ?? id, pricePaise: optMap.get(id)?.pricePaise ?? 0,
        })),
      }));
      const cleanCoupon = input.couponCode?.trim().toUpperCase() || undefined;
      let couponDiscountPaise = 0;
      let couponError: string | undefined;
      if (cleanCoupon) {
        const row = (await db.select().from(coupons).where(
          and(eq(coupons.restaurantId, storefront.restaurant.id), eq(coupons.code, cleanCoupon))
        ).limit(1))[0];
        if (!row) couponError = `Coupon "${cleanCoupon}" is not valid for this restaurant.`;
        else {
          const base = calculateAuthoritativeQuote({
            lines, catalog,
            packagingFeePaise: storefront.restaurant.packagingFeePaise,
            deliveryFeePaise: storefront.restaurant.deliveryFeePaise,
            taxPercent: parseFloat(String(storefront.restaurant.gstPercentage ?? "5")),
          });
          const r = validateCoupon({
            coupon: {
              code: row.code, discountType: row.discountType as "flat" | "percent",
              discountValue: row.discountValue, minOrderPaise: row.minOrderPaise,
              maxDiscountPaise: row.maxDiscountPaise, isActive: row.isActive,
              startsAt: row.startsAt, endsAt: row.endsAt,
              isNewCustomerOnly: row.isNewCustomerOnly,
              totalUsageLimit: row.totalUsageLimit, perCustomerLimit: row.perCustomerLimit,
            },
            cartTotalPaise: base.itemTotalPaise, now: new Date(),
          });
          if (!r.valid) couponError = r.error;
          else couponDiscountPaise = r.discountPaise;
        }
      }
      const quote = calculateAuthoritativeQuote({
        lines, catalog,
        packagingFeePaise: storefront.restaurant.packagingFeePaise,
        deliveryFeePaise: storefront.restaurant.deliveryFeePaise,
        couponDiscountPaise,
        taxPercent: parseFloat(String(storefront.restaurant.gstPercentage ?? "5")),
      });
      return { ...quote, couponError, couponApplied: couponDiscountPaise > 0 };
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
      // Deprecated tRPC path: pass the configured callback secret explicitly.
      // Prefer POST /webhooks/shadowfax (Authorization header). Kept for
      // dashboard test buttons only.
      secret: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { normalizeShadowfaxWebhook } = await import("../integrations/shadowfax");
      const { isValidShadowfaxCallbackSecret } = await import("../integrations/webhookVerify");
      const { persistShadowfaxWebhookEvent } = await import("../integrations/shadowfaxWebhook");
      const configuredSecret = process.env.SHADOWFAX_WEBHOOK_SECRET ?? "";
      if (configuredSecret && !isValidShadowfaxCallbackSecret(input.secret, configuredSecret)) {
        throw new Error("Invalid webhook authentication.");
      }
      const update = normalizeShadowfaxWebhook(input.payload);
      if (!update) return { ok: true, processed: false };
      return persistShadowfaxWebhookEvent(update, input.payload);
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
