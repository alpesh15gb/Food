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

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour
  for (const store of [phoneSendLimits, phoneVerifyLimits, ipLimits, loginEmailLimits, loginIpLimits, registerIpLimits]) {
    for (const [key, entry] of Array.from(store.entries())) {
      if (now - entry.windowStart > maxAge) store.delete(key);
    }
  }
}, 5 * 60 * 1000);

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
