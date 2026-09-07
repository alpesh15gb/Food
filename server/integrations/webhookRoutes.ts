/**
 * Production webhook routes with RAW-BODY HMAC verification (P0 MP-001).
 *
 * Mount BEFORE express.json() — the HMAC must cover the exact bytes the
 * provider signed. tRPC routes (`storefront.razorpayWebhook`) only see parsed
 * JSON and can never verify correctly; they remain for backwards-compat test
 * buttons and log a warning directing operators to these routes.
 *
 *   POST /webhooks/razorpay   — header x-razorpay-signature
 *   POST /webhooks/shadowfax  — headers x-shadowfax-signature / x-sf-* / x-webhook-signature
 *   GET  /webhooks/health     — liveness for provider dashboards (no secrets)
 */
import type { Express, Request, Response } from "express";
import express from "express";
import {
  getRazorpaySignatureFromHeaders,
  getShadowfaxSignatureFromHeaders,
  parseRawJsonBody,
  verifyRazorpayRawSignature,
  verifyShadowfaxRawSignature,
} from "./webhookVerify";
import { handleRazorpayWebhookRaw } from "./razorpay";
import { getDeliveryProvider } from "./shadowfax";

const RAW_LIMIT = "1mb";

function jsonError(res: Response, status: number, error: string) {
  return res.status(status).json({ ok: false, processed: false, error });
}

/** Extract {event, payload} from a Razorpay webhook body (tolerates wrappers). */
function normalizeRazorpayBody(json: unknown): { event: string; payload: Record<string, unknown> } | null {
  if (!json || typeof json !== "object") return null;
  const body = json as Record<string, unknown>;
  const event = typeof body.event === "string" ? body.event : undefined;
  if (!event) return null;
  // Standard Razorpay body: {event, payload:{payment:{entity...}}}.
  // Our processor expects `payload` = inner object with .payment/.refund/.order.
  const inner = (body.payload && typeof body.payload === "object"
    ? body.payload
    : body) as Record<string, unknown>;
  return { event, payload: inner };
}

