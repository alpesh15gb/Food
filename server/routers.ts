/**
 * Cloud Kitchen Platform — API Router Composition
 */
import { COOKIE_NAME } from "@shared/const";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { upsertUser } from "./db";
import { adminRouter } from "./routers/admin";
import { storefrontRouter } from "./routers/storefront";
import { isPlausibleLocalAdminToken, normalizeLocalAdminToken } from "./auth/localAdmin";

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
});

export type AppRouter = typeof appRouter;
