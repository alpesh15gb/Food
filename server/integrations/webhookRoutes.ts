/**
 * Webhook routes.
 *
 * Mount BEFORE express.json().
 * - Razorpay NEEDS the raw body (HMAC covers exact provider bytes). tRPC
 *   routes only see parsed JSON and can never verify; they remain for
 *   backwards-compat test buttons.
 * - Shadowfax Unified API has NO signature scheme (per spec): auth is OUR
 *   configured secret in the Authorization header, compared constant-time.
 *   If unset, webhooks are accepted with a loud warning (dev posture only —
 *   production must set SHADOWFAX_WEBHOOK_SECRET).
 *
 *   POST /webhooks/razorpay   — header x-razorpay-signature
 *   POST /webhooks/shadowfax  — header Authorization: <SHADOWFAX_WEBHOOK_SECRET>
 *   GET  /webhooks/health     — liveness for provider dashboards (no secrets)
 */
import type { Express, Request, Response } from "express";
import express from "express";
import {
  getRazorpaySignatureFromHeaders,
  parseRawJsonBody,
  verifyRazorpayRawSignature,
  isValidShadowfaxCallbackSecret,
} from "./webhookVerify";
import { handleRazorpayWebhookRaw } from "./razorpay";

const RAW_LIMIT = "1mb";

function jsonError(res: Response, status: number, error: string) {
  return res.status(status).json({ ok: false, processed: false, error });
}

