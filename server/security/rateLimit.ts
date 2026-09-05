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
 * Shared client-IP resolver for rate limiting. X-Forwarded-For is attacker
 * controlled, so it is trusted ONLY behind a configured trusted proxy
 * (TRUSTED_PROXY=1, e.g. nginx/Caddy on the VPS). Otherwise the socket's
 * remote address is authoritative. All OTP/auth endpoints must use this
 * helper — reading XFF unconditionally lets attackers rotate the header to
 * bypass per-IP limits.
 */
export function getRateLimitClientIp(req: Pick<{ headers: Record<string, unknown>; socket: { remoteAddress?: string | null } }, "headers" | "socket">): string {
  if (process.env.TRUSTED_PROXY === "1") {
    const xff = (req.headers as Record<string, unknown>)["x-forwarded-for"];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    const first = typeof raw === "string" ? raw.split(",")[0]?.trim() : undefined;
    if (first) return first;
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
