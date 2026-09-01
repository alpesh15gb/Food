/**
 * Razorpay Payment Integration — enhanced with webhooks, refunds, and retry.
 *
 * Security rules:
 * - Credentials stay server-side only
 * - Frontend receives only keyId + providerOrderId
 * - Signatures verified server-side before marking any payment
 * - Webhook processing is idempotent via confirmPayment()
 * - Never trust frontend-submitted totals
 *
 * Issue 6: confirmPayment is idempotent — safe for both browser callback and webhook.
 * Issue 7: Webhook HMAC is verified before processing.
 * Issue 13: Failed payments leave order at PENDING_PAYMENT for retry.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { orderStatusHistory, orders, payments, refunds, webhookEvents, restaurants } from "../../drizzle/schema";
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

async function credentials(restaurantId?: string) {
  const keyId = (restaurantId ? await readIntegrationSecret(restaurantId, "razorpay", "RAZORPAY_KEY_ID") : null)
    ?? process.env.RAZORPAY_KEY_ID;
  const keySecret = (restaurantId ? await readIntegrationSecret(restaurantId, "razorpay", "RAZORPAY_KEY_SECRET") : null)
    ?? process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  return { keyId, keySecret };
}

export async function getRazorpayConfig(restaurantId?: string) {
  const [storedKeyId, storedKeySecret] = await Promise.all([
    restaurantId ? readIntegrationSecret(restaurantId, "razorpay", "RAZORPAY_KEY_ID") : Promise.resolve(null),
    restaurantId ? readIntegrationSecret(restaurantId, "razorpay", "RAZORPAY_KEY_SECRET") : Promise.resolve(null),
  ]);
  const keyId = storedKeyId ?? process.env.RAZORPAY_KEY_ID ?? null;
  return {
    enabled: Boolean(keyId && (storedKeySecret ?? process.env.RAZORPAY_KEY_SECRET)),
    keyId,
  };
}

export async function createRazorpayLinkedAccount(input: {
  restaurantId: string;
  restaurantName: string;
  contactEmail: string;
  contactPhone: string;
  legalBusinessName?: string;
  pan?: string;
  gstin?: string;
}): Promise<{ accountId: string }> {
  const { keyId, keySecret } = await credentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const body: Record<string, unknown> = {
    email: input.contactEmail,
    phone: input.contactPhone,
    type: "route",
    legal_business_name: input.legalBusinessName || input.restaurantName,
    profile: {
      category: "food",
      subcategory: "restaurant",
    },
  };
  if (input.pan) body.pan = input.pan;
  if (input.gstin) body.gstin = input.gstin;

  const response = await fetch("https://api.razorpay.com/v2/accounts", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Razorpay Route account creation failed: ${errorText}`);
  }

  const accountData = (await response.json()) as { id: string; status: string };

  const db = await getDb();
  if (!db) throw new Error("Database not available.");

  await db
    .update(restaurants)
    .set({
      razorpayAccountId: accountData.id,
      razorpayAccountStatus: "active",
    })
    .where(eq(restaurants.id, input.restaurantId));

  return { accountId: accountData.id };
}

/**
 * Create a Razorpay order from a validated internal order.
 * When restaurantId is provided and has an active Route linked account,
 * automatically splits payment via the transfers array.
 */
