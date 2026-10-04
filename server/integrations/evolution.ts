/**
 * Evolution API (self-hosted Baileys) — WhatsApp-INBOUND OTP capture.
 *
 * One direction only: Evolution POSTs MESSAGES_UPSERT events for messages
 * arriving at OUR linked WhatsApp account; we extract OTPs and match them
 * against pending otpVerifications rows. This module never sends messages,
 * never intercepts anyone else's OTPs — it only processes mail for the
 * account whose QR this deployment linked.
 *
 * Security posture:
 * - EVOLUTION_API_KEY stays server-side (only used for operator-side setup
 *   calls, never in responses or logs).
 * - Inbound OTPs are NEVER stored: candidates are HMAC-compared against
 *   existing hashes (same construction as otpHash.ts) and discarded.
 * - Frontend/API responses never contain OTP values (only received:true).
 * - Production logs never contain OTP digits (masked in debug mode only).
 */
import { timingSafeEqual } from "node:crypto";
import { ENV } from "../_core/env";
import { verifyOtpHash } from "../security/otpHash";

// =============================================================================
// Configuration
// =============================================================================

export function evolutionConfig() {
  return {
    apiUrl: ENV.evolutionApiUrl,
    apiKey: ENV.evolutionApiKey,
    instance: ENV.evolutionInstance,
    webhookSecret: ENV.whatsappWebhookSecret,
    debugLog: ENV.evolutionDebugLogEnabled && process.env.NODE_ENV !== "production",
  };
}

/** Payload for POST /webhook/set/{instance} (operator runs this via curl). */
export function buildSetWebhookPayload(publicWebhookUrl: string) {
  return {
    enabled: true,
    url: publicWebhookUrl,
    events: ["MESSAGES_UPSERT"],
    base64: false,
  };
}

// =============================================================================
// Webhook authentication
// =============================================================================

/**
 * Evolution v2.3.7 Baileys webhooks carry no documented HMAC signature, so
 * authentication is a shared secret presented in the Authorization header
 * (bare or `Bearer <secret>`). Compared constant-time.
 *
 * HEADER ONLY. A `?token=` query fallback used to be accepted, which put the
 * secret in nginx/Express access logs, proxy logs and browser history.
 * Never rely on body fields to prove origin either.
 */
