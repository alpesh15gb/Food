/**
 * Cloud Kitchen Platform — API Router Composition
 */
import { ADMIN_COOKIE_NAME, CUSTOMER_COOKIE_NAME } from "@shared/const";
import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import { z } from "zod";
import { getAdminCookieOptions, getCustomerCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { upsertUser, getUserByOpenId, createRestaurant, getDb } from "./db";
import { adminRouter } from "./routers/admin";
import { storefrontRouter } from "./routers/storefront";
import { billingRouter } from "./routers/billing";
import { kdsRouter } from "./routers/kds";
import { inventoryRouter } from "./routers/inventory";
import { analyticsRouter } from "./routers/analytics";
import { loyaltyRouter } from "./routers/loyalty";
import { isPlausibleLocalAdminToken, normalizeLocalAdminToken } from "./auth/localAdmin";
import { hashPassword, verifyPassword } from "./security/passwordHash";
import { checkLocalAdminIpLimit, checkLoginEmailLimit, checkLoginIpLimit, checkRegisterIpLimit } from "./security/rateLimit";
import { users, restaurantMembers } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

/**
 * Resolve the client IP for rate limiting. X-Forwarded-For is attacker
 * controlled, so it is trusted ONLY when the app runs behind a configured
 * trusted proxy (TRUSTED_PROXY=1, e.g. nginx/Caddy on the VPS). Otherwise the
 * socket's remote address is authoritative, preventing XFF spoofing from
 * bypassing IP rate limits.
 */
function getClientIp(req: Pick<Request, "headers" | "socket">): string {
  if (process.env.TRUSTED_PROXY === "1") {
    const xff = req.headers["x-forwarded-for"];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    const first = typeof raw === "string" ? raw.split(",")[0]?.trim() : undefined;
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // M-23: Don't leak whether JWT_SECRET is configured — only check LOCAL_ADMIN_TOKEN
    localAdminEnabled: publicProcedure.query(() =>
      Boolean(process.env.LOCAL_ADMIN_TOKEN)
    ),
    localAdminLogin: publicProcedure
      .input(z.object({ token: z.string().max(4096) }))
      .mutation(async ({ ctx, input }) => {
        const clientIp = getClientIp(ctx.req);
        const adminLimit = checkLocalAdminIpLimit(clientIp);
        if (!adminLimit.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Too many administrator login attempts. Try again in ${adminLimit.retryAfterSeconds} seconds.` });
        }
        const submittedToken = normalizeLocalAdminToken(input.token);
        const expected = process.env.LOCAL_ADMIN_TOKEN;
        if (
          !isPlausibleLocalAdminToken(submittedToken) ||
          !expected ||
          expected.length !== submittedToken.length ||
          !timingSafeEqual(Buffer.from(expected), Buffer.from(submittedToken))
        ) {
          throw new Error("The administrator passphrase was not accepted.");
        }
        const openId = "vps-local-administrator";
        await upsertUser({
          openId,
          name: "Kitchen Administrator",
          loginMethod: "vps-local",
          role: "admin",
          lastSignedIn: new Date(),
        });
        const sessionToken = await sdk.signSession(
          { openId, appId: "vps-local", name: "Kitchen Administrator" },
          { expiresInMs: 1000 * 60 * 60 * 12 }
        );
        ctx.res.cookie(ADMIN_COOKIE_NAME, sessionToken, {
          ...getAdminCookieOptions(ctx.req),
          maxAge: 1000 * 60 * 60 * 12,
        });
        return { success: true } as const;
      }),

    register: publicProcedure
      .input(z.object({
        name: z.string().min(2).max(120),
        email: z.string().trim().toLowerCase().email().max(320),
        password: z.string().min(8).max(128),
        restaurantName: z.string().min(2).max(180),
        restaurantSlug: z.string().trim().toLowerCase().min(2).max(64).regex(/^[a-z0-9-]+$/),
        cuisineSummary: z.string().max(500).optional(),
        contactPhone: z.string().max(24).optional(),
        address: z.string().min(5).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        const clientIp = getClientIp(ctx.req);
        const regLimit = checkRegisterIpLimit(clientIp);
        if (!regLimit.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Too many registration attempts. Try again in ${regLimit.retryAfterSeconds} seconds.` });
        }

        // Normalize identifiers: trim + lowercase so "Foo@X.com" and "foo@x.com"
        // map to one account, and slugs are canonical for lookup/routing.
        const email = input.email.trim().toLowerCase();
        const slug = input.restaurantSlug.trim().toLowerCase();

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const existingEmail = await db.select({ id: users.id }).from(users)
          .where(eq(users.email, email)).limit(1);
        if (existingEmail[0]) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
        }

        const pwHash = await hashPassword(input.password);
        const openId = `self_${nanoid(16)}`;

        try {
          await db.insert(users).values({
            openId,
            name: input.name,
            email,
            passwordHash: pwHash,
            loginMethod: "email",
            role: "user", // H-04: Registrants get global role "user". Admin access via restaurantMembers.
            lastSignedIn: new Date(),
          });
        } catch (err: unknown) {
          if (err instanceof Error && err.message.includes("unique") || String(err).includes("23505")) {
            throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
          }
          throw err;
        }

        const restaurantId = await createRestaurant({
          name: input.restaurantName,
          slug,
          cuisineSummary: input.cuisineSummary,
          contactPhone: input.contactPhone,
          address: input.address,
          ownerUserId: undefined,
        });

        const user = await getUserByOpenId(openId);
        if (user) {
          await db.insert(restaurantMembers).values({
            id: nanoid(18),
            userId: user.id,
            restaurantId,
            role: "owner",
            isActive: true,
          });
        }

        // H-03: Use explicit 12-hour expiry for registration session (not default ONE_YEAR_MS)
        const sessionToken = await sdk.signSession(
          { openId, appId: "self-register", name: input.name },
          { expiresInMs: 1000 * 60 * 60 * 12 }
        );
        ctx.res.cookie(ADMIN_COOKIE_NAME, sessionToken, {
          ...getAdminCookieOptions(ctx.req),
          maxAge: 1000 * 60 * 60 * 12,
        });

        return { success: true, restaurantId, slug } as const;
      }),

    login: publicProcedure
      .input(z.object({
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(8).max(72),
      }))
      .mutation(async ({ ctx, input }) => {
        const clientIp = getClientIp(ctx.req);
        const ipLimit = checkLoginIpLimit(clientIp);
        if (!ipLimit.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Too many login attempts. Try again in ${ipLimit.retryAfterSeconds} seconds.` });
        }
        const email = input.email.trim().toLowerCase();
        const emailLimit = checkLoginEmailLimit(email);
        if (!emailLimit.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Too many login attempts for this email. Try again in ${emailLimit.retryAfterSeconds} seconds.` });
        }

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const [user] = await db.select().from(users)
          .where(eq(users.email, email)).limit(1);

        if (!user?.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
        }

        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
        }

        await upsertUser({
          openId: user.openId,
          name: user.name ?? null,
          email: user.email ?? null,
          loginMethod: user.loginMethod ?? "email",
          role: user.role,
          lastSignedIn: new Date(),
        });

        // H-03: Use explicit 12-hour expiry for login session
        const sessionToken = await sdk.signSession(
          { openId: user.openId, appId: "email-login", name: user.name ?? "" },
          { expiresInMs: 1000 * 60 * 60 * 12 }
        );
        ctx.res.cookie(ADMIN_COOKIE_NAME, sessionToken, {
          ...getAdminCookieOptions(ctx.req),
          maxAge: 1000 * 60 * 60 * 12,
        });

        return { success: true } as const;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      // Clear BOTH session cookies: admin (12h options) and customer (30d
      // options). They currently share one name (see shared/const), so this
      // clears with both option sets to cover any path/domain drift.
      ctx.res.clearCookie(ADMIN_COOKIE_NAME, {
        ...getAdminCookieOptions(ctx.req),
        maxAge: -1,
      });
      ctx.res.clearCookie(CUSTOMER_COOKIE_NAME, {
        ...getCustomerCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true } as const;
    }),
  }),
  storefront: storefrontRouter,
  admin: adminRouter,
  billing: billingRouter,
  kds: kdsRouter,
  inventory: inventoryRouter,
  analytics: analyticsRouter,
  loyalty: loyaltyRouter,
});

export type AppRouter = typeof appRouter;
