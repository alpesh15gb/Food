/**
 * OTP code hashing — HMAC-SHA256 keyed construction.
 *
 * Never store plaintext OTPs. Uses HMAC-SHA256(secret, phone:purpose:code)
 * where the secret comes from OTP_HMAC_SECRET env var (NOT stored in DB).
 *
 * The HMAC secret MUST be set outside development. Fail startup if missing
 * in production/staging.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

// Re-exported here so OTP flows can import phone helpers from one module.
export { normalizePhoneStrict } from "./phoneValidation";

/**
 * Returns the HMAC secret from environment.
 * Fail-closed: the dev fallback is allowed ONLY in development/test.
 * Production, staging, or unset NODE_ENV with a missing secret throws, and
 * short secrets (<16 chars) always throw — a weak secret must never sign OTPs.
 */
function getHmacSecret(): string {
  const secret = process.env.OTP_HMAC_SECRET;
  if (!secret) {
    const env = process.env.NODE_ENV;
    if (env === "development" || env === "test") {
      // Development/test fallback — MUST NOT be used in production
      return "dev-otp-hmac-secret-not-for-production";
    }
    throw new Error(
      "OTP_HMAC_SECRET environment variable is required outside development. " +
      "Generate one with: openssl rand -hex 32"
    );
  }
  if (secret.length < 16) {
    throw new Error(
      "OTP_HMAC_SECRET is too short (min 16 chars). Generate one with: openssl rand -hex 32"
    );
  }
  return secret;
}

/**
 * Hash an OTP code using HMAC-SHA256(secret, phone:purpose:code).
 * The phone and purpose are mixed in so the same OTP for different
 * phones/purposes produces different hashes.
 */
export function hashOtp(phone: string, purpose: string, code: string): string {
  const secret = getHmacSecret();
  const data = `${phone}:${purpose}:${code}`;
  return createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Verify a submitted OTP against a stored hash using timing-safe comparison.
 * Uses the same HMAC construction to recompute and compare.
 */
export function verifyOtpHash(
  phone: string,
  purpose: string,
  code: string,
  storedHash: string
): boolean {
  const secret = getHmacSecret();
  const data = `${phone}:${purpose}:${code}`;
  const computed = createHmac("sha256", secret).update(data).digest("hex");

  // Timing-safe comparison — reject mismatched lengths safely
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Check if OTP_HMAC_SECRET is configured (for startup health checks).
 * A present-but-too-short secret counts as NOT configured (fail-closed).
 */
export function isOtpSecretConfigured(): boolean {
  const s = process.env.OTP_HMAC_SECRET;
  return !!s && s.length >= 16;
}
