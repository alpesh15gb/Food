/**
 * Cloud Kitchen Platform — API Router Composition
 */
import { COOKIE_NAME } from "@shared/const";
import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
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
import { users, restaurantMembers } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    localAdminEnabled: publicProcedure.query(() =>
      Boolean(process.env.LOCAL_ADMIN_TOKEN && process.env.JWT_SECRET)
    ),
    localAdminLogin: publicProcedure
      .input(z.object({ token: z.string().max(4096) }))
      .mutation(async ({ ctx, input }) => {
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
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: 1000 * 60 * 60 * 12,
        });
        return { success: true } as const;
      }),

    register: publicProcedure
      .input(z.object({
        name: z.string().min(2).max(120),
        email: z.string().email().max(320),
        password: z.string().min(8).max(128),
        restaurantName: z.string().min(2).max(180),
        restaurantSlug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
        cuisineSummary: z.string().max(500).optional(),
        contactPhone: z.string().max(24).optional(),
        address: z.string().min(5).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const existingEmail = await db.select({ id: users.id }).from(users)
          .where(eq(users.email, input.email)).limit(1);
        if (existingEmail[0]) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
        }

        const pwHash = await hashPassword(input.password);
        const openId = `self_${nanoid(16)}`;

        await db.insert(users).values({
          openId,
          name: input.name,
          email: input.email,
          passwordHash: pwHash,
          loginMethod: "email",
          role: "admin",
          lastSignedIn: new Date(),
        });

        const restaurantId = await createRestaurant({
          name: input.restaurantName,
          slug: input.restaurantSlug,
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

        const sessionToken = await sdk.createSessionToken(openId, { name: input.name });
        ctx.res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(ctx.req));

        return { success: true, restaurantId } as const;
      }),

    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const [user] = await db.select().from(users)
          .where(eq(users.email, input.email)).limit(1);

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

        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? "" });
        ctx.res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(ctx.req));

        return { success: true } as const;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, {
        ...getSessionCookieOptions(ctx.req),
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
