/**
 * In-memory rate limiter for OTP endpoints.
 *
 * Tracks per-phone and per-IP request counts with sliding windows.
 * Appropriate for single-VPS deployment. Not distributed.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const phoneSendLimits = new Map<string, RateLimitEntry>();
const phoneVerifyLimits = new Map<string, RateLimitEntry>();
const ipLimits = new Map<string, RateLimitEntry>();
const loginEmailLimits = new Map<string, RateLimitEntry>();
const loginIpLimits = new Map<string, RateLimitEntry>();
const registerIpLimits = new Map<string, RateLimitEntry>();
const localAdminLimits = new Map<string, RateLimitEntry>();
const otpPurposeSendLimits = new Map<string, RateLimitEntry>();
const otpPurposeVerifyLimits = new Map<string, RateLimitEntry>();
const whatsappWebhookLimits = new Map<string, RateLimitEntry>();

const ALL_STORES = [
  phoneSendLimits,
  phoneVerifyLimits,
  ipLimits,
  loginEmailLimits,
  loginIpLimits,
  registerIpLimits,
  localAdminLimits,
  otpPurposeSendLimits,
  otpPurposeVerifyLimits,
  whatsappWebhookLimits,
];

/** Hard cap per store: bounds memory even under key-flooding. Oldest entries evicted first. */
const MAX_STORE_ENTRIES = 5000;

function evictIfNeeded(store: Map<string, RateLimitEntry>): void {
  while (store.size > MAX_STORE_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

// Cleanup old entries every 5 minutes
const sweepTimer = setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour
  for (const store of ALL_STORES) {
    for (const [key, entry] of Array.from(store.entries())) {
      if (now - entry.windowStart > maxAge) store.delete(key);
    }
    evictIfNeeded(store);
  }
}, 5 * 60 * 1000);
// Don't keep the VPS process alive just for the sweeper.
(sweepTimer as unknown as { unref?: () => void }).unref?.();

/**
 * Check and record a rate-limited request.
 * Returns { allowed: true } or { allowed: false, retryAfterSeconds }.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  store: Map<string, RateLimitEntry> = ipLimits,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    evictIfNeeded(store);
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

/** Check phone-specific send rate limit: 3 per 10 minutes per phone */
export function checkPhoneSendLimit(phone: string) {
  return checkRateLimit(`send:${phone}`, 3, 10 * 60 * 1000, phoneSendLimits);
}

/** Check phone-specific verify rate limit: 10 per 10 minutes per phone */
export function checkPhoneVerifyLimit(phone: string) {
  return checkRateLimit(`verify:${phone}`, 10, 10 * 60 * 1000, phoneVerifyLimits);
}

/** Check IP rate limit: 20 OTP requests per 10 minutes per IP */
export function checkIpOtpLimit(ip: string) {
  return checkRateLimit(`ip:${ip}`, 20, 10 * 60 * 1000, ipLimits);
}

/** Check per-email login rate limit: 5 attempts per 15 minutes */
export function checkLoginEmailLimit(email: string) {
  return checkRateLimit(`login-email:${email.toLowerCase()}`, 5, 15 * 60 * 1000, loginEmailLimits);
}

/** Check per-IP login rate limit: 20 attempts per 15 minutes */
export function checkLoginIpLimit(ip: string) {
  return checkRateLimit(`login-ip:${ip}`, 20, 15 * 60 * 1000, loginIpLimits);
}

/** Check per-IP registration rate limit: 3 registrations per hour */
export function checkRegisterIpLimit(ip: string) {
  return checkRateLimit(`register-ip:${ip}`, 3, 60 * 60 * 1000, registerIpLimits);
}

/** Check local-admin passphrase attempts: 5 per 15 minutes per IP */
export function checkLocalAdminIpLimit(ip: string) {
  return checkRateLimit(`local-admin:${ip}`, 5, 15 * 60 * 1000, localAdminLimits);
}

/**
 * Evolution WhatsApp webhook throttle: 300 deliveries per minute per IP.
 * Generous on purpose — Evolution retries aggressively and bursts on
 * reconnect; abuse is handled by the unguessable webhook secret, this only
 * bounds log/DB spam from a misconfigured sender.
 */
export function checkWhatsappWebhookLimit(ip: string) {
  return checkRateLimit(`wa-webhook:${ip}`, 300, 60 * 1000, whatsappWebhookLimits);
}

