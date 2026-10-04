/**
 * Razorpay webhook guards — money-safety decisions that were missing.
 *
 *   1. A multibyte signature made `timingSafeEqual` THROW on the deprecated
 *      tRPC path (it compared UTF-16 code-unit lengths but compared UTF-8
 *      byte buffers), turning a bad signature into an uncaught 500.
 *   2. `currency` was destructured from the live payment and never compared,
 *      so a capture in the wrong currency confirmed an INR order.
 *   3. `handlePaymentFailed` appended a customer-visible order_status_history
 *      row for PENDING_PAYMENT — a state the order never entered — on every
 *      failed attempt, spamming the public tracking timeline.
 *   4. The public tRPC `storefront.razorpayWebhook` procedure could drive order
 *      state changes through a `preVerified` bypass whose "verification" is a
 *      JSON.stringify HMAC that can never match a real provider signature.
 *
 * server/integrations/razorpayWebhook.test.ts pins the dedupe/refund decisions;
 * this file pins the guards above. #1 and #4 run the REAL exported entry point
 * (it refuses before touching the database, so no Postgres is needed); #3 is a
 * structural pin on the private helper, which closes over a live transaction.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import { classifyRazorpayPayment, handleRazorpayWebhook } from "./razorpay";

const RZ_SECRET = "razorpay-guard-test-secret-9f2c";

// getDb() returns a lazy handle when DATABASE_URL is set and opens no socket
// until a query runs; nothing here reaches one.
process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/test";

beforeAll(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = RZ_SECRET;
});

const payload = {
  payment: { entity: { id: "pay_guard", amount: 50_000, currency: "INR", status: "captured", notes: { cloudKitchenOrderId: "ord_guard" } } },
};

describe("signature comparison is byte-safe (deprecated tRPC path)", () => {
  it("does not throw on a signature whose UTF-8 length differs from its code-unit length", async () => {
    // 64 UTF-16 code units, but 96 UTF-8 bytes: the old `expectedSig.length !==
    // signature.length` guard passed and timingSafeEqual threw on the mismatch.
    const multibyte = "a".repeat(32) + "é".repeat(32);
    expect(multibyte.length).toBe(64);
    expect(Buffer.byteLength(multibyte, "utf8")).toBe(96);

    const result = await handleRazorpayWebhook("payment.captured", payload, multibyte);
    expect(result).toEqual({ processed: false, error: "Invalid webhook signature." });
  });

  it("rejects a wrong-length signature without throwing", async () => {
    const result = await handleRazorpayWebhook("payment.captured", payload, "a".repeat(10));
    expect(result.processed).toBe(false);
  });

  it("still refuses when the webhook secret is not configured", async () => {
    const saved = process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    try {
      const result = await handleRazorpayWebhook("payment.captured", payload, "a".repeat(64));
      expect(result.processed).toBe(false);
      expect(result.error).toBe("Webhook secret not configured.");
    } finally {
      process.env.RAZORPAY_WEBHOOK_SECRET = saved;
    }
  });
});

describe("an unverified caller cannot drive order state (public tRPC path)", () => {
  it("refuses a caller that passes only the JSON.stringify HMAC", async () => {
    // This is the strongest thing an unauthenticated caller can produce, and it
    // is exactly what the old `preVerified` bypass accepted. It must NOT reach
    // the idempotent processor: only POST /webhooks/razorpay, which verifies
    // over the exact provider bytes, holds the module-private proof.
    const signature = createHmac("sha256", RZ_SECRET).update(JSON.stringify(payload)).digest("hex");
    const result = await handleRazorpayWebhook("payment.captured", payload, signature);

    expect(result.processed).toBe(false);
    expect(result.error).toContain("Unverified webhook source");
  });

  it("refuses before any state change for every event type", async () => {
    const signature = createHmac("sha256", RZ_SECRET).update(JSON.stringify(payload)).digest("hex");
    for (const event of ["payment.captured", "payment.failed", "refund.created", "refund.processed"]) {
      const result = await handleRazorpayWebhook(event, payload, signature);
      expect(result.processed).toBe(false);
      expect(result.error).toContain("Unverified webhook source");
    }
  });
});

describe("live capture binding requires INR", () => {
  const expected = { amountPaise: 50_000, providerOrderId: "order_guard" };

  it("accepts an exact INR capture on the stored provider order", () => {
    expect(
      classifyRazorpayPayment(
        { id: "pay_x", status: "captured", amount: 50_000, currency: "INR", order_id: "order_guard" },
        expected,
      ),
    ).toBe("match");
  });

  it("rejects a capture settled in another currency with the same amount", () => {
    // The amount alone used to be enough: `currency` was destructured and
    // ignored, so 500.00 USD confirmed a ₹500 order.
    expect(
      classifyRazorpayPayment(
        { status: "captured", amount: 50_000, currency: "USD", order_id: "order_guard" },
        expected,
      ),
    ).toBe("mismatch");
  });

  it("fails closed when the currency is missing", () => {
    expect(classifyRazorpayPayment({ status: "captured", amount: 50_000 }, expected)).toBe("mismatch");
    expect(classifyRazorpayPayment({ status: "captured", amount: 50_000, currency: "" }, expected)).toBe("mismatch");
  });

  it("is case-insensitive on the currency code the provider returns", () => {
    expect(
      classifyRazorpayPayment({ status: "captured", amount: 50_000, currency: "inr" }, expected),
    ).toBe("match");
  });

  it("keeps rejecting uncaptured money, wrong amounts and foreign orders", () => {
    expect(classifyRazorpayPayment({ status: "authorized", amount: 50_000, currency: "INR" }, expected)).toBe("mismatch");
    expect(classifyRazorpayPayment({ status: "captured", amount: 40_000, currency: "INR" }, expected)).toBe("mismatch");
    expect(
      classifyRazorpayPayment({ status: "captured", amount: 50_000, currency: "INR", order_id: "order_other" }, expected),
    ).toBe("mismatch");
  });
});

describe("payment.failed does not write the customer timeline", () => {
  // Structural pin: handlePaymentFailed is private and closes over a live
  // transaction, so the guard is asserted on its source instead.
  const source = readFileSync(new URL("./razorpay.ts", import.meta.url), "utf8");
  // Comments are stripped: the rationale for this fix names the very table the
  // assertion below forbids, and prose must not fail the code check.
  const body = source
    .slice(
      source.indexOf("async function handlePaymentFailed"),
      source.indexOf("async function handleRefundCreated"),
    )
    .split("\n")
    // Leading-whitespace comments only: this file is CRLF, and a bare
    // /\/\/.*/ would also truncate a "https://…" literal.
    .map((line) => line.replace(/^(\s*)\/\/.*/, "$1"))
    .join("\n");

  it("appends no order_status_history row for a state the order never entered", () => {
    // The order stays PENDING_PAYMENT so the customer can retry, so this row
    // recorded no transition — only an unbounded duplicate entry on the public
    // tracking timeline (getOrderForTracking replays every history row).
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain("orderStatusHistory");
  });

  it("still records the failure on the payment row as the audit signal", () => {
    expect(body).toContain('status: "FAILED"');
    expect(body).toContain("failureReason");
  });
});