export async function createRazorpayPaymentOrder(input: {
  localOrderId: string;
  orderNumber: string;
  amountPaise: number;
  restaurantId?: string;
}) {
  const { keyId, keySecret } = await credentials();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  let transferAmountPaise: number | null = null;
  let platformFeePaise: number | null = null;
  let transfers: Array<{ account: string; amount: number; currency: string; notes: Record<string, string> }> | undefined;

  if (input.restaurantId) {
    const db = await getDb();
    if (db) {
      const restaurant = (await db.select().from(restaurants).where(eq(restaurants.id, input.restaurantId)).limit(1))[0];
      if (restaurant?.razorpayAccountId && restaurant.razorpayAccountStatus === "active") {
        const feePercent = parseFloat(restaurant.platformFeePercent ?? "0");
        platformFeePaise = Math.round(input.amountPaise * feePercent / 100);
        transferAmountPaise = input.amountPaise - platformFeePaise;
        transfers = [{
          account: restaurant.razorpayAccountId,
          amount: transferAmountPaise,
          currency: "INR",
          notes: { orderId: input.localOrderId },
        }];
      }
    }
  }

  const requestBody: Record<string, unknown> = {
    amount: input.amountPaise,
    currency: "INR",
    receipt: input.orderNumber,
    notes: { cloudKitchenOrderId: input.localOrderId },
  };
  if (transfers) requestBody.transfers = transfers;

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error("Razorpay could not create a payment order. Please try again.");
  }

  const providerOrder = (await response.json()) as RazorpayOrder;
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");

  const paymentUpdate: Record<string, unknown> = {
    providerOrderId: providerOrder.id,
    providerPayload: providerOrder,
  };
  if (transferAmountPaise !== null) paymentUpdate.transferAmountPaise = transferAmountPaise;
  if (platformFeePaise !== null) paymentUpdate.platformFeePaise = platformFeePaise;

  await db
    .update(payments)
    .set(paymentUpdate)
    .where(eq(payments.orderId, input.localOrderId));

  return {
    keyId,
    providerOrderId: providerOrder.id,
    amountPaise: providerOrder.amount,
    currency: providerOrder.currency,
  };
}

/**
 * Issue 7: Verify Razorpay signature using HMAC-SHA256 with timing-safe comparison.
 */
export function isValidRazorpaySignature(args: {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
  keySecret: string;
}) {
  try {
    if (!args.signature || args.signature.length < 32) return false;
    const expected = createHmac("sha256", args.keySecret)
      .update(`${args.providerOrderId}|${args.providerPaymentId}`)
      .digest("hex");
    if (expected.length !== args.signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(args.signature));
  } catch {
    return false;
  }
}

/**
 * Issue 6: Idempotent payment confirmation — safe for both browser callback and webhook.
 *
 * Both paths call this single function. If the order is already confirmed by
 * the same payment, it returns success (no-op). If already confirmed by a
 * different payment, it rejects. This prevents race conditions between the
 * browser callback and Razorpay webhook.
 *
 * Issue 13: On payment failure, order stays PENDING_PAYMENT for retry.
 */
export async function confirmPayment(input: {
  localOrderId: string;
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
  source: "browser_callback" | "webhook";
}): Promise<{ success: boolean; alreadyConfirmed?: boolean; error?: string }> {
  const { keySecret } = await credentials();

  // Verify signature
  if (
    !isValidRazorpaySignature({
      providerOrderId: input.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      signature: input.signature,
      keySecret,
    })
  ) {
    return { success: false, error: "Payment signature verification failed." };
  }

  const db = await getDb();
  if (!db) return { success: false, error: "Database not available." };

  // Fetch current order state
  const order = (await db.select().from(orders).where(eq(orders.id, input.localOrderId)).limit(1))[0];
  if (!order) return { success: false, error: "Order not found." };

  // --- Idempotency: Already confirmed by same payment ---
  if (order.paymentStatus === "PAID" && order.status !== "PENDING_PAYMENT") {
    // Check if same provider payment ID
    const existingPayment = (await db.select().from(payments).where(
      and(eq(payments.orderId, input.localOrderId), eq(payments.providerPaymentId, input.providerPaymentId))
    ).limit(1))[0];
    if (existingPayment) {
      return { success: true, alreadyConfirmed: true };
    }
    // Different payment ID — suspicious
    console.warn(`[Razorpay] Order ${input.localOrderId} already confirmed with different payment. Source: ${input.source}`);
    return { success: false, error: "Order already confirmed with a different payment." };
  }

  // --- Idempotency: Order already cancelled/failed ---
  if (order.status === "CANCELLED" || order.status === "REJECTED") {
    return { success: false, error: "Order has been cancelled or rejected." };
  }

  // --- Issue 18: Atomic transaction for payment confirmation ---
  // All 3 writes (payment update, order update, status history) succeed or fail together.
  await db.transaction(async (tx) => {
    // Update payment record
    await tx
      .update(payments)
      .set({
        providerPaymentId: input.providerPaymentId,
        status: "CAPTURED",
      })
      .where(eq(payments.orderId, input.localOrderId));

    // Update order
    await tx
      .update(orders)
      .set({ paymentStatus: "PAID", status: "PLACED" })
      .where(eq(orders.id, input.localOrderId));

    // Record status history (check for duplicate)
    const existingHistory = (await tx.select().from(orderStatusHistory).where(
      and(eq(orderStatusHistory.orderId, input.localOrderId), eq(orderStatusHistory.status, "PLACED"))
    ).limit(1))[0];

    if (!existingHistory) {
      await tx.insert(orderStatusHistory).values({
        id: nanoid(18),
        orderId: input.localOrderId,
        status: "PLACED",
        note: `Payment verified via ${input.source === "webhook" ? "Razorpay webhook" : "checkout callback"}.`,
      });
    }
  });

  return { success: true };
}

