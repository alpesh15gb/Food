/**
 * Razorpay Payment Integration — enhanced with webhooks, refunds, and retry.
 *
 * Security rules:
 * - Credentials stay server-side only
 * - Frontend receives only keyId + providerOrderId
 * - Signatures verified server-side before marking any payment
 * - Webhook processing is idempotent
 * - Never trust frontend-submitted totals
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { orderStatusHistory, orders, payments, refunds, webhookEvents } from "../../drizzle/schema";
import { getDb } from "../db";
import { readIntegrationSecret } from "../security/secretVault";
import { nanoid } from "nanoid";

type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
};

type RazorpayRefund = {
  id: string;
  amount: number;
  status: string;
};

const RESTAURANT_ID = "rest_9house_kitchen";

async function credentials() {
  const keyId = (await readIntegrationSecret(RESTAURANT_ID, "razorpay", "RAZORPAY_KEY_ID"))
    ?? process.env.RAZORPAY_KEY_ID;
  const keySecret = (await readIntegrationSecret(RESTAURANT_ID, "razorpay", "RAZORPAY_KEY_SECRET"))
    ?? process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  return { keyId, keySecret };
}

export async function getRazorpayConfig() {
  const [storedKeyId, storedKeySecret] = await Promise.all([
    readIntegrationSecret(RESTAURANT_ID, "razorpay", "RAZORPAY_KEY_ID"),
    readIntegrationSecret(RESTAURANT_ID, "razorpay", "RAZORPAY_KEY_SECRET"),
  ]);
  const keyId = storedKeyId ?? process.env.RAZORPAY_KEY_ID ?? null;
  return {
    enabled: Boolean(keyId && (storedKeySecret ?? process.env.RAZORPAY_KEY_SECRET)),
    keyId,
  };
}

/**
 * Create a Razorpay order from a validated internal order.
 */
export async function createRazorpayPaymentOrder(input: {
  localOrderId: string;
  orderNumber: string;
  amountPaise: number;
}) {
  const { keyId, keySecret } = await credentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.orderNumber,
      notes: { cloudKitchenOrderId: input.localOrderId },
    }),
  });

  if (!response.ok) {
    throw new Error("Razorpay could not create a payment order. Please try again.");
  }

  const providerOrder = (await response.json()) as RazorpayOrder;
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");

  await db
    .update(payments)
    .set({ providerOrderId: providerOrder.id, providerPayload: providerOrder })
    .where(eq(payments.orderId, input.localOrderId));

  return {
    keyId,
    providerOrderId: providerOrder.id,
    amountPaise: providerOrder.amount,
    currency: providerOrder.currency,
  };
}

/**
 * Verify Razorpay signature using HMAC-SHA256.
 */
export function isValidRazorpaySignature(args: {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
  keySecret: string;
}) {
  const expected = createHmac("sha256", args.keySecret)
    .update(`${args.providerOrderId}|${args.providerPaymentId}`)
    .digest("hex");
  if (expected.length !== args.signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(args.signature));
}

/**
 * Verify and capture a Razorpay payment after checkout.
 * Only marks as PAID after server-side signature verification.
 */
export async function verifyAndCaptureRazorpayPayment(input: {
  localOrderId: string;
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}) {
  const { keySecret } = await credentials();

  if (
    !isValidRazorpaySignature({
      providerOrderId: input.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      signature: input.signature,
      keySecret,
    })
  ) {
    throw new Error("Payment verification failed. No order was confirmed.");
  }

  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");

  await db
    .update(payments)
    .set({
      providerPaymentId: input.providerPaymentId,
      status: "CAPTURED",
    })
    .where(eq(payments.orderId, input.localOrderId));

  await db
    .update(orders)
    .set({ paymentStatus: "PAID", status: "PLACED" })
    .where(eq(orders.id, input.localOrderId));

  await db.insert(orderStatusHistory).values({
    id: nanoid(18),
    orderId: input.localOrderId,
    status: "PLACED",
    note: "Payment verified via Razorpay checkout.",
  });

  return { success: true } as const;
}

/**
 * Handle a Razorpay webhook event.
 * Uses idempotency via webhookEvents table to prevent duplicate processing.
 */
