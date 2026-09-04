import { z } from "zod";
import { TRPCError } from "@trpc/server";
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

  bumpOrder: adminProcedure.input(z.object({ orderId: z.string().min(4), slug: z.string().min(2) }))
    .mutation(async ({ ctx, input }) => {
      const { updateOrderStatus, getOrderWithItems, getRestaurantBySlug } = await import("../db");
      const { validateTransition } = await import("../domain/orderStateMachine");
      const rest = await getRestaurantBySlug(input.slug);
      if (!rest?.id) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant not found." });
      const order = await getOrderWithItems(input.orderId);
      if (!order || order.restaurantId !== rest.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Order not found for this restaurant." });
      }
      if (ctx.restaurantId && order.restaurantId !== ctx.restaurantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Order not found for this restaurant." });
      }
      if (order.paymentStatus !== "PAID") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Order must be paid before KDS actions." });
      }
      if (order.status === "READY_FOR_PICKUP") return { success: true, alreadyInState: true as const };
      validateTransition(order.status, "READY_FOR_PICKUP");
      await updateOrderStatus(input.orderId, "READY_FOR_PICKUP", ctx.user.id, "Marked ready from KDS");
      return { success: true };
    }),

  setOrderPreparing: adminProcedure.input(z.object({ orderId: z.string().min(4), slug: z.string().min(2) }))
    .mutation(async ({ ctx, input }) => {
      const { updateOrderStatus, getOrderWithItems, getRestaurantBySlug } = await import("../db");
      const { validateTransition } = await import("../domain/orderStateMachine");
      const rest = await getRestaurantBySlug(input.slug);
      if (!rest?.id) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant not found." });
      const order = await getOrderWithItems(input.orderId);
      if (!order || order.restaurantId !== rest.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Order not found for this restaurant." });
      }
      if (ctx.restaurantId && order.restaurantId !== ctx.restaurantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Order not found for this restaurant." });
      }
      if (order.paymentStatus !== "PAID") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Order must be paid before KDS actions." });
      }
      if (order.status === "PREPARING") return { success: true, alreadyInState: true as const };
      validateTransition(order.status, "PREPARING");
      await updateOrderStatus(input.orderId, "PREPARING", ctx.user.id, "Started preparing from KDS");
      return { success: true };
    }),

  acceptOrder: adminProcedure.input(z.object({ orderId: z.string().min(4), slug: z.string().min(2) }))
    .mutation(async ({ ctx, input }) => {
      const { updateOrderStatus, getOrderWithItems, getRestaurantBySlug } = await import("../db");
      const { validateTransition } = await import("../domain/orderStateMachine");
      const rest = await getRestaurantBySlug(input.slug);
      if (!rest?.id) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant not found." });
      const order = await getOrderWithItems(input.orderId);
      if (!order || order.restaurantId !== rest.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Order not found for this restaurant." });
      }
      if (ctx.restaurantId && order.restaurantId !== ctx.restaurantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Order not found for this restaurant." });
      }
      if (order.paymentStatus !== "PAID") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Order must be paid before KDS actions." });
      }
      if (order.status === "RESTAURANT_ACCEPTED") return { success: true, alreadyInState: true as const };
      validateTransition(order.status, "RESTAURANT_ACCEPTED");
      await updateOrderStatus(input.orderId, "RESTAURANT_ACCEPTED", ctx.user.id, "Accepted from KDS");
      return { success: true };
    }),
});
