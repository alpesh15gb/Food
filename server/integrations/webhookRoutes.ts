/**
 * Webhook routes.
 *
 * Mount BEFORE express.json().
 * - Razorpay NEEDS the raw body (HMAC covers exact provider bytes). The tRPC
 *   route only sees parsed JSON and therefore refuses to drive order state
 *   (see processRazorpayWebhookEvent in ./razorpay).
 * - Shadowfax Unified API has NO signature scheme (per spec): auth is OUR
 *   configured secret in the Authorization header, compared constant-time.
 *
 * Every shared secret below is read from a HEADER ONLY. Query-string
 * credentials (`?secret=`, `?token=`, `?signature=`) were removed: nginx and
 * Express log the full request URL by default, so a secret in the query ends
 * up in access logs, browser history and proxy logs.
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

/**
 * Postgres 23505 (unique_violation) — and nothing else.
 *
 * Webhook dedupe keys are `(provider, external_id)`, so ONLY 23505 means "this
 * event was already delivered". Treating every insert failure as a duplicate
 * laundered real errors (connection reset, 55P03 lock_timeout, 22001 value too
 * long, 23503 FK violation) into a 200 "duplicate" response, so the provider
 * stopped retrying and the side effect was never applied.
 *
 * Matching on the error MESSAGE ("duplicate"/"unique") is deliberately NOT done:
 * an error carrying that text without a 23505 code must fail loud.
 */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
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
      // Header ONLY. `?signature=` was accepted as a fallback, which wrote the
      // signature into nginx/Express access logs; Razorpay always sends
      // x-razorpay-signature.
      const signature = getRazorpaySignatureFromHeaders(req.headers as Record<string, unknown>);
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
      if (!configuredSecret) {
        // Fail closed: an unauthenticated delivery endpoint lets anyone forge
        // DELIVERED/rider events. Set SHADOWFAX_WEBHOOK_SECRET on the server.
        console.error("[Webhook] SHADOWFAX_WEBHOOK_SECRET unset — rejecting Shadowfax callback.");
        return res.status(401).json({ received: false, error: "Webhook authentication not configured." });
      }
      {
        // Header ONLY. `?secret=` was accepted as a fallback, leaking the
        // shared secret into nginx/Express access logs.
        const presented = req.headers.authorization as string | undefined;
        if (!isValidShadowfaxCallbackSecret(presented, configuredSecret)) {
          console.warn("[Webhook][metric=webhook_invalid_auth] shadowfax callback rejected (bad secret).");
          return res.status(401).json({ received: false, error: "Invalid webhook authentication." });
        }
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
  // MESSAGES_UPSERT ONLY (fail closed on a missing/unknown event type).
  // Shared-secret auth via the Authorization header ONLY — a `?token=` fallback
  // wrote the secret into nginx/Express access logs. Per-IP throttle, dedupe on
  // WhatsApp message id, fast 200 once the outcome is known.
  app.post(
    "/api/webhooks/whatsapp",
    express.raw({ type: "*/*", limit: RAW_LIMIT }),
    async (req: Request, res: Response) => {
      const ack = (extra?: Record<string, unknown>) =>
        res.status(200).json({ received: true, ...extra });
      // Set once the payload is deemed processable and we start touching the DB.
      // Any throw AFTER that point is an infrastructure fault, not a poison
      // payload, and must be retried (non-2xx) instead of acknowledged.
      let processable = false;
      try {
        const { getRateLimitClientIp, checkWhatsappWebhookLimit } = await import("../security/rateLimit");
        const ip = getRateLimitClientIp(req as never);
        const limit = checkWhatsappWebhookLimit(ip);
        if (!limit.allowed) return res.status(429).json({ received: false, error: "Rate limited." });

        const { evolutionConfig, isValidWhatsappWebhookAuth, parseEvolutionUpsert,
          extractOtpCandidate, maskOtp, logInboundDebug, INBOUND_STALE_MS } =
          await import("./evolution");
        const cfg = evolutionConfig();
        // Header ONLY. `?token=` was accepted as a fallback, which leaked the
        // shared secret into access logs; the header path is the documented one.
        const presentedAuth = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
        if (!isValidWhatsappWebhookAuth(presentedAuth, cfg.webhookSecret)) {
          console.warn("[Evolution][metric=webhook_invalid_auth] rejected callback (bad/missing secret).");
          return res.status(401).json({ received: false, error: "Invalid webhook authentication." });
        }

        const parsed = parseRawJsonBody(rawOf(req));
        if (!parsed.ok) return ack({ processed: false });
        const body = parsed.json as Record<string, unknown>;
        // Fail closed on the event type. The old guard was `if (event && ...)`,
        // so a payload with NO `event` skipped the check entirely and
        // parseEvolutionUpsert — which also accepts the bare Baileys shape —
        // processed it in full despite "MESSAGES_UPSERT only".
        const event = typeof body.event === "string" ? body.event : "";
        if (event !== "MESSAGES_UPSERT") {
          logInboundDebug({ event: event || "-", senderJid: "-", messageId: "-", hasText: false, otpDetected: false, outcome: "ignored-event" });
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
        // Fail closed on an absent/unparseable timestamp. The old guard
        // (`if (msg.timestampMs && ...)`) short-circuited on null, so a payload
        // with no parseable messageTimestamp bypassed the staleness window and
        // an arbitrarily old message was accepted.
        if (!msg.timestampMs) {
          debug("ignored-no-timestamp");
          return ack({ processed: false });
        }
        if (Date.now() - msg.timestampMs > INBOUND_STALE_MS) {
          debug("ignored-stale");
          return ack({ processed: false });
        }

        const code = extractOtpCandidate(msg.text);
        if (!code) {
          debug("ignored-no-otp");
          return ack({ processed: false });
        }
        processable = true;

        const { getDb } = await import("../db");
        const db = await getDb();
        // DB unavailable is a genuine loss, not a benign "nothing to do":
        // Evolution only retries on a non-2xx, so answer 503.
        if (!db) return res.status(503).json({ received: false, processed: false, error: "Database unavailable." });
        const { webhookEvents } = await import("../../drizzle/schema");
        const { nanoid } = await import("nanoid");
        const { eq: eqW, and: andW } = await import("drizzle-orm");

        // Dedupe on the WhatsApp message id.
        //
        // The row is written BEFORE the side effect, so a crash between the two
        // leaves processed:false. Treating that state as "duplicate" is a
        // permanent loss: every retry hits 23505, gets laundered as a dupe and
        // answers 200. So a processed:false row is RESUMED, not skipped — the
        // side effect is attempted again and is idempotent anyway
        // (markWhatsappOtpReceived claims rows with a receivedAt IS NULL guard).
        const already = (await db.select({ processed: webhookEvents.processed })
          .from(webhookEvents)
          .where(andW(eqW(webhookEvents.provider, "evolution-whatsapp"), eqW(webhookEvents.externalId, msg.messageId)))
          .limit(1))[0];
        if (already?.processed) {
          debug("duplicate", { otpDetected: true, otpMasked: maskOtp(code) });
          return ack({ processed: true, duplicate: true });
        }
        if (!already) {
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
          } catch (err) {
            // Only a unique violation is a duplicate. Anything else (connection
            // reset, 55P03 lock_timeout, 23503, 22001 …) is a real failure: it
            // used to be reported as a benign duplicate, answered 200 and skipped
            // the match, so the OTP was silently dropped.
            if (!isUniqueViolation(err)) {
              console.error("[Evolution][metric=webhook_store_failed] could not record inbound OTP event:",
                err instanceof Error ? err.message : String(err));
              return res.status(500).json({ received: false, processed: false, error: "Could not record webhook event." });
            }
            // Concurrent delivery of the SAME message: fall through and let the
            // match claim the row (it is idempotent).
          }
        }

        const { markWhatsappOtpReceived } = await import("../db");
        let match: { phone: string; purpose: string } | null = null;
        try {
          match = await markWhatsappOtpReceived({
            code,
            senderDigits: msg.senderDigits,
            waMessageId: msg.messageId,
          });
        } catch (err) {
          // Never record processed:true for an unmatched OTP. Leave the event
          // unprocessed with the reason recorded and answer 500 so the provider
          // retries into the resumable branch above.
          const reason = err instanceof Error ? err.message : String(err);
          console.error("[Evolution] OTP match failed:", reason);
          await db.update(webhookEvents)
            .set({ processed: false, processingError: reason.slice(0, 1000) })
            .where(andW(eqW(webhookEvents.provider, "evolution-whatsapp"), eqW(webhookEvents.externalId, msg.messageId)))
            .catch(() => undefined);
          debug("match-failed", { otpDetected: true, otpMasked: maskOtp(code) });
          return res.status(500).json({ received: false, processed: false, error: "OTP match failed." });
        }

        if (match) {
          await db.update(webhookEvents)
            .set({ processed: true, processingError: null })
            .where(andW(eqW(webhookEvents.provider, "evolution-whatsapp"), eqW(webhookEvents.externalId, msg.messageId)));
          // PII + code length: gated behind the debug flag. This ran on EVERY
          // match in production, unlike evolution.ts's debug logs.
          if (cfg.debugLog) {
            console.log(`[Evolution][metric=otp_matched] phone=${match.phone.slice(0, 2)}**** len=${code.length}`);
          }
          debug("matched", { otpDetected: true, otpMasked: maskOtp(code) });
          return ack({ processed: true, matched: true });
        }

        // No pending request matched: the event is handled (we know the outcome)
        // but the OTP was NOT recorded, so processed stays false with the reason
        // kept for operators. Redelivery re-attempts the match harmlessly.
        await db.update(webhookEvents)
          .set({ processed: false, processingError: "No pending OTP request matched." })
          .where(andW(eqW(webhookEvents.provider, "evolution-whatsapp"), eqW(webhookEvents.externalId, msg.messageId)));
        debug("no-pending-request", { otpDetected: true, otpMasked: maskOtp(code) });
        return ack({ processed: false, matched: false });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[Evolution] webhook failed:", reason);
        // Malformed/unsupported provider mail is a poison payload: acknowledge
        // so the provider stops retrying it. Once we are past the guards a throw
        // is an infrastructure fault and answering 200 would drop the OTP for
        // good — Evolution only retries a non-2xx.
        if (processable) {
          return res.status(500).json({ received: false, processed: false, error: "Processing failed." });
        }
        return res.status(200).json({ received: true, processed: false });
      }
    }
  );

  app.get("/webhooks/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      razorpay: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
      shadowfax: Boolean(process.env.SHADOWFAX_WEBHOOK_SECRET),
      // Outbound config AND the INBOUND shared secret. Without
      // WHATSAPP_WEBHOOK_SECRET the inbound route fails closed (every callback
      // 401s), so reporting "healthy" from API URL+KEY alone was actively
      // misleading exactly when OTP capture was dead.
      evolution: Boolean(
        process.env.EVOLUTION_API_URL &&
        process.env.EVOLUTION_API_KEY &&
        process.env.WHATSAPP_WEBHOOK_SECRET
      ),
    });
  });
}
