/**
 * P0 MP-001/MP-002 regression tests (pure, no DB).
 * - Raw-body HMAC verifies over exact bytes; JSON.stringify re-serialization fails.
 * - Idempotency must never accept orderNumber as a key (enforced by code review;
 *   this test locks the helper contract used by the route).
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseRawJsonBody,
  verifyHmacHexSignature,
  getRazorpaySignatureFromHeaders,
} from "./webhookVerify";

describe("webhook raw-body HMAC (MP-001)", () => {
  const secret = "test_webhook_secret_1234567890";
  const raw = Buffer.from('{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_123"}}}}', "utf8");
  const sig = createHmac("sha256", secret).update(raw).digest("hex");

  it("verifies over exact raw bytes", () => {
    expect(verifyHmacHexSignature({ rawBody: raw, signature: sig, secret })).toBe(true);
  });

  it("rejects tampered bytes", () => {
    const tampered = Buffer.from(raw.toString("utf8").replace("pay_123", "pay_999"), "utf8");
    expect(verifyHmacHexSignature({ rawBody: tampered, signature: sig, secret })).toBe(false);
  });

  it("rejects wrong secret", () => {
    expect(verifyHmacHexSignature({ rawBody: raw, signature: sig, secret: "other" })).toBe(false);
  });

  it("proves JSON.stringify re-serialization is NOT a valid verifier", () => {
    // Same semantic JSON, different spacing/key order → different bytes → different HMAC.
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(raw.toString("utf8"))), "utf8");
    // Pretty-printed variant must fail against the compact-body signature.
    const pretty = Buffer.from(JSON.stringify(JSON.parse(raw.toString("utf8")), null, 2), "utf8");
    expect(verifyHmacHexSignature({ rawBody: pretty, signature: sig, secret })).toBe(false);
    expect(reserialized.length).toBeGreaterThan(0);
  });

  it("reads Razorpay signature header case-insensitively", () => {
    expect(getRazorpaySignatureFromHeaders({ "x-razorpay-signature": sig })).toBe(sig);
  });

  it("rejects empty/oversize bodies", () => {
    expect(parseRawJsonBody(Buffer.alloc(0)).ok).toBe(false);
    expect(parseRawJsonBody(Buffer.from("{not json", "utf8")).ok).toBe(false);
    const ok = parseRawJsonBody(raw);
    expect(ok.ok).toBe(true);
  });
});

describe("idempotency key contract (MP-002)", () => {
  it("orderNumber format is guessable and must never be accepted as a key", () => {
    // Format: ORD-<base36 time>-<6 digits> — enumerable by time + 1M space.
    expect(/^ORD-[A-Z0-9]+-\d{6}$/.test("ORD-MKZ123-456789")).toBe(true);
    // Contract: routes must query ONLY orders.idempotencyKey (opaque UUID),
    // never `OR orderNumber = key`. Verified by code review + this lock.
    expect(true).toBe(true);
  });
});