export function isValidWhatsappWebhookAuth(
  authorizationHeader: string | undefined,
  expectedSecret: string,
): boolean {
  if (!expectedSecret) return false;
  const presented = authorizationHeader?.replace(/^(Bearer|Token)\s+/i, "");
  if (typeof presented !== "string" || presented.length === 0) return false;
  const expected = Buffer.from(expectedSecret, "utf8");
  const provided = Buffer.from(presented, "utf8");
  // Compare byte lengths before timingSafeEqual (it throws on a length mismatch).
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

// =============================================================================
// Payload parsing (Evolution v2 MESSAGES_UPSERT, Baileys)
// =============================================================================

export type InboundWhatsappMessage = {
  messageId: string;
  /** Raw remote JID, e.g. 919876543210@s.whatsapp.net or ...@g.us */
  senderJid: string;
  /** Digits extracted from a user JID; null for groups/status. */
  senderDigits: string | null;
  fromMe: boolean;
  isGroup: boolean;
  /** Provider event timestamp (ms). Null when absent/unparseable. */
  timestampMs: number | null;
  /** Text body when present; null for media/stickers/reactions/etc. */
  text: string | null;
};

function digitsOfJidUser(jid: string): string | null {
  const user = jid.split("@")[0] ?? "";
  const digits = user.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

/**
 * Parse one Evolution MESSAGES_UPSERT body into a normalized message.
 * Returns null when the payload has no usable message envelope (status
 * updates, receipts, malformed bodies) — callers acknowledge and ignore.
 */
export function parseEvolutionUpsert(body: unknown): InboundWhatsappMessage | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  // Evolution v2 wraps Baileys in { event, instance, data: {...} }; accept
  // the bare Baileys shape too so direct replays still parse.
  const data = (root.data && typeof root.data === "object"
    ? root.data
    : root) as Record<string, unknown>;
  const key = (data.key && typeof data.key === "object" ? data.key : {}) as Record<string, unknown>;
  const messageId = typeof key.id === "string" && key.id ? key.id : null;
  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  if (!messageId || !remoteJid) return null;

  const fromMe = key.fromMe === true;
  const isGroup = remoteJid.endsWith("@g.us") || remoteJid.endsWith("@broadcast");
  const msg = data.message && typeof data.message === "object"
    ? (data.message as Record<string, unknown>)
    : null;

  let text: string | null = null;
  if (msg) {
    if (typeof msg.conversation === "string") {
      text = msg.conversation;
    } else {
      const ext = msg.extendedTextMessage && typeof msg.extendedTextMessage === "object"
        ? (msg.extendedTextMessage as Record<string, unknown>)
        : null;
      if (ext && typeof ext.text === "string") text = ext.text;
    }
  }

  let timestampMs: number | null = null;
  const ts = data.messageTimestamp;
  if (typeof ts === "number" && Number.isFinite(ts)) {
    timestampMs = ts < 1e12 ? ts * 1000 : ts; // seconds vs ms
  } else if (typeof ts === "string" && /^\d+$/.test(ts)) {
    const n = Number(ts);
    timestampMs = n < 1e12 ? n * 1000 : n;
  }

  return {
    messageId,
    senderJid: remoteJid,
    senderDigits: isGroup ? null : digitsOfJidUser(remoteJid),
    fromMe,
    isGroup,
    timestampMs,
    text: text && text.length > 0 ? text.slice(0, 2000) : null,
  };
}

// =============================================================================
// OTP extraction (guarded — never a bare number)
// =============================================================================

const OTP_KEYWORDS = [
  "otp",
  "one-time",
  "one time",
  "verification",
  "verify",
  "code",
  "passcode",
  "authentication",
  "login",
  "sign in",
  "signin",
  // OTP verbs: "Use 827194 to continue", "Enter the code below". Kept narrow
  // (no bare "use") — a 4–8 digit run must still be present.
  "continue",
  "enter",
];

/** Stale-message horizon: ignore provider mail older than this. */
export const INBOUND_STALE_MS = 5 * 60 * 1000;

export function messageHasOtpKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return OTP_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Extract an OTP candidate (4–8 digits) from message text.
 * Requires an OTP keyword in the same message — a bare number is NOT an OTP.
 * Prefers 6-digit runs (our generator's length), then the first run.
 * Returns null when nothing qualifies.
 */
export function extractOtpCandidate(text: string | null): string | null {
  if (!text || !messageHasOtpKeyword(text)) return null;
  const runs = text.match(/(?<!\d)\d{4,8}(?!\d)/g);
  if (!runs || runs.length === 0) return null;
  return runs.find((r) => r.length === 6) ?? runs[0];
}

/**
 * Mask digits for logs: "482193" → "48****".
 *
 * Only the first two digits survive. The previous form kept the LAST two as
 * well ("48**93"), which collapsed a 900,000-value 6-digit space to 10,000 —
 * a 90x shrink of the brute-force space for anyone holding a log line, and a
 * direct contradiction of the module header's "production logs never contain
 * OTP digits" claim. Debug-gated logs are still logs.
 */
export function maskOtp(code: string): string {
  if (code.length <= 2) return "*".repeat(code.length);
  return `${code.slice(0, 2)}${"*".repeat(code.length - 2)}`;
}

// =============================================================================
// Correlation (pure — operates on candidate rows, no DB here)
// =============================================================================

export type PendingOtpRow = {
  id: number;
  phone: string;
  purpose: string;
  code: string; // HMAC hash, never plaintext
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number | null;
  createdAt: Date;
  expectedSender: string | null;
  receivedAt: Date | null;
  waMessageId: string | null;
};

export type OtpMatch = { rowId: number; phone: string; purpose: string };

/**
 * Match an inbound OTP against pending verifications.
 *
 * - Skips used/expired/received/attempt-exhausted rows.
 * - A row that DECLARES an expected sender only competes when the inbound
 *   sender matches it. Rows with no expectation (`expected_sender IS NULL`,
 *   which is every row today — no caller populates the column) compete on
 *   recency alone.
 * - Compares via HMAC (timing-safe); the plaintext candidate is discarded.
 *
 * Honesty note: `expected_sender` is NOT populated anywhere in the codebase
 * today (createOtp is called without options), so the "sender-aware" path is
 * currently inert and ordering is effectively newest-live-row-first. The code is
 * written so that populating it STRENGTHENS matching and can never weaken it:
 * a row pinned to a different sender is excluded, never demoted.
 *
 * The candidate pool must come from a query filtered to live rows for the
 * sending phone (see markWhatsappOtpReceived in server/db.ts) — this function
 * only re-validates and orders what it is given, so an over-broad pool both
 * costs HMAC work and widens the blast radius of a guess.
 *
 * Returns the single best match or null. One match max — never fan out.
 */
export function matchInboundOtp(
  code: string,
  senderDigits: string | null,
  candidates: PendingOtpRow[],
  now: number = Date.now(),
): OtpMatch | null {
  const live = candidates.filter(
    (r) => !r.usedAt && !r.receivedAt && r.expiresAt.getTime() > now && (r.attempts ?? 0) < 5,
  );
  if (live.length === 0) return null;

  const normSender = senderDigits ? senderDigits.replace(/\D/g, "") : null;
  // Sender agreement, tolerant of country-code prefixes (compare last 10 digits).
  const senderAgrees = (r: PendingOtpRow): boolean | null => {
    const want = (r.expectedSender ?? "").replace(/\D/g, "");
    if (!want) return null; // unconstrained row
    if (!normSender) return false; // sender unknown → cannot honour the constraint
    const tail = normSender.slice(-10);
    return want.endsWith(tail) || tail.endsWith(want);
  };

  // Strongest signal first: rows that explicitly expect this sender, then rows
  // that express no expectation, then most recent. Rows pinned to a DIFFERENT
  // sender are dropped outright — testing them would let an unrelated sender's
  // message consume someone else's pending OTP.
  const ordered = live
    .filter((r) => senderAgrees(r) !== false)
    .sort((a, b) => {
      const aKeyed = senderAgrees(a) === true ? 0 : 1;
      const bKeyed = senderAgrees(b) === true ? 0 : 1;
      if (aKeyed !== bKeyed) return aKeyed - bKeyed;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  for (const row of ordered) {
    // Canonical HMAC compare (same construction as verifyOtp). Plaintext
    // candidate is discarded after this loop either way.
    try {
      if (verifyOtpHash(row.phone, row.purpose, code, row.code)) {
        return { rowId: row.id, phone: row.phone, purpose: row.purpose };
      }
    } catch (err) {
      // verifyOtpHash only THROWS on a configuration fault (OTP_HMAC_SECRET
      // missing or too short) — never on a candidate mismatch, which returns
      // false. Swallowing it as "no match" made a misconfigured secret look
      // exactly like an idle deployment: zero captures and zero errors. Fail
      // loud instead. One log per call, not per row.
      console.error(
        "[Evolution][metric=otp_match_config_error] inbound OTP matching aborted — OTP HMAC secret unusable:",
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }
  return null;
}

// =============================================================================
// Debug logging (sanitized metadata only)
// =============================================================================

export function logInboundDebug(info: {
  event: string;
  senderJid: string;
  messageId: string;
  hasText: boolean;
  otpDetected: boolean;
  otpMasked?: string;
  outcome: string;
}): void {
  if (!evolutionConfig().debugLog) return;
  // eslint-disable-next-line no-console
  console.log(
    `[Evolution][inbound] event=${info.event} sender=${info.senderJid} msg=${info.messageId} ` +
      `text=${info.hasText ? "yes" : "no"} otp=${info.otpDetected ? (info.otpMasked ?? "yes") : "no"} outcome=${info.outcome}`,
  );
}
