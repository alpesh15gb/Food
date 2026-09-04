import { z } from "zod";
import { requirePermission, protectedProcedure, router } from "../_core/trpc";

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

  getBalance: protectedProcedure
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
      orderTotalPaise: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new Error("Database unavailable");
      const { loyaltyPrograms, loyaltyBalances, loyaltyTransactions, orders } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      const program = (await db.select().from(loyaltyPrograms)
        .where(and(eq(loyaltyPrograms.restaurantId, input.restaurantId), eq(loyaltyPrograms.isActive, true)))
        .limit(1))[0];
      if (!program) return { earned: 0 };

      // P0: derive amount from the PAID order row — never trust client totals.
      const order = (await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1))[0];
      if (!order || order.restaurantId !== input.restaurantId) {
        throw new Error("Order not found for this restaurant.");
      }
      if (order.customerId !== input.customerId) {
        throw new Error("Order does not belong to this customer.");
      }
      if (order.paymentStatus !== "PAID") {
        throw new Error("Points can only be earned on paid orders.");
      }
      // Idempotency: UNIQUE(order_id, type) — one EARN per order.
      const existingEarn = (await db.select().from(loyaltyTransactions)
        .where(and(eq(loyaltyTransactions.orderId, input.orderId), eq(loyaltyTransactions.type, "EARN")))
        .limit(1))[0];
      if (existingEarn) {
        return { earned: existingEarn.points, alreadyExists: true as const };
      }

      const pointsPerRupee = parseFloat(program.pointsPerRupee);
      const rupees = order.totalPaise / 100;
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

      try {
        await db.insert(loyaltyTransactions).values({
          id: nanoid(),
          customerId: input.customerId,
          restaurantId: input.restaurantId,
          type: "EARN",
          points: earned,
          orderId: input.orderId,
          description: `Earned ${earned} points on order`,
        });
      } catch (err: unknown) {
        // Race: concurrent earn for same order — treat as idempotent (23505).
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("23505") || msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("duplicate")) {
          const raced = (await db.select().from(loyaltyTransactions)
            .where(and(eq(loyaltyTransactions.orderId, input.orderId), eq(loyaltyTransactions.type, "EARN")))
            .limit(1))[0];
          return { earned: raced?.points ?? earned, alreadyExists: true as const };
        }
        throw err;
      }

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
      const { loyaltyPrograms, loyaltyBalances, loyaltyTransactions, orders } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const { nanoid } = await import("nanoid");

      const program = (await db.select().from(loyaltyPrograms)
        .where(and(eq(loyaltyPrograms.restaurantId, input.restaurantId), eq(loyaltyPrograms.isActive, true)))
        .limit(1))[0];
      if (!program) throw new Error("Loyalty program not active");

      // P0: order binding — redeem must attach to a real order of this customer/restaurant.
      const order = (await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1))[0];
      if (!order || order.restaurantId !== input.restaurantId) {
        throw new Error("Order not found for this restaurant.");
      }
      if (order.customerId !== input.customerId) {
        throw new Error("Order does not belong to this customer.");
      }
      // One redemption per order (idempotent guard).
      const existingRedeem = (await db.select().from(loyaltyTransactions)
        .where(and(eq(loyaltyTransactions.orderId, input.orderId), eq(loyaltyTransactions.type, "REDEEM")))
        .limit(1))[0];
      if (existingRedeem) {
        throw new Error("Points have already been redeemed for this order.");
      }

      // P0: cap redemption — percent of order total + absolute paise cap when configured.
      const discountPaise = input.pointsToRedeem * program.redemptionRatePaise;
      const maxPercent = program.maxRedemptionPercent ?? 100;
      const maxByPercent = Math.floor((order.totalPaise * maxPercent) / 100);
      if (discountPaise > maxByPercent) {
        throw new Error(`Redemption exceeds ${maxPercent}% of order value (max ₹${(maxByPercent / 100).toFixed(2)}).`);
      }
      const maxPaise = (program as { maxRedemptionPaise?: number | null }).maxRedemptionPaise;
      if (maxPaise != null && discountPaise > maxPaise) {
        throw new Error(`Redemption exceeds maximum of ₹${(maxPaise / 100).toFixed(2)} per order.`);
      }

      // H-12: Atomic deduction with optimistic locking to prevent double-spend
      const balance = (await db.select().from(loyaltyBalances)
        .where(and(eq(loyaltyBalances.customerId, input.customerId), eq(loyaltyBalances.restaurantId, input.restaurantId)))
        .limit(1))[0];
      if (!balance || balance.points < input.pointsToRedeem) {
        throw new Error("Insufficient points");
      }

      // Atomic: only deduct if points haven't changed since read + rowCount check.
      const { sql } = await import("drizzle-orm");
      const updated = await db.update(loyaltyBalances)
        .set({
          points: sql`${loyaltyBalances.points} - ${input.pointsToRedeem}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(loyaltyBalances.id, balance.id),
          sql`${loyaltyBalances.points} >= ${input.pointsToRedeem}`,
        ))
        .returning({ id: loyaltyBalances.id });
      if (updated.length === 0) {
        throw new Error("Insufficient points (concurrent redemption).");
      }

      await db.insert(loyaltyTransactions).values({
        id: nanoid(),
        customerId: input.customerId,
        restaurantId: input.restaurantId,
        type: "REDEEM",
        points: input.pointsToRedeem,
        orderId: input.orderId,
        description: `Redeemed ${input.pointsToRedeem} points`,
      });

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