/**
 * Inbound WhatsApp throttle: 20 messages per minute per SENDER.
 *
 * The per-IP limit above cannot do this job. Every inbound message is delivered
 * by the one Evolution instance, so all senders share a single IP key: 300/min is
 * a coarse GLOBAL ceiling, not a per-sender bound. A single number can therefore
 * stream garbage at the full global rate, and the per-OTP-row `attempts` cap in
 * `markWhatsappOtpReceived` only bounds how many times a given code can be
 * GUESSED — not how many requests reach us.
 *
 * Keyed on the sender's digits, and it fails closed on an unusable key: an
 * unparseable sender (group chats, malformed JIDs) is throttled under one shared
 * bucket rather than being waved through unlimited, since there is no per-sender
 * identity to bound it with.
 *
 * 20/min is far above real OTP traffic — a customer replies to a code once, or
 * asks for help a few times — so this never touches a legitimate user.
 */
export function checkWhatsappSenderLimit(senderKey: string) {
  return checkRateLimit(
    `wa-sender:${normaliseSenderKey(senderKey)}`,
    20,
    60 * 1000,
    whatsappWebhookLimits
  );
}

/**
 * Reduce a sender to one stable identity, so reformatting cannot buy extra budget.
 *
 * Stripping non-digits alone is not enough: `00919812345678`, `+919812345678`,
 * `919812345678` and `9812345678` are the same WhatsApp number and would each get
 * their own bucket, so a sender could alternate formats to multiply the limit.
 *
 * Normalised to the last 10 digits (the Indian national significant number),
 * after removing the `00` international prefix. This deliberately matches how
 * `matchInboundOtp` decides whether a message came from the expected sender —
 * if the two disagreed about what counts as the same number, the throttle could
 * be sidestepped by exactly the prefixes the matcher tolerates.
 */
export function normaliseSenderKey(senderKey: string): string {
  let digits = senderKey.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 10 ? digits.slice(-10) : "unknown-sender";
}

/**
 * Shared client-IP resolver for rate limiting.
 *
 * X-Forwarded-For is attacker-controlled, so it is trusted ONLY behind a
 * configured trusted proxy (TRUSTED_PROXY=1, e.g. nginx on the VPS). Otherwise
 * the socket's remote address is authoritative.
 *
 * Order matters, and the previous implementation got it backwards. Every nginx
 * vhost sets `X-Real-IP $remote_addr` (authoritative, overwritten per request)
 * and `X-Forwarded-For $proxy_add_x_forwarded_for` — which APPENDS the peer
 * address to whatever the client sent. Reading `XFF.split(",")[0]` therefore
 * returned the leftmost, attacker-supplied hop, so `X-Forwarded-For: 1.2.3.4`
 * made every per-IP limit a no-op: unlimited OTP sends to attacker-chosen
 * numbers (an SMS/WhatsApp spam relay), unlimited `verifyOtp` brute-force
 * budget, and unlimited webhook flooding.
 *
 * Prefer `X-Real-IP`, which the trusted proxy overwrites. Fall back to the LAST
 * XFF hop (the one our own proxy appended), never the first.
 */
export function getRateLimitClientIp(req: Pick<{ headers: Record<string, unknown>; socket: { remoteAddress?: string | null } }, "headers" | "socket">): string {
  if (process.env.TRUSTED_PROXY === "1") {
    const headers = req.headers as Record<string, unknown>;
    const realIp = headers["x-real-ip"];
    const realRaw = Array.isArray(realIp) ? realIp[0] : realIp;
    if (typeof realRaw === "string" && realRaw.trim()) return realRaw.trim();

    const xff = headers["x-forwarded-for"];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    if (typeof raw === "string") {
      // Rightmost hop = the address our trusted proxy observed.
      const hops = raw.split(",").map((h) => h.trim()).filter(Boolean);
      const last = hops[hops.length - 1];
      if (last) return last;
    }
  }
  return req.socket.remoteAddress ?? "unknown";
}

/** Test-only: clear all in-memory rate-limit state for test isolation. */
export function clearAllRateLimitStores(): void {
  for (const store of ALL_STORES) store.clear();
}

/** Purpose-aware OTP send limit: 3 per 10 minutes per phone+purpose */
export function checkOtpSendLimit(phone: string, purpose = "login") {
  return checkRateLimit(`send:${purpose}:${phone}`, 3, 10 * 60 * 1000, otpPurposeSendLimits);
}

/** Purpose-aware OTP verify limit: 10 per 10 minutes per phone+purpose */
export function checkOtpVerifyLimit(phone: string, purpose = "login") {
  return checkRateLimit(`verify:${purpose}:${phone}`, 10, 10 * 60 * 1000, otpPurposeVerifyLimits);
}
