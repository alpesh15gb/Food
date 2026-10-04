/**
 * Shared Shadowfax webhook persistence (Express + deprecated tRPC routes).
 * Single code path: AWB lookup → dedupe → tx(status+history+order) → notify.
 */
import type { DeliveryStatusUpdate } from "./shadowfax";

export async function persistShadowfaxWebhookEvent(
  update: DeliveryStatusUpdate,
  rawPayload: Record<string, unknown>,
): Promise<{ processed: boolean; duplicate?: boolean; unknownDelivery?: boolean }> {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable.");
  const { deliveries, deliveryStatusHistory, orders, orderStatusHistory, webhookEvents } =
    await import("../../drizzle/schema");
  const { eq, and, sql } = await import("drizzle-orm");
  const { nanoid } = await import("nanoid");
  const { buildWebhookDedupeKey, mapDeliveryStatusToOrderStatus } = await import("./shadowfax");

  let delivery = (await db.select().from(deliveries)
    .where(eq(deliveries.providerAwb, update.awbNumber))
    .limit(1))[0];
  if (!delivery) {
    delivery = (await db.select().from(deliveries)
      .where(eq(deliveries.providerDeliveryId, update.awbNumber))
      .limit(1))[0];
  }
  if (!delivery && update.clientOrderId) {
    const ord = (await db.select({ id: orders.id }).from(orders)
      .where(eq(orders.orderNumber, update.clientOrderId)).limit(1))[0];
    if (ord) {
      delivery = (await db.select().from(deliveries)
        .where(and(eq(deliveries.orderId, ord.id), eq(deliveries.provider, "shadowfax")))
        .limit(1))[0];
    }
  }
  if (!delivery) {
    try {
      await db.insert(webhookEvents).values({
        id: nanoid(18),
        provider: "shadowfax",
        eventType: `delivery.${update.providerStatus.toLowerCase()}`,
        externalId: `${update.awbNumber}:${update.providerStatus}:unknown-delivery`,
        payload: rawPayload,
        processed: true,
        processingError: "AWB not found in deliveries.",
      });
    } catch { /* already recorded */ }
    return { processed: false, unknownDelivery: true };
  }

  const eventExternalId = buildWebhookDedupeKey({
    awbNumber: update.awbNumber,
    event: update.providerStatus,
    timestamp: update.timestamp.toISOString(),
  });

  // Reserve the event, but only treat a genuine unique violation as a duplicate.
  // Catching every database error here silently discarded real failures: an
  // oversized provider `event` overflows webhookEvents.eventType (varchar 120)
  // and raises 22001, which the old blanket catch reported as "duplicate" and
  // answered 200 — losing the status change with no trace beyond a log line.
  const alreadySeen = (await db.select({ id: webhookEvents.id, processed: webhookEvents.processed })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, "shadowfax"), eq(webhookEvents.externalId, eventExternalId)))
    .limit(1))[0];
  if (alreadySeen?.processed) {
    console.log("[Webhook][metric=webhook_duplicate] shadowfax duplicate delivery event.");
    return { processed: true, duplicate: true };
  }
  if (!alreadySeen) {
    try {
      await db.insert(webhookEvents).values({
        id: nanoid(18),
        provider: "shadowfax",
        eventType: `delivery.${update.providerStatus.toLowerCase()}`.slice(0, 120),
        externalId: eventExternalId.slice(0, 120),
        payload: rawPayload,
        processed: false,
      });
    } catch (err) {
      // 23505 = unique_violation, i.e. a concurrent delivery of the same event.
      // Anything else is a real failure and must not be laundered as a dupe.
      const isUniqueViolation =
        typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
      if (!isUniqueViolation) throw err;
      console.log("[Webhook][metric=webhook_duplicate] shadowfax duplicate delivery event.");
      return { processed: true, duplicate: true };
    }
  }

  const milestoneNote = (s: string) => {
    if (s === "DELIVERED") return "Delivered to customer.";
    if (s === "OUT_FOR_DELIVERY") return "Out for delivery.";
    if (s === "PICKED_UP") return "Picked up from restaurant.";
    return update.note ?? `Provider status: ${update.providerStatus}`;
  };

  await db.transaction(async (tx) => {
    // The order row is read INSIDE the transaction and locked, mirroring
    // updateOrderStatus (db.ts). Reading it before the transaction gave
    // validateTransition a stale snapshot, and the subsequent write carried no
    // status predicate — so a concurrent operator cancel could be overwritten,
    // flipping a CANCELLED, refund-pending order back to RIDER_ASSIGNED and
    // hiding it from the refund queue.
    await tx.execute(sql`SELECT id FROM orders WHERE id = ${delivery.orderId} FOR UPDATE`);
    const order = (await tx.select().from(orders).where(eq(orders.id, delivery.orderId)).limit(1))[0];

    const patch: Record<string, unknown> = {
      status: update.status,
      providerStatus: update.providerStatus,
      lastWebhookAt: new Date(),
      providerPayload: update.rawPayload ?? undefined,
    };
    if (update.riderName) patch.riderName = update.riderName;
    if (update.riderPhone) patch.riderPhone = update.riderPhone;
    if (update.status === "PICKED_UP") {
      patch.pickedUpAt = update.timestamp;
      patch.actualPickup = update.timestamp;
    }
    if (update.status === "OUT_FOR_DELIVERY") patch.outForDeliveryAt = update.timestamp;
    if (update.status === "DELIVERED") {
      patch.deliveredAt = update.timestamp;
      patch.actualDelivery = update.timestamp;
    }
    if (update.status === "CANCELLED") patch.cancelledAt = update.timestamp;
    await tx.update(deliveries).set(patch).where(eq(deliveries.id, delivery.id));

    await tx.insert(deliveryStatusHistory).values({
      id: nanoid(18),
      deliveryId: delivery.id,
      status: update.status,
      note: milestoneNote(update.status),
      rawPayload: update.rawPayload ?? undefined,
    });

    const priorSame = (await tx.select({ id: deliveryStatusHistory.id }).from(deliveryStatusHistory)
      .where(and(eq(deliveryStatusHistory.deliveryId, delivery.id), eq(deliveryStatusHistory.status, update.status)))
      .limit(2));
    const firstSeen = priorSame.length <= 1;

    const mapped = mapDeliveryStatusToOrderStatus(update.status);
    let orderAdvanced = false;
    if (mapped && order && (["DELIVERY_REQUESTED", "RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] as string[]).includes(order.status)) {
      // Machine-gated like every other writer: out-of-order or duplicate
      // provider events move the delivery row but must never corrupt the
      // order timeline (e.g. DELIVERY_REQUESTED straight to DELIVERED, or a
      // late PICKED_UP regressing OUT_FOR_DELIVERY). Rejected jumps still
      // mark processed + notify below — only the order write is skipped.
      const { validateTransition } = await import("../domain/orderStateMachine");
      let machineAllows = false;
      try {
        validateTransition(order.status as never, mapped as never);
        machineAllows = true;
      } catch {
        console.warn(`[Webhook] refusing order jump ${order.status} → ${mapped} (awb=${update.awbNumber}); delivery row still updated.`);
      }
      if (machineAllows) {
        // Compare-and-swap on the status we validated against. If a concurrent
        // writer moved the order since the lock was taken, this affects zero
        // rows and the order write is skipped rather than clobbering it.
        const advanced = await tx.update(orders)
          .set({ status: mapped as typeof order.status })
          .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
          .returning({ id: orders.id });
        if (advanced.length > 0) {
          await tx.insert(orderStatusHistory).values({
            id: nanoid(18),
            orderId: order.id,
            status: mapped as typeof order.status,
            note: `Delivery update: ${update.status}${update.riderName ? ` (rider ${update.riderName})` : ""}`,
          });
          orderAdvanced = true;
        } else {
          console.warn(`[Webhook] order ${order.id} changed status concurrently; delivery row updated without advancing the order.`);
        }
      }
    }

    // Mirror updateOrderStatus() bookkeeping for webhook-driven delivery:
    // deliveredAt + customer lifetime stats. Previously Shadowfax-delivered
    // orders never counted toward the customer's totals. orderAdvanced is only
    // true on a genuine forward transition, so repeats can't double-count.
    if (mapped === "DELIVERED" && orderAdvanced && order) {
      await tx.update(orders).set({ deliveredAt: update.timestamp }).where(eq(orders.id, order.id));
      if (order.customerId) {
        await tx.execute(sql`
          UPDATE customer_profiles
          SET total_orders = total_orders + 1,
              total_spent_paise = total_spent_paise + ${order.totalPaise}
          WHERE id = ${order.customerId}
        `);
      }
    }

    await tx.update(webhookEvents).set({ processed: true })
      .where(and(eq(webhookEvents.provider, "shadowfax"), eq(webhookEvents.externalId, eventExternalId)));

    // Notify on a genuine forward transition only. The gate used to require
    // `!orderAdvanced`, i.e. it fired precisely when the order write was REFUSED
    // — so the happy path (order advances) notified nobody, and the refused path
    // told the customer "delivered" while the database still said DELIVERY_REQUESTED.
    // `orderAdvanced` is also what keeps repeats from double-notifying.
    if (firstSeen && orderAdvanced && order && (update.status === "OUT_FOR_DELIVERY" || update.status === "DELIVERED")) {
      const { sendDeliveryMilestoneNotification } = await import("../db");
      void sendDeliveryMilestoneNotification(order.id, update.status === "DELIVERED" ? "delivered" : "out_for_delivery")
        .catch((err) => console.error("[Webhook] milestone notify failed:", err));
    }
  });
  console.log(`[Webhook][metric=webhook_processed] shadowfax awb=${update.awbNumber} event=${update.providerStatus}`);
  return { processed: true };
}
