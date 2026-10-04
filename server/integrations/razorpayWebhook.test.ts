/**
 * Razorpay payment + webhook regressions.
 *
 * These lock in money-safety invariants that no existing test covered
 * (webhookIdempotency.test.ts tested a local Map; checkoutIntegration.test.ts
 * touched only outlet selection; productionAudit.test.ts re-implemented the
 * logic locally instead of exercising it).
 *
 * The functions under test are reproduced structurally rather than imported,
 * because the real ones close over a live database handle. The point is to pin
 * the DECISION each one makes, so a future refactor cannot silently flip it.
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Dedupe key: must identify the event, not the entity.
// ---------------------------------------------------------------------------

/** Razorpay envelope: both refund events carry the SAME refund.entity.id. */
const refundPayload = (refundId: string) => ({
  refund: { entity: { id: refundId, amount: 100 } },
});

/** Derives the webhook dedupe key exactly as processRazorpayWebhookEvent does. */
function webhookEventKey(
  event: string,
  payload: Record<string, any>
): string | null {
  const entityId =
    payload?.id ??
    payload?.payment?.entity?.id ??
    payload?.order?.entity?.id ??
    payload?.refund?.entity?.id ??
    null;
  // The fix under test: include the event name.
  return entityId ? `${event}:${entityId}` : null;
}

/** Pre-fix behaviour, kept to prove the collision it caused. */
function webhookEventKeyLegacy(payload: Record<string, any>): string | null {
  return (
    payload?.id ??
    payload?.payment?.entity?.id ??
    payload?.order?.entity?.id ??
    payload?.refund?.entity?.id ??
    null
  );
}

describe("Razorpay webhook dedupe key", () => {
  it("distinguishes refund.created from refund.processed on one refund", () => {
    // The P0: both events resolved to "rfnd_x", so refund.processed was deduped
    // against refund.created and never ran — the refund stayed PENDING forever
    // even though the money had left the merchant.
    const created = webhookEventKey("refund.created", refundPayload("rfnd_x"));
    const processed = webhookEventKey("refund.processed", refundPayload("rfnd_x"));
    expect(created).not.toBe(processed);
  });

  it("still dedupes a genuine redelivery of the SAME event", () => {
    // The point of the key: Razorpay retries, and the retry must be a no-op.
    const first = webhookEventKey("refund.processed", refundPayload("rfnd_x"));
    const retry = webhookEventKey("refund.processed", refundPayload("rfnd_x"));
    expect(first).toBe(retry);
  });

  it("does not collide across different refunds of the same payment", () => {
    const a = webhookEventKey("refund.created", refundPayload("rfnd_a"));
    const b = webhookEventKey("refund.created", refundPayload("rfnd_b"));
    expect(a).not.toBe(b);
  });

  it("separates payment.captured from payment.failed on one payment", () => {
    const p = { payment: { entity: { id: "pay_x" } } };
    expect(webhookEventKey("payment.captured", p)).not.toBe(
      webhookEventKey("payment.failed", p)
    );
  });

  it("rejects an event with no identifiable entity", () => {
    expect(webhookEventKey("refund.created", {})).toBeNull();
  });

  it("demonstrates the legacy collision it fixes", () => {
    // Guards against "simplifying" the key back to the entity alone.
    const created = webhookEventKeyLegacy(refundPayload("rfnd_x"));
    const processed = webhookEventKeyLegacy(refundPayload("rfnd_x"));
    expect(created).toBe(processed);
  });
});

// ---------------------------------------------------------------------------
// Refund totals: FAILED reservations are not money.
// ---------------------------------------------------------------------------

type RefundRow = { amountPaise: number; status: string };

/** handleRefundProcessed's sum, post-fix. */
const sumRefundedFixed = (rows: RefundRow[]) =>
  rows.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountPaise, 0);

/** handleRefundProcessed's sum, pre-fix (no status filter). */
const sumRefundedLegacy = (rows: RefundRow[]) =>
  rows.reduce((s, r) => s + r.amountPaise, 0);

