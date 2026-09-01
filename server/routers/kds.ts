import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";

export const kdsRouter = router({
  // C-07 fix: slug is required to prevent cross-tenant data leak
  getActiveOrders: adminProcedure.input(z.object({
    slug: z.string().min(2),
    station: z.string().optional(),
  }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { orders, orderItems } = await import("../../drizzle/schema");
      const { eq, and, inArray, desc } = await import("drizzle-orm");

      const activeStatuses = ["PLACED", "RESTAURANT_ACCEPTED", "PREPARING", "READY_FOR_PICKUP"] as const;

      const { getRestaurantBySlug } = await import("../db");
      const rest = await getRestaurantBySlug(input.slug);
      if (!rest?.id) return [];

      // Always filter by restaurant — never return all tenants' orders
      const conditions = [
        inArray(orders.status, [...activeStatuses]),
        eq(orders.restaurantId, rest.id),
      ];

      // M-09: Add LIMIT to prevent unbounded query
      const activeOrders = await db.select().from(orders)
        .where(and(...conditions))
        .orderBy(orders.createdAt)
        .limit(100);

      const result = [];
      for (const order of activeOrders) {
        const items = await db.select().from(orderItems)
          .where(eq(orderItems.orderId, order.id));
        result.push({ ...order, items });
      }

      return result;
    }),

  bumpOrder: adminProcedure.input(z.object({ orderId: z.string().min(4) }))
    .mutation(async ({ ctx, input }) => {
      const { updateOrderStatus } = await import("../db");
      await updateOrderStatus(input.orderId, "READY_FOR_PICKUP", ctx.user.id, "Marked ready from KDS");
      return { success: true };
    }),

  setOrderPreparing: adminProcedure.input(z.object({ orderId: z.string().min(4) }))
    .mutation(async ({ ctx, input }) => {
      const { updateOrderStatus } = await import("../db");
      await updateOrderStatus(input.orderId, "PREPARING", ctx.user.id, "Started preparing from KDS");
      return { success: true };
    }),

  acceptOrder: adminProcedure.input(z.object({ orderId: z.string().min(4) }))
    .mutation(async ({ ctx, input }) => {
      const { updateOrderStatus } = await import("../db");
      await updateOrderStatus(input.orderId, "RESTAURANT_ACCEPTED", ctx.user.id, "Accepted from KDS");
      return { success: true };
    }),
});
