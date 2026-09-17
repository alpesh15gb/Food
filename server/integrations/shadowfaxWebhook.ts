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

  const order = (await db.select().from(orders).where(eq(orders.id, delivery.orderId)).limit(1))[0];
  const eventExternalId = buildWebhookDedupeKey({
    awbNumber: update.awbNumber,
    event: update.providerStatus,
    timestamp: update.timestamp.toISOString(),
  });
  try {
    await db.insert(webhookEvents).values({
      id: nanoid(18),
      provider: "shadowfax",
      eventType: `delivery.${update.providerStatus.toLowerCase()}`,
      externalId: eventExternalId,
      payload: rawPayload,
      processed: false,
    });
  } catch {
    console.log("[Webhook][metric=webhook_duplicate] shadowfax duplicate delivery event.");
    return { processed: true, duplicate: true };
  }

  const milestoneNote = (s: string) => {
    if (s === "DELIVERED") return "Delivered to customer.";
    if (s === "OUT_FOR_DELIVERY") return "Out for delivery.";
    if (s === "PICKED_UP") return "Picked up from restaurant.";
    return update.note ?? `Provider status: ${update.providerStatus}`;
  };

  await db.transaction(async (tx) => {
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
      await tx.update(orders).set({ status: mapped as typeof order.status }).where(eq(orders.id, order.id));
      await tx.insert(orderStatusHistory).values({
        id: nanoid(18),
        orderId: order.id,
        status: mapped as typeof order.status,
        note: `Delivery update: ${update.status}${update.riderName ? ` (rider ${update.riderName})` : ""}`,
      });
      orderAdvanced = true;
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

    if (firstSeen && !orderAdvanced && order && (update.status === "OUT_FOR_DELIVERY" || update.status === "DELIVERED")) {
      const { sendDeliveryMilestoneNotification } = await import("../db");
      void sendDeliveryMilestoneNotification(order.id, update.status === "DELIVERED" ? "delivered" : "out_for_delivery")
        .catch((err) => console.error("[Webhook] milestone notify failed:", err));
    }
  });
  console.log(`[Webhook][metric=webhook_processed] shadowfax awb=${update.awbNumber} event=${update.providerStatus}`);
  return { processed: true };
}