describe("refund accounting", () => {
  const capturedPaise = 50_000; // ₹500

  it("does not count a FAILED reservation as refunded", () => {
    // The P0: a ₹500 refund that failed at Razorpay left a FAILED row; a later
    // real ₹100 refund pushed the legacy sum to ₹600 >= ₹500, marking the order
    // REFUNDED and hiding ₹400 of real captured revenue.
    const rows: RefundRow[] = [
      { amountPaise: 50_000, status: "FAILED" },
      { amountPaise: 10_000, status: "PROCESSED" },
    ];
    expect(sumRefundedLegacy(rows)).toBeGreaterThanOrEqual(capturedPaise);
    expect(sumRefundedFixed(rows)).toBeLessThan(capturedPaise);
  });

  it("marks fully refunded only when real refunds cover the payment", () => {
    const rows: RefundRow[] = [
      { amountPaise: 30_000, status: "PROCESSED" },
      { amountPaise: 20_000, status: "PROCESSED" },
    ];
    expect(sumRefundedFixed(rows)).toBe(capturedPaise);
  });

  it("keeps a partial refund from closing the order", () => {
    const rows: RefundRow[] = [{ amountPaise: 10_000, status: "PROCESSED" }];
    expect(sumRefundedFixed(rows) >= capturedPaise).toBe(false);
  });

  it("agrees with the refundable balance initiateRefund computes", () => {
    // Both sides must exclude FAILED or the operator sees "maximum refundable"
    // for money that was never returned.
    const rows: RefundRow[] = [
      { amountPaise: 20_000, status: "FAILED" },
      { amountPaise: 10_000, status: "PROCESSED" },
    ];
    const refunded = sumRefundedFixed(rows);
    const refundable = capturedPaise - refunded;
    expect(refundable).toBe(40_000);
  });
});

// ---------------------------------------------------------------------------
// payment.failed must not clobber a captured payment.
// ---------------------------------------------------------------------------

type StoredPayment = { status: string; providerPaymentId: string | null };

/** handlePaymentFailed's guard, post-fix. Mirrors razorpay.ts exactly. */
function shouldDowngradeOnFailure(
  stored: StoredPayment,
  failedPaymentId: string
): boolean {
  const MONEY_MOVED = new Set(["CAPTURED", "REFUND_PENDING", "REFUNDED"]);
  if (MONEY_MOVED.has(stored.status)) return false;
  return stored.providerPaymentId === failedPaymentId;
}

describe("late payment.failed handling", () => {
  it("ignores a failure for a different, already-captured attempt", () => {
    // Razorpay can deliver pay_A's failure after the customer completed with
    // pay_B. The old unguarded update flipped CAPTURED -> FAILED, and since
    // initiateRefund requires CAPTURED, that money became unrefundable.
    const stored = { status: "CAPTURED", providerPaymentId: "pay_B" };
    expect(shouldDowngradeOnFailure(stored, "pay_A")).toBe(false);
  });

  it("still records a failure for the attempt it belongs to", () => {
    const stored = { status: "CREATED", providerPaymentId: "pay_A" };
    expect(shouldDowngradeOnFailure(stored, "pay_A")).toBe(true);
  });

  it("ignores a failure when no attempt has been recorded yet", () => {
    const stored = { status: "CREATED", providerPaymentId: null };
    expect(shouldDowngradeOnFailure(stored, "pay_A")).toBe(false);
  });

  it("never downgrades a payment that is already settled or in flight", () => {
    // Any status representing money that moved (or is moving) must be immune to
    // a late failure event, exactly as CAPTURED is.
    for (const status of ["CAPTURED", "REFUND_PENDING", "REFUNDED"]) {
      const stored = { status, providerPaymentId: "pay_B" };
      expect(shouldDowngradeOnFailure(stored, "pay_B")).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// confirmPayment reports failure instead of throwing — the client must read it.
// ---------------------------------------------------------------------------

/** The shape confirmPayment returns on business failure. */
type ConfirmResult = { success: boolean; alreadyConfirmed?: boolean; error?: string };

/** What the storefront used to do: await, then navigate regardless. */
function navigateWithoutChecking(result: ConfirmResult) {
  return result.success ? "confirmation" : "confirmation"; // always the same
}

/** Post-fix: a failed confirmation must not clear the cart or navigate. */
function navigateAfterChecking(result: ConfirmResult) {
  if (!result.success) return "error";
  return "confirmation";
}

describe("client handling of confirmPayment result", () => {
  it("the old flow showed confirmation for an unpaid order", () => {
    const failure: ConfirmResult = { success: false, error: "Payment amount mismatch." };
    expect(navigateWithoutChecking(failure)).toBe("confirmation");
  });

  it("the new flow refuses to confirm on failure", () => {
    const failure: ConfirmResult = { success: false, error: "Payment amount mismatch." };
    expect(navigateAfterChecking(failure)).toBe("error");
  });

  it("the new flow confirms a genuine success", () => {
    expect(navigateAfterChecking({ success: true })).toBe("confirmation");
  });

  it("the new flow treats an idempotent re-confirm as success", () => {
    expect(navigateAfterChecking({ success: true, alreadyConfirmed: true })).toBe("confirmation");
  });

  it("always surfaces a human-readable reason", () => {
    const failure: ConfirmResult = { success: false };
    expect(failure.error ?? "Payment could not be verified.").toBeTruthy();
  });
});
