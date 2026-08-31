/**
 * OTP code hashing — never store plaintext OTPs.
 * Uses SHA-256 with a per-environment salt.
 */
import { createHash } from "node:crypto";

function otpSalt(): string {
  return process.env.OTP_HASH_SALT ?? "cloud-kitchen-otp-salt-change-in-production";
}

/** Hash a 6-digit OTP code for storage. */
export function hashOtp(code: string): string {
  return createHash("sha256")
    .update(`${otpSalt()}:${code}`)
    .digest("hex");
}

/** Verify a submitted OTP against a stored hash. */
export function verifyOtpHash(code: string, storedHash: string): boolean {
  const computed = hashOtp(code);
  if (computed.length !== storedHash.length) return false;
  // Timing-safe comparison
  const a = Buffer.from(computed);
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}