/** Raw body buffer from express.raw() routes (empty buffer when absent). */
function rawOf(req: Request): Buffer {
  return Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
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

  // --- Shadowfax Unified API (spec sections 16-19) ---------------------------
  // Auth: OUR secret in Authorization header (constant-time compare).
  // Lookup: awb_number first, client_order_id fallback. Dedupe:
  // provider + awb + event + timestamp. Always HTTP 200 after validation.
  app.post(
    "/webhooks/shadowfax",
    express.raw({ type: "*/*", limit: RAW_LIMIT }),
    async (req: Request, res: Response) => {
      const received = (extra?: Record<string, unknown>) =>
        res.status(200).json({ received: true, ...extra });
      const raw = req.body as Buffer;
      if (!Buffer.isBuffer(raw)) return jsonError(res, 400, "Raw body required.");

      const configuredSecret = process.env.SHADOWFAX_WEBHOOK_SECRET ?? "";
      if (configuredSecret) {
        const presented = (req.headers.authorization as string | undefined)
          ?? (req.query.secret as string | undefined);
        if (!isValidShadowfaxCallbackSecret(presented, configuredSecret)) {
          console.warn("[Webhook][metric=webhook_invalid_auth] shadowfax callback rejected (bad secret).");
          return res.status(401).json({ received: false, error: "Invalid webhook authentication." });
        }
      } else {
        console.warn("[Webhook] SHADOWFAX_WEBHOOK_SECRET unset — Shadowfax webhook authentication DISABLED. Set it in production.");
      }

      const parsed = parseRawJsonBody(raw);
      if (!parsed.ok) return jsonError(res, 400, parsed.error);
      console.log("[Webhook][metric=webhook_received] provider=shadowfax");

      const { normalizeShadowfaxWebhook } = await import("./shadowfax");
      const { persistShadowfaxWebhookEvent } = await import("./shadowfaxWebhook");
      const update = normalizeShadowfaxWebhook(parsed.json);
      if (!update) {
        console.warn("[Webhook] Shadowfax callback without awb_number — acknowledged.");
        return received({ processed: false });
      }
      try {
        const result = await persistShadowfaxWebhookEvent(update, parsed.json as Record<string, unknown>);
        return received(result);
      } catch (err) {
        console.error("[Webhook] Shadowfax processing failed:", err);
        return received({ processed: false, error: "Processing failed." });
      }
    }
  );

  // --- Evolution WhatsApp inbound (OTP capture) ------------------------------
  // Canonical URL: POST /api/webhooks/whatsapp (nginx preserves /api/).
  // MESSAGES_UPSERT only. Shared-secret auth (?token= or Authorization),
  // per-IP throttle, dedupe on WhatsApp message id, fast 200 always.
  app.post(
    "/api/webhooks/whatsapp",
    express.raw({ type: "*/*", limit: RAW_LIMIT }),
    async (req: Request, res: Response) => {
      const ack = (extra?: Record<string, unknown>) =>
        res.status(200).json({ received: true, ...extra });
      try {
        const { getRateLimitClientIp, checkWhatsappWebhookLimit } = await import("../security/rateLimit");
        const ip = getRateLimitClientIp(req as never);
        const limit = checkWhatsappWebhookLimit(ip);
        if (!limit.allowed) return res.status(429).json({ received: false, error: "Rate limited." });

        const { evolutionConfig, isValidWhatsappWebhookAuth, parseEvolutionUpsert,
          extractOtpCandidate, maskOtp, logInboundDebug, INBOUND_STALE_MS } =
          await import("./evolution");
        const cfg = evolutionConfig();
        const presentedToken = typeof req.query.token === "string" ? req.query.token : undefined;
        const presentedAuth = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
        if (!isValidWhatsappWebhookAuth(presentedToken, presentedAuth, cfg.webhookSecret)) {
          console.warn("[Evolution][metric=webhook_invalid_auth] rejected callback (bad/missing secret).");
          return res.status(401).json({ received: false, error: "Invalid webhook authentication." });
        }

        const parsed = parseRawJsonBody(rawOf(req));
        if (!parsed.ok) return ack({ processed: false });
        const body = parsed.json as Record<string, unknown>;
        const event = typeof body.event === "string" ? body.event : "";
        if (event && event !== "MESSAGES_UPSERT") {
          logInboundDebug({ event, senderJid: "-", messageId: "-", hasText: false, otpDetected: false, outcome: "ignored-event" });
          return ack({ processed: false });
        }

        const msg = parseEvolutionUpsert(body);
        const debug = (outcome: string, extra?: { otpDetected?: boolean; otpMasked?: string }) =>
          logInboundDebug({
            event: "MESSAGES_UPSERT",
            senderJid: msg?.senderJid ?? "-",
            messageId: msg?.messageId ?? "-",
            hasText: Boolean(msg?.text),
            otpDetected: extra?.otpDetected ?? false,
            otpMasked: extra?.otpMasked,
            outcome,
          });
        if (!msg) {
          debug("ignored-no-envelope");
          return ack({ processed: false });
        }
        // Guard rails: own messages, groups/status, missing text, stale mail.
        if (msg.fromMe) { debug("ignored-from-me"); return ack({ processed: false }); }
        if (msg.isGroup || !msg.senderDigits) { debug("ignored-group"); return ack({ processed: false }); }
        if (!msg.text) { debug("ignored-no-text"); return ack({ processed: false }); }
        if (msg.timestampMs && Date.now() - msg.timestampMs > INBOUND_STALE_MS) {
          debug("ignored-stale");
          return ack({ processed: false });
        }

        const code = extractOtpCandidate(msg.text);
        if (!code) {
          debug("ignored-no-otp");
          return ack({ processed: false });
        }

        const { getDb } = await import("../db");
        const db = await getDb();
        if (!db) return ack({ processed: false, error: "Database unavailable." });
        const { webhookEvents } = await import("../../drizzle/schema");
        const { nanoid } = await import("nanoid");
        try {
          await db.insert(webhookEvents).values({
            id: nanoid(18),
            provider: "evolution-whatsapp",
            eventType: "whatsapp.message.otp",
            externalId: msg.messageId,
            payload: {
              senderJid: msg.senderJid,
              timestampMs: msg.timestampMs,
              otpDetected: true,
              otpLength: code.length,
            },
            processed: false,
          });
        } catch {
          debug("duplicate", { otpDetected: true, otpMasked: maskOtp(code) });
          return ack({ processed: true, duplicate: true });
        }

        const { markWhatsappOtpReceived } = await import("../db");
        const match = await markWhatsappOtpReceived({
          code,
          senderDigits: msg.senderDigits,
          waMessageId: msg.messageId,
        }).catch((err) => {
          console.error("[Evolution] OTP match failed:", err instanceof Error ? err.message : String(err));
          return null;
        });

        const { eq: eqW, and: andW } = await import("drizzle-orm");
        await db.update(webhookEvents)
          .set({ processed: true, processingError: match ? null : "No pending OTP request matched." })
          .where(andW(eqW(webhookEvents.provider, "evolution-whatsapp"), eqW(webhookEvents.externalId, msg.messageId)));

        if (match) {
          console.log(`[Evolution][metric=otp_matched] phone=${match.phone.slice(0, 2)}**** len=${code.length}`);
          debug("matched", { otpDetected: true, otpMasked: maskOtp(code) });
          return ack({ processed: true, matched: true });
        }
        debug("no-pending-request", { otpDetected: true, otpMasked: maskOtp(code) });
        return ack({ processed: true, matched: false });
      } catch (err) {
        // Never crash on malformed provider mail; acknowledge to stop retries
        // for poison payloads while logging server-side.
        console.error("[Evolution] webhook failed:", err instanceof Error ? err.message : String(err));
        return res.status(200).json({ received: true, processed: false });
      }
    }
  );

  app.get("/webhooks/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      razorpay: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      shadowfax: Boolean(process.env.SHADOWFAX_WEBHOOK_SECRET),
      evolution: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY),
    });
  });
}