/**
 * Issue 7: Handle Razorpay webhook with HMAC verification.
 * Issue 6: Uses confirmPayment() for idempotent processing.
 * Issue 13: Failed payments keep order at PENDING_PAYMENT for retry.
 */
export async function handleRazorpayWebhook(
  event: string,
  payload: Record<string, unknown>,
  signature?: string
): Promise<{ processed: boolean; error?: string }> {
  const db = await getDb();
  if (!db) throw new Error("The database connection is not available.");

  // --- Issue 7: Verify webhook HMAC signature (mandatory) ---
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Razorpay] RAZORPAY_WEBHOOK_SECRET not configured. Rejecting webhook.");
    return { processed: false, error: "Webhook secret not configured." };
  }
  if (!signature) {
    console.warn("[Razorpay] Webhook received without signature. Rejecting.");
    return { processed: false, error: "Missing webhook signature." };
  }
  {
    const rawBody = JSON.stringify(payload);
    const expectedSig = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (expectedSig.length !== signature.length || !timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature))) {
      console.warn("[Razorpay] Webhook signature verification failed");
      return { processed: false, error: "Invalid webhook signature." };
    }
  }

  // Idempotency: check if event was already processed
  const innerPayload = payload as Record<string, any>;
  const eventId = innerPayload?.payment?.entity?.id
    ?? innerPayload?.order?.entity?.id
    ?? null;

  // --- Issue 16: Reject events with null external_id ---
  if (!eventId) {
    return { processed: false, error: "Webhook event missing provider event ID." };
  }

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
      eventType: event,
      externalId: eventId,
      payload: payload,
      processed: false,
    });
  }

  try {
    switch (event) {
      case "payment.captured": {
        const paymentEntity = (payload as any).payment?.entity;
        if (paymentEntity) {
          const orderId = paymentEntity.notes?.cloudKitchenOrderId;
          if (orderId) {
            await confirmPayment({
              localOrderId: orderId,
              providerOrderId: paymentEntity.order_id ?? "",
              providerPaymentId: paymentEntity.id,
              signature: "webhook_verified", // signature already verified above
              source: "webhook",
            });
          }
        }
        break;
      }
      case "payment.failed": {
        const paymentEntity = (payload as any).payment?.entity;
        if (paymentEntity) {
          await handlePaymentFailed(paymentEntity);
        }
        break;
      }
      case "refund.created": {
        const refundEntity = (payload as any).refund?.entity;
        if (refundEntity) await handleRefundCreated(refundEntity);
        break;
      }
      case "refund.processed": {
        const refundEntity = (payload as any).refund?.entity;
        if (refundEntity) await handleRefundProcessed(refundEntity);
        break;
      }
      default:
        console.log(`[Razorpay] Unhandled webhook event: ${event}`);
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

/**
 * Issue 13: Handle payment failure — order stays PENDING_PAYMENT for retry.
 */
async function handlePaymentFailed(payment: Record<string, unknown>) {
  const providerPaymentId = payment.id as string;
  const orderId = (payment.notes as any)?.cloudKitchenOrderId as string;
  const failureReason = (payment.error_description as string) ?? "Payment failed";

  if (!orderId) return;

  const db = await getDb();
  if (!db) return;

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "FAILED",
        providerPaymentId,
        failureReason,
      })
      .where(eq(payments.orderId, orderId));

    // Issue 13: Keep order at PENDING_PAYMENT (not CANCELLED) — allow retry
    const order = (await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (order && order.status === "PENDING_PAYMENT") {
      await tx.insert(orderStatusHistory).values({
        id: nanoid(18),
        orderId,
        status: "PENDING_PAYMENT",
        note: `Payment attempt failed: ${failureReason}. Customer may retry.`,
      });
    }
  });
}

