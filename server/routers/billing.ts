import { z } from "zod";
import { adminProcedure, requirePermission, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const billingRouter = router({
  listPlans: adminProcedure.query(async () => {
    const db = await import("../db").then(m => m.getDb());
    if (!db) return [];
    const { subscriptionPlans } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  }),

  getSubscription: requirePermission("settings:read").input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ ctx, input }) => {
      // Tenant isolation: callers bound to a restaurant cannot read another tenant's billing.
      if (ctx.restaurantId && input.restaurantId !== ctx.restaurantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Subscription not found for this restaurant." });
      }
      const db = await import("../db").then(m => m.getDb());
      if (!db) return null;
      const { restaurantSubscriptions, subscriptionPlans } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");

      const [sub] = await db.select({
        id: restaurantSubscriptions.id,
        status: restaurantSubscriptions.status,
        trialEndsAt: restaurantSubscriptions.trialEndsAt,
        currentPeriodStart: restaurantSubscriptions.currentPeriodStart,
        currentPeriodEnd: restaurantSubscriptions.currentPeriodEnd,
        planName: subscriptionPlans.name,
        planTier: subscriptionPlans.tier,
        planPrice: subscriptionPlans.pricePaiseMonthly,
        planFeatures: subscriptionPlans.features,
      })
        .from(restaurantSubscriptions)
        .innerJoin(subscriptionPlans, eq(restaurantSubscriptions.planId, subscriptionPlans.id))
        .where(eq(restaurantSubscriptions.restaurantId, input.restaurantId))
        .orderBy(desc(restaurantSubscriptions.createdAt))
        .limit(1);

      return sub ?? null;
    }),
});