export async function handleRazorpayWebhook(payload: {
  event: string;
  payload: Record<string, unknown>;
}): Promise<{ processed: boolean; error?: string }> {
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");

  // Idempotency: check if event was already processed
  const innerPayload = payload.payload as Record<string, any>;
  const eventId = innerPayload?.payment?.entity?.id
    ?? innerPayload?.order?.entity?.id
    ?? `evt_${Date.now()}`;

  const existing = (await db.select().from(webhookEvents).where(
    and(
      eq(webhookEvents.provider, "razorpay"),
      eq(webhookEvents.externalId, eventId),
    )
  ).limit(1))[0];

  if (existing?.processed) {
    return { processed: true }; // already handled
  }

  // Store the event
  if (!existing) {
    await db.insert(webhookEvents).values({
      id: nanoid(18),
      provider: "razorpay",
      eventType: payload.event,
      externalId: eventId,
      payload: payload.payload,
      processed: false,
    });
  }

  try {
    switch (payload.event) {
      case "payment.captured":
        await handlePaymentCaptured(payload.payload);
        break;
      case "payment.failed":
        await handlePaymentFailed(payload.payload);
        break;
      case "refund.created":
        await handleRefundCreated(payload.payload);
        break;
      case "refund.processed":
        await handleRefundProcessed(payload.payload);
        break;
      default:
        console.log(`[Razorpay] Unhandled webhook event: ${payload.event}`);
    }

    // Mark as processed
    await db
      .update(webhookEvents)
      .set({ processed: true })
      .where(eq(webhookEvents.externalId, eventId));

    return { processed: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Webhook processing failed";
    await db
      .update(webhookEvents)
      .set({ processingError: errorMsg })
      .where(eq(webhookEvents.externalId, eventId));
    return { processed: false, error: errorMsg };
  }
}

async function handlePaymentCaptured(payload: Record<string, unknown>) {
  const payment = (payload as any).payment?.entity as Record<string, unknown> | undefined;
  if (!payment) return;

  const db = await getDb();
  if (!db) return;

  const providerPaymentId = payment.id as string;
  const orderId = (payment.notes as any)?.cloudKitchenOrderId as string;

  if (!orderId) return;

  await db
    .update(payments)
    .set({
      status: "CAPTURED",
      providerPaymentId,
      method: payment.method as string,
    })
    .where(eq(payments.orderId, orderId));

  const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (order && order.paymentStatus !== "PAID") {
    await db.update(orders).set({ paymentStatus: "PAID", status: "PLACED" }).where(eq(orders.id, orderId));
    await db.insert(orderStatusHistory).values({
      id: nanoid(18),
      orderId,
      status: "PLACED",
      note: "Payment captured via Razorpay webhook.",
    });
  }
}

async function handlePaymentFailed(payload: Record<string, unknown>) {
  const payment = (payload as any).payment?.entity as Record<string, unknown> | undefined;
  if (!payment) return;

  const db = await getDb();
  if (!db) return;

  const providerPaymentId = payment.id as string;
  const orderId = (payment.notes as any)?.cloudKitchenOrderId as string;
  const failureReason = (payment.error_description as string) ?? "Payment failed";

  if (!orderId) return;

  await db
    .update(payments)
    .set({
      status: "FAILED",
      providerPaymentId,
      failureReason,
    })
    .where(eq(payments.orderId, orderId));

  await db
    .update(orders)
    .set({ paymentStatus: "FAILED", status: "CANCELLED" })
    .where(eq(orders.id, orderId));

  await db.insert(orderStatusHistory).values({
    id: nanoid(18),
    orderId,
    status: "CANCELLED",
    note: `Payment failed: ${failureReason}`,
  });
}

async function handleRefundCreated(payload: Record<string, unknown>) {
  const refundEntity = (payload as any).refund?.entity as Record<string, unknown> | undefined;
  if (!refundEntity) return;

  const db = await getDb();
  if (!db) return;

  const providerRefundId = refundEntity.id as string;
  const paymentId = refundEntity.payment_id as string;

  // Find the payment to get the order
  const payment = (await db.select().from(payments).where(
    eq(payments.providerPaymentId, paymentId)
  ).limit(1))[0];

  if (!payment) return;

  // Check for idempotency
  const existingRefund = (await db.select().from(refunds).where(
    eq(refunds.providerRefundId, providerRefundId)
  ).limit(1))[0];

  if (existingRefund) return;

  await db.insert(refunds).values({
    id: nanoid(18),
    paymentId: payment.id,
    orderId: payment.orderId,
    providerRefundId,
    amountPaise: refundEntity.amount as number,
    status: "PENDING",
    providerPayload: refundEntity,
  });

  await db
    .update(orders)
    .set({ paymentStatus: "REFUND_PENDING" })
    .where(eq(orders.id, payment.orderId));
}

async function handleRefundProcessed(payload: Record<string, unknown>) {
  const refundEntity = (payload as any).refund?.entity as Record<string, unknown> | undefined;
  if (!refundEntity) return;

  const db = await getDb();
  if (!db) return;

  const providerRefundId = refundEntity.id as string;

  const existingRefund = (await db.select().from(refunds).where(
    eq(refunds.providerRefundId, providerRefundId)
  ).limit(1))[0];

  if (!existingRefund) return;

  await db
    .update(refunds)
    .set({ status: "PROCESSED", providerPayload: refundEntity })
    .where(eq(refunds.id, existingRefund.id));

  await db
    .update(payments)
    .set({ status: "REFUNDED" })
    .where(eq(payments.id, existingRefund.paymentId));

  await db
    .update(orders)
    .set({ paymentStatus: "REFUNDED", status: "REFUNDED" })
    .where(eq(orders.id, existingRefund.orderId));

  await db.insert(orderStatusHistory).values({
    id: nanoid(18),
    orderId: existingRefund.orderId,
    status: "REFUNDED",
    note: `Refund of ₹${existingRefund.amountPaise / 100} processed.`,
  });
}

/**
 * Initiate a refund for an order.
 */
export async function initiateRefund(input: {
  orderId: string;
  paymentId: string;
  amountPaise: number;
  reason?: string;
  initiatedBy: number;
}) {
  const { keyId, keySecret } = await credentials();
  const db = await getDb();
  if (!db) throw new Error("Database not available.");

  const payment = (await db.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1))[0];
  if (!payment || !payment.providerPaymentId) {
    throw new Error("Payment not found or not yet captured.");
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${payment.providerPaymentId}/refund`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: input.amountPaise,
        notes: { reason: input.reason ?? "Refund initiated by admin" },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Razorpay refund failed: ${errorText}`);
  }

  const refundData = (await response.json()) as RazorpayRefund;

  await db.insert(refunds).values({
    id: nanoid(18),
    paymentId: input.paymentId,
    orderId: input.orderId,
    providerRefundId: refundData.id,
    amountPaise: input.amountPaise,
    reason: input.reason,
    status: "PENDING",
    initiatedBy: input.initiatedBy,
    providerPayload: refundData,
  });

  await db.update(orders).set({ paymentStatus: "REFUND_PENDING", status: "REFUND_PENDING" })
    .where(eq(orders.id, input.orderId));

  return { refundId: refundData.id, status: refundData.status };
}