export function registerWebhookRoutes(app: Express) {
  // --- Razorpay (raw body) -------------------------------------------------
  app.post(
    "/webhooks/razorpay",
    express.raw({ type: "*/*", limit: RAW_LIMIT }),
    async (req: Request, res: Response) => {
      const raw = req.body as Buffer;
      if (!Buffer.isBuffer(raw)) return jsonError(res, 400, "Raw body required.");
      if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
        console.error("[Webhook] RAZORPAY_WEBHOOK_SECRET not configured. Rejecting.");
        return jsonError(res, 503, "Webhook secret not configured.");
      }
      const signature =
        getRazorpaySignatureFromHeaders(req.headers as Record<string, unknown>) ??
        (req.query.signature as string | undefined);
      if (!signature) return jsonError(res, 401, "Missing webhook signature.");
      if (!verifyRazorpayRawSignature(raw, signature)) {
        console.warn("[Webhook] Razorpay raw signature mismatch.");
        return jsonError(res, 401, "Invalid webhook signature.");
      }
      const parsed = parseRawJsonBody(raw);
      if (!parsed.ok) return jsonError(res, 400, parsed.error);
      const normalized = normalizeRazorpayBody(parsed.json);
      if (!normalized) return jsonError(res, 400, "Webhook body missing event.");
      try {
        const result = await handleRazorpayWebhookRaw(normalized);
        // Always 200 on verified payloads (even unknown events) so Razorpay
        // stops retrying; processing errors are in the body for observability.
        return res.status(200).json({ ok: true, ...result });
      } catch (err) {
        console.error("[Webhook] Razorpay processing failed:", err);
        return res.status(200).json({ ok: false, processed: false, error: "Processing failed." });
      }
    }
  );

  // --- Shadowfax (raw body) -------------------------------------------------
  app.post(
    "/webhooks/shadowfax",
    express.raw({ type: "*/*", limit: RAW_LIMIT }),
    async (req: Request, res: Response) => {
      const raw = req.body as Buffer;
      if (!Buffer.isBuffer(raw)) return jsonError(res, 400, "Raw body required.");
      if (!process.env.SHADOWFAX_WEBHOOK_SECRET) {
        console.error("[Webhook] SHADOWFAX_WEBHOOK_SECRET not configured. Rejecting.");
        return jsonError(res, 503, "Webhook secret not configured.");
      }
      const signature =
        getShadowfaxSignatureFromHeaders(req.headers as Record<string, unknown>) ??
        (req.query.signature as string | undefined);
      if (!signature) return jsonError(res, 401, "Missing webhook signature.");
      if (!verifyShadowfaxRawSignature(raw, signature)) {
        console.warn("[Webhook] Shadowfax raw signature mismatch.");
        return jsonError(res, 401, "Invalid webhook signature.");
      }
      const parsed = parseRawJsonBody(raw);
      if (!parsed.ok) return jsonError(res, 400, parsed.error);
      if (!parsed.json || typeof parsed.json !== "object") return jsonError(res, 400, "Invalid payload.");
      const payload = parsed.json as Record<string, unknown>;
      try {
        // Reuse the storefront transaction logic by delegating to the default
        // provider's verified mapper, then persist via the same path as tRPC.
        // To avoid duplicating the DB transaction, forward to the existing
        // tRPC-equivalent persistence inline (mirror of storefront.shadowfaxWebhook
        // core, minus signature — already verified).
        const { getDb } = await import("../db");
        const db = await getDb();
        if (!db) return jsonError(res, 503, "Database unavailable.");
        const bootstrap = getDeliveryProvider();
        const verified = bootstrap as unknown as { handleWebhookVerified?: (p: Record<string, unknown>) => Promise<import("./shadowfax").DeliveryStatusUpdate | null> };
        const update = verified.handleWebhookVerified
          ? await verified.handleWebhookVerified(payload)
          : await bootstrap.handleWebhook(payload, "__raw_verified__").catch(() => null);
        if (!update) return res.status(200).json({ ok: true, processed: false });
        const { deliveries, deliveryStatusHistory, orders, orderStatusHistory, webhookEvents } =
          await import("../../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const { nanoid } = await import("nanoid");
        const { mapDeliveryStatusToOrderStatus } = await import("./shadowfax");

        const delivery = (await db.select().from(deliveries)
          .where(eq(deliveries.providerDeliveryId, update.deliveryId))
          .limit(1))[0];
        if (!delivery) {
          return res.status(200).json({ ok: true, processed: false, error: "Unknown delivery." });
        }
        const order = (await db.select().from(orders).where(eq(orders.id, delivery.orderId)).limit(1))[0];
        const eventExternalId = `${update.deliveryId}:${update.status}:${update.timestamp.toISOString()}`;
        try {
          await db.insert(webhookEvents).values({
            id: nanoid(18),
            provider: "shadowfax",
            eventType: `delivery.${update.status.toLowerCase()}`,
            externalId: eventExternalId,
            payload,
            processed: false,
          });
        } catch {
          return res.status(200).json({ ok: true, processed: true, duplicate: true });
        }
        await db.transaction(async (tx) => {
          await tx.update(deliveries).set({
            status: update.status,
            riderName: update.riderName ?? undefined,
            riderPhone: update.riderPhone ?? undefined,
            riderLocation: update.riderLocation ?? undefined,
            providerPayload: update.rawPayload ?? undefined,
          }).where(eq(deliveries.id, delivery.id));
          await tx.insert(deliveryStatusHistory).values({
            id: nanoid(18),
            deliveryId: delivery.id,
            status: update.status,
            note: update.note ?? `Provider status: ${update.status}`,
            rawPayload: update.rawPayload ?? undefined,
          });
          const mapped = mapDeliveryStatusToOrderStatus(update.status);
          if (mapped && order && (["DELIVERY_REQUESTED", "RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] as string[]).includes(order.status)) {
            await tx.update(orders).set({ status: mapped as typeof order.status }).where(eq(orders.id, order.id));
            await tx.insert(orderStatusHistory).values({
              id: nanoid(18),
              orderId: order.id,
              status: mapped as typeof order.status,
              note: `Delivery update: ${update.status}${update.riderName ? ` (rider ${update.riderName})` : ""}`,
            });
          }
          await tx.update(webhookEvents).set({ processed: true })
            .where(and(eq(webhookEvents.provider, "shadowfax"), eq(webhookEvents.externalId, eventExternalId)));
        });
        return res.status(200).json({ ok: true, processed: true });
      } catch (err) {
        console.error("[Webhook] Shadowfax processing failed:", err);
        return res.status(200).json({ ok: false, processed: false, error: "Processing failed." });
      }
    }
  );

  app.get("/webhooks/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      razorpay: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      shadowfax: Boolean(process.env.SHADOWFAX_WEBHOOK_SECRET),
    });
  });
}
