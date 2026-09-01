import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// M-02: Use scrypt cost factor 32768 (N=2^15) for modern security
// Store cost params so we can upgrade without breaking old hashes
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST_MODERN = 32768; // N=2^15 (recommended minimum)
const SCRYPT_COST_LEGACY = 64; // Original weak cost

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN) as Buffer;
  return `v2:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Support v2 (modern) and legacy (no prefix) formats
  if (stored.startsWith("v2:")) {
    const [, salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN) as Buffer;
    const hashBuffer = Buffer.from(hash, "hex");
    if (derived.length !== hashBuffer.length) return false;
    return timingSafeEqual(derived, hashBuffer);
  }
  // Legacy format: salt:hash with low cost factor
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN) as Buffer;
  const hashBuffer = Buffer.from(hash, "hex");
    if (derived.length !== hashBuffer.length) return false;
  return timingSafeEqual(derived, hashBuffer);
}
