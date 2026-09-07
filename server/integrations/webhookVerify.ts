/**
 * Webhook HMAC verification over RAW request bytes (P0 MP-001).
 *
 * Razorpay / Shadowfax sign the exact bytes they POST. Verifying
 * `HMAC(JSON.stringify(parsedJson))` NEVER matches (key order, spacing).
 * These helpers verify `HMAC(rawBody)` with timing-safe comparison.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyHmacHexSignature(args: {
  rawBody: Buffer;
  signature: string;
  secret: string;
}): boolean {
  const { rawBody, signature, secret } = args;
  try {
    if (!secret || !signature) return false;
    const sig = signature.trim();
    if (sig.length < 32) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (expected.length !== sig.length) return false;
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(sig, "utf8"));
  } catch {
    return false;
  }
}

export function verifyRazorpayRawSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  if (!secret || !signature) return false;
  return verifyHmacHexSignature({ rawBody, signature, secret });
}

export function verifyShadowfaxRawSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.SHADOWFAX_WEBHOOK_SECRET ?? "";
  if (!secret || !signature) return false;
  return verifyHmacHexSignature({ rawBody, signature, secret });
}

export function parseRawJsonBody(raw: Buffer): { ok: true; json: unknown } | { ok: false; error: string } {
  try {
    if (!raw || raw.length === 0) return { ok: false, error: "Empty webhook body." };
    if (raw.length > 1_000_000) return { ok: false, error: "Webhook body too large." };
    const text = raw.toString("utf8");
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, error: "Invalid JSON body." };
  }
}

/** Razorpay sends signature in `x-razorpay-signature` (lowercased by Express). */
export function getRazorpaySignatureFromHeaders(headers: Record<string, unknown>): string | undefined {
  const h = headers as Record<string, string | string[] | undefined>;
  const v = h["x-razorpay-signature"] ?? h["X-Razorpay-Signature"];
  return Array.isArray(v) ? v[0] : v;
}

/** Shadowfax header name varies by account; accept common variants. */
export function getShadowfaxSignatureFromHeaders(headers: Record<string, unknown>): string | undefined {
  const h = headers as Record<string, string | string[] | undefined>;
  const candidates = [
    h["x-shadowfax-signature"],
    h["x-sf-signature"],
    h["x-sf-hmac"],
    h["x-webhook-signature"],
  ];
  for (const c of candidates) {
    const v = Array.isArray(c) ? c[0] : c;
    if (v) return v;
  }
  return undefined;
}
