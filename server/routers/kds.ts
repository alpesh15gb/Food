import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { requirePermission, router } from "../_core/trpc";

// Linear kitchen flow for idempotency: a KDS action for a state at-or-before the
// current position is a successful no-op (covers retries after the order moved on).
const KDS_FLOW = ["PLACED", "RESTAURANT_ACCEPTED", "PREPARING", "READY_FOR_PICKUP"] as const;
function isAtOrBeyond(current: string, target: (typeof KDS_FLOW)[number]): boolean {
  const cur = KDS_FLOW.indexOf(current as (typeof KDS_FLOW)[number]);
  const tgt = KDS_FLOW.indexOf(target);
  return cur >= tgt && cur !== -1;
}

function toTrpcStatusError(err: unknown): TRPCError {
  const msg = err instanceof Error ? err.message : String(err);
  // InvalidTransitionError and validation messages are safe; PG internals are not.
  if (/^Cannot transition order from /.test(msg)) {
    return new TRPCError({ code: "BAD_REQUEST", message: msg });
  }
  if (/payment verification flow|modified concurrently|currently unavailable|Insufficient stock|Invalid /.test(msg)) {
    return new TRPCError({ code: "BAD_REQUEST", message: msg });
  }
  return new TRPCError({ code: "BAD_REQUEST", message: "Order status could not be updated." });
}

export const kdsRouter = router({
  // C-07 fix: slug is required to prevent cross-tenant data leak
  getActiveOrders: requirePermission("orders:read").input(z.object({
    slug: z.string().min(2),
    // Reserved for future station routing; currently informational only.
    station: z.string().optional(),
  }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { orders, orderItems } = await import("../../drizzle/schema");
      const { eq, and, inArray } = await import("drizzle-orm");

      const activeStatuses = [...KDS_FLOW];

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

      if (activeOrders.length === 0) return [];
      // Single batched items fetch (avoids N+1 for up to 100 orders).
      const ids = activeOrders.map(o => o.id);
      const allItems = await db.select().from(orderItems).where(inArray(orderItems.orderId, ids));
      const byOrder = new Map<string, typeof allItems>();
      for (const it of allItems) {
        const arr = byOrder.get(it.orderId) ?? [];
        arr.push(it);
        byOrder.set(it.orderId, arr);
      }
      return activeOrders.map(order => ({ ...order, items: byOrder.get(order.id) ?? [] }));
    }),

  bumpOrder: requirePermission("orders:write").input(z.object({ orderId: z.string().min(4), slug: z.string().min(2) }))
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
      // COD/manual (PLACED + PENDING) must flow through KDS; block only failed/cancelled/refund legs.
      if (order.paymentStatus !== "PAID" && order.paymentStatus !== "PENDING") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Order must be paid before KDS actions." });
      }
      if (isAtOrBeyond(order.status, "READY_FOR_PICKUP")) return { success: true, alreadyInState: true as const };
      try {
        validateTransition(order.status, "READY_FOR_PICKUP");
        await updateOrderStatus(input.orderId, "READY_FOR_PICKUP", ctx.user.id, "Marked ready from KDS");
      } catch (err) {
        throw toTrpcStatusError(err);
      }
      return { success: true };
    }),

  setOrderPreparing: requirePermission("orders:write").input(z.object({ orderId: z.string().min(4), slug: z.string().min(2) }))
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
      if (order.paymentStatus !== "PAID" && order.paymentStatus !== "PENDING") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Order must be paid before KDS actions." });
      }
      if (isAtOrBeyond(order.status, "PREPARING")) return { success: true, alreadyInState: true as const };
      try {
        validateTransition(order.status, "PREPARING");
        await updateOrderStatus(input.orderId, "PREPARING", ctx.user.id, "Started preparing from KDS");
      } catch (err) {
        throw toTrpcStatusError(err);
      }
      return { success: true };
    }),

  acceptOrder: requirePermission("orders:write").input(z.object({ orderId: z.string().min(4), slug: z.string().min(2) }))
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
      if (order.paymentStatus !== "PAID" && order.paymentStatus !== "PENDING") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Order must be paid before KDS actions." });
      }
      if (isAtOrBeyond(order.status, "RESTAURANT_ACCEPTED")) return { success: true, alreadyInState: true as const };
      try {
        validateTransition(order.status, "RESTAURANT_ACCEPTED");
        await updateOrderStatus(input.orderId, "RESTAURANT_ACCEPTED", ctx.user.id, "Accepted from KDS");
      } catch (err) {
        throw toTrpcStatusError(err);
      }
      return { success: true };
    }),
});
