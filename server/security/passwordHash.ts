import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Typed scrypt wrapper: util.promisify(scrypt) loses the options overload in
// @types/node, so wrap the callback form directly to pass explicit N/r/p/maxmem.
function scryptAsync(password: string, salt: string, keylen: number, options?: ScryptOptions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const done = (err: Error | null, derivedKey: Buffer) => (err ? reject(err) : resolve(derivedKey));
    if (options) scrypt(password, salt, keylen, options, done);
    else scrypt(password, salt, keylen, done);
  });
}

// Explicit scrypt parameters (N=2^15, r=8, p=1 — modern minimum).
// NOTE: earlier revisions called scrypt() with NO options, which silently used
// Node's defaults (N=16384). The old "v2:" prefix therefore does NOT imply
// these params — v2 hashes are verified with defaults, new hashes use "v3:".
const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
// N=32768 r=8 p=1 needs ~32MiB; Node's default maxmem would reject it.
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const SCRYPT_OPTIONS = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM };

/** Current hash version — explicit N=32768 r=8 p=1 maxmem. */
export const PASSWORD_HASH_VERSION = "v3";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `${PASSWORD_HASH_VERSION}:${salt}:${derived.toString("hex")}`;
}

/** True when a stored hash predates the current params and should be re-hashed on next login. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`${PASSWORD_HASH_VERSION}:`);
}

function timingSafeCompare(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // v3 (current): explicit N=32768 r=8 p=1 maxmem
  if (stored.startsWith(`${PASSWORD_HASH_VERSION}:`)) {
    const [, salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
    return timingSafeCompare(derived, Buffer.from(hash, "hex"));
  }
  // v2: stored with the old code path that passed NO scrypt options, so it
  // used Node defaults (N=16384) despite the "modern cost" comment. Verify
  // with defaults to keep existing logins working; needsRehash() flags these.
  if (stored.startsWith("v2:")) {
    const [, salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
    return timingSafeCompare(derived, Buffer.from(hash, "hex"));
  }
  // Legacy format: salt:hash with default cost factor
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return timingSafeCompare(derived, Buffer.from(hash, "hex"));
}