async function handleRefundCreated(refundEntity: Record<string, unknown>) {
  const providerRefundId = refundEntity.id as string;
  const paymentId = refundEntity.payment_id as string;

  const db = await getDb();
  if (!db) return;

  const payment = (await db.select().from(payments).where(
    eq(payments.providerPaymentId, paymentId)
  ).limit(1))[0];
  if (!payment) return;

  // Check for idempotency
  const existingRefund = (await db.select().from(refunds).where(
    eq(refunds.providerRefundId, providerRefundId)
  ).limit(1))[0];
  if (existingRefund) return;

  await db.transaction(async (tx) => {
    await tx.insert(refunds).values({
      id: nanoid(18),
      paymentId: payment.id,
      orderId: payment.orderId,
      providerRefundId,
      amountPaise: refundEntity.amount as number,
      status: "PENDING",
      providerPayload: refundEntity,
    });

    await tx
      .update(orders)
      .set({ paymentStatus: "REFUND_PENDING" })
      .where(eq(orders.id, payment.orderId));
  });
}

async function handleRefundProcessed(refundEntity: Record<string, unknown>) {
  const providerRefundId = refundEntity.id as string;

  const db = await getDb();
  if (!db) return;

  const existingRefund = (await db.select().from(refunds).where(
    eq(refunds.providerRefundId, providerRefundId)
  ).limit(1))[0];
  if (!existingRefund) return;

  await db.transaction(async (tx) => {
    await tx
      .update(refunds)
      .set({ status: "PROCESSED", providerPayload: refundEntity })
      .where(eq(refunds.id, existingRefund.id));

    await tx
      .update(payments)
      .set({ status: "REFUNDED" })
      .where(eq(payments.id, existingRefund.paymentId));

    await tx
      .update(orders)
      .set({ paymentStatus: "REFUNDED", status: "REFUNDED" })
      .where(eq(orders.id, existingRefund.orderId));

    await tx.insert(orderStatusHistory).values({
      id: nanoid(18),
      orderId: existingRefund.orderId,
      status: "REFUNDED",
      note: `Refund of ₹${existingRefund.amountPaise / 100} processed.`,
    });
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
  if (payment.status !== "CAPTURED") {
    throw new Error(`Cannot refund a payment with status "${payment.status}". Only captured payments can be refunded.`);
  }
  if (input.amountPaise <= 0) {
    throw new Error("Refund amount must be greater than zero.");
  }

  const alreadyRefunded = (await db.select({ total: sql<number>`COALESCE(SUM(${refunds.amountPaise}), 0)` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, input.paymentId), sql`${refunds.status} != 'FAILED'`)))[0]?.total ?? 0;

  if (input.amountPaise + alreadyRefunded > payment.amountPaise) {
    const remaining = payment.amountPaise - alreadyRefunded;
    throw new Error(`Refund amount exceeds remaining refundable amount. Maximum refundable: ₹${remaining / 100}.`);
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

  await db.transaction(async (tx) => {
    await tx.insert(refunds).values({
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

    await tx.update(orders).set({ paymentStatus: "REFUND_PENDING", status: "REFUND_PENDING" })
      .where(eq(orders.id, input.orderId));
  });

  return { refundId: refundData.id, status: refundData.status };
}
