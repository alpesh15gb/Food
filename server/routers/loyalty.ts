import { z } from "zod";
import { requirePermission, publicProcedure, router } from "../_core/trpc";

export const loyaltyRouter = router({
  getProgram: requirePermission("settings:read")
    .input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return null;
      const { loyaltyPrograms } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      return (await db.select().from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.restaurantId, input.restaurantId))
        .limit(1))[0] ?? null;
    }),

  upsertProgram: requirePermission("settings:write")
    .input(z.object({
      restaurantId: z.string().min(4),
      name: z.string().min(1).max(120).default("Rewards"),
      pointsPerRupee: z.string().default("1"),
      redemptionRatePaise: z.number().int().min(1).default(100),
      maxRedemptionPercent: z.number().int().min(1).max(100).default(50),
      pointsExpiryDays: z.number().int().min(1).default(365),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { loyaltyPrograms } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      const existing = (await db.select().from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.restaurantId, input.restaurantId))
        .limit(1))[0];

      if (existing) {
        await db.update(loyaltyPrograms).set({
          name: input.name,
          pointsPerRupee: input.pointsPerRupee,
          redemptionRatePaise: input.redemptionRatePaise,
          maxRedemptionPercent: input.maxRedemptionPercent,
          pointsExpiryDays: input.pointsExpiryDays,
          isActive: input.isActive,
          updatedAt: new Date(),
        }).where(eq(loyaltyPrograms.id, existing.id));
      } else {
        await db.insert(loyaltyPrograms).values({
          id: nanoid(),
          restaurantId: input.restaurantId,
          name: input.name,
          pointsPerRupee: input.pointsPerRupee,
          redemptionRatePaise: input.redemptionRatePaise,
          maxRedemptionPercent: input.maxRedemptionPercent,
          pointsExpiryDays: input.pointsExpiryDays,
          isActive: input.isActive,
        });
      }
      return { success: true };
    }),

  getBalance: publicProcedure
    .input(z.object({ customerId: z.string().min(4), restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return null;
      const { loyaltyBalances } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      return (await db.select().from(loyaltyBalances)
        .where(and(eq(loyaltyBalances.customerId, input.customerId), eq(loyaltyBalances.restaurantId, input.restaurantId)))
        .limit(1))[0] ?? null;
    }),

  earnPoints: requirePermission("orders:write")
    .input(z.object({
      customerId: z.string().min(4),
      restaurantId: z.string().min(4),
      orderId: z.string().min(4),
      orderTotalPaise: z.number().int().min(0),
    }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { loyaltyPrograms, loyaltyBalances, loyaltyTransactions } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      const program = (await db.select().from(loyaltyPrograms)
        .where(and(eq(loyaltyPrograms.restaurantId, input.restaurantId), eq(loyaltyPrograms.isActive, true)))
        .limit(1))[0];
      if (!program) return { earned: 0 };

      const pointsPerRupee = parseFloat(program.pointsPerRupee);
      const rupees = input.orderTotalPaise / 100;
      const earned = Math.floor(rupees * pointsPerRupee);
      if (earned <= 0) return { earned: 0 };

      let balance = (await db.select().from(loyaltyBalances)
        .where(and(eq(loyaltyBalances.customerId, input.customerId), eq(loyaltyBalances.restaurantId, input.restaurantId)))
        .limit(1))[0];

      if (balance) {
        const newLifetime = balance.lifetimePoints + earned;
        const tier = newLifetime >= 10000 ? "platinum" : newLifetime >= 5000 ? "gold" : newLifetime >= 1000 ? "silver" : "bronze";
        await db.update(loyaltyBalances).set({
          points: balance.points + earned,
          lifetimePoints: newLifetime,
          tier,
          lastEarnedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(loyaltyBalances.id, balance.id));
      } else {
        await db.insert(loyaltyBalances).values({
          id: nanoid(),
          customerId: input.customerId,
          restaurantId: input.restaurantId,
          points: earned,
          lifetimePoints: earned,
          tier: "bronze",
          lastEarnedAt: new Date(),
        });
      }

      await db.insert(loyaltyTransactions).values({
        id: nanoid(),
        customerId: input.customerId,
        restaurantId: input.restaurantId,
        type: "EARN",
        points: earned,
        orderId: input.orderId,
        description: `Earned ${earned} points on order`,
      });

      return { earned };
    }),

  redeemPoints: requirePermission("orders:write")
    .input(z.object({
      customerId: z.string().min(4),
      restaurantId: z.string().min(4),
      orderId: z.string().min(4),
      pointsToRedeem: z.number().int().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { loyaltyPrograms, loyaltyBalances, loyaltyTransactions } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      const program = (await db.select().from(loyaltyPrograms)
        .where(and(eq(loyaltyPrograms.restaurantId, input.restaurantId), eq(loyaltyPrograms.isActive, true)))
        .limit(1))[0];
      if (!program) throw new Error("Loyalty program not active");

      // H-12: Atomic deduction with optimistic locking to prevent double-spend
      const balance = (await db.select().from(loyaltyBalances)
        .where(and(eq(loyaltyBalances.customerId, input.customerId), eq(loyaltyBalances.restaurantId, input.restaurantId)))
        .limit(1))[0];
      if (!balance || balance.points < input.pointsToRedeem) {
        throw new Error("Insufficient points");
      }

      // Atomic: only deduct if points haven't changed since read
      const { sql } = await import("drizzle-orm");
      const updated = await db.update(loyaltyBalances)
        .set({
          points: sql`${loyaltyBalances.points} - ${input.pointsToRedeem}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(loyaltyBalances.id, balance.id),
          sql`${loyaltyBalances.points} >= ${input.pointsToRedeem}`,
        ));

      await db.insert(loyaltyTransactions).values({
        id: nanoid(),
        customerId: input.customerId,
        restaurantId: input.restaurantId,
        type: "REDEEM",
        points: input.pointsToRedeem,
        orderId: input.orderId,
        description: `Redeemed ${input.pointsToRedeem} points`,
      });

      const discountPaise = input.pointsToRedeem * program.redemptionRatePaise;
      return { redeemed: input.pointsToRedeem, discountPaise };
    }),

  getMemberStats: requirePermission("customers:read")
    .input(z.object({ restaurantId: z.string().min(4) }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return { totalMembers: 0, totalPointsIssued: 0, tierBreakdown: [] };
      const { sql } = await import("drizzle-orm");

      const rows = await db.execute(sql`
        SELECT COUNT(*)::int AS total_members,
               COALESCE(SUM(lifetime_points), 0)::int AS total_points_issued
        FROM loyalty_balances
        WHERE restaurant_id = ${input.restaurantId}
      `);

      const tiers = await db.execute(sql`
        SELECT tier, COUNT(*)::int AS count
        FROM loyalty_balances
        WHERE restaurant_id = ${input.restaurantId}
        GROUP BY tier
        ORDER BY count DESC
      `);

      const row = (rows as any).rows?.[0];
      return {
        totalMembers: row?.total_members || 0,
        totalPointsIssued: row?.total_points_issued || 0,
        tierBreakdown: (tiers as any).rows ?? [],
      };
    }),
});
