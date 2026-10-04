/**
 * Tracking + dispatch regression pins for the order-tracking/dispatch audit.
 *
 * These are structural + policy pins (no Postgres in CI). They cover the
 * decisions that are easy to silently regress, because each one previously left
 * an order permanently stuck or leaked internal data to the public tracking page:
 *
 *   1. getOrderForTracking must suppress INTERNAL notes (operator cancellation /
 *      rejection reasons, and the courier AWB) while still returning the
 *      customer-visible milestone (status + timestamp) for that same row.
 *   2. The delivery lookup for an order must prefer a LIVE shipment over a
 *      CANCELLED/FAILED one, and must never be an unordered limit(1).
 *   3. Dispatch must compensate at the COURIER when the order transition fails
 *      after the AWB is committed, and must not tell the operator "nothing was
 *      dispatched" while a live shipment exists.
 *   4. cancelDelivery must move the ORDER as well as the shipment.
 *   5. reconcileDeliveries must advance the ORDER, not just the deliveries row.
 *   6. markWhatsappOtpReceived must charge an attempt on a miss and must never
 *      scan unrelated customers' pending OTPs.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const dbSource = readFileSync(new URL("../db.ts", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../routers/admin.ts", import.meta.url), "utf8");

/** Body of a tRPC mutation / exported function by name. */
function bodyOf(source: string, header: string, endHeader: string): string {
  const start = source.indexOf(header);
  expect(start, `could not find ${header}`).toBeGreaterThan(-1);
  const end = source.indexOf(endHeader, start + header.length);
  return source.slice(start, end === -1 ? source.length : end);
}

// =============================================================================
// 1. Internal notes are suppressed, milestones are not
// =============================================================================
describe("public tracking timeline (privacy)", () => {
  const tracking = bodyOf(
    dbSource,
    "export async function getOrderForTracking",
    "/**\n * Issue 1: Guest checkout",
  );

  it("selects the note_visibility column so it can decide per row", () => {
    expect(tracking).toMatch(/noteVisibility:\s*orderStatusHistory\.noteVisibility/);
  });

  it("does not filter whole history rows out of the public timeline", () => {
    // Filtering on noteVisibility in the WHERE clause deleted the MILESTONE too:
    // every operator-driven transition writes an internal note, so an
    // operator-typed cancellation erased the CANCELLED entry entirely and the
    // customer saw a status flip with no timeline row and no explanation.
    expect(tracking).not.toMatch(
      /where\(\s*and\([\s\S]{0,200}noteVisibility[^)]*\)\s*\)/
    );
    expect(tracking).toMatch(/historyRows\.map\(/);
  });

  it("publishes the note only when it is explicitly customer-visible", () => {
    // Fail closed: anything other than the exact string "customer" is internal.
    expect(tracking).toMatch(
      /note:\s*row\.noteVisibility\s*===\s*"customer"\s*\?\s*row\.note\s*:\s*null/
    );
  });

  it("keeps status and createdAt on every returned row", () => {
    expect(tracking).toMatch(/status:\s*row\.status/);
    expect(tracking).toMatch(/createdAt:\s*row\.createdAt/);
  });

  it("the courier AWB is never written to a customer-visible history row", () => {
    // The AWB is the key Shadowfax's own tracking API is queried with.
    // updateOrderStatus marks ANY caller-supplied note internal, and dispatch
    // passes the AWB note through that single funnel.
    const updateOrderStatus = bodyOf(
      dbSource,
      "export async function updateOrderStatus(",
      "export async function sendDeliveryMilestoneNotification",
    );
    expect(updateOrderStatus).toMatch(/noteVisibility:\s*note\s*\?\s*"internal"\s*:\s*"customer"/);
    // dispatch really does hand it the AWB...
    expect(adminSource).toContain(
      'updateOrderStatus(order.id, "DELIVERY_REQUESTED", ctx.user.id, `Shadowfax shipment created. AWB: ${created.awbNumber}.`)',
    );
    // ...and no writer marks that row customer-visible.
    expect(dbSource).not.toMatch(/noteVisibility:\s*"customer"[\s\S]{0,200}AWB/);
  });

  it("treats a missing note_visibility value as internal", () => {
    expect(dbSource).toMatch(/row\.noteVisibility\s*===\s*"customer"/);
    // The migration default is the safe direction.
    const migration = readFileSync(
      new URL("../../drizzle/migrations/0012_history_note_visibility.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toMatch(/DEFAULT\s+'internal'/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS/);
  });
});

// =============================================================================
// 2. Live delivery row wins over a dead one
// =============================================================================
describe("delivery lookup ordering", () => {
  const tracking = bodyOf(
    dbSource,
    "export async function getOrderForTracking",
    "/**\n * Issue 1: Guest checkout",
  );
  const withItems = bodyOf(
    dbSource,
    "export async function getOrderWithItems",
    "export async function getOrderForTracking",
  );

  for (const [name, src] of [["getOrderForTracking", tracking], ["getOrderWithItems", withItems]] as const) {
    it(`${name} never uses an unordered limit(1) for deliveries`, () => {
      const queries = src.match(/db\.select\([\s\S]{0,400}?from\(deliveries\)[\s\S]{0,400}?limit\(1\)/g) ?? [];
      expect(queries.length).toBeGreaterThan(0);
      for (const q of queries) {
        expect(q).toMatch(/\.orderBy\(/);
      }
    });

    it(`${name} prefers a live row and falls back to the newest row`, () => {
      expect(src).toMatch(
        /notInArray\(deliveries\.status,\s*\["CANCELLED",\s*"FAILED",\s*"RETURNED",\s*"DELIVERY_EXCEPTION"\]\)/
      );
      expect(src).toMatch(/orderBy\(desc\(deliveries\.createdAt\)\)/);
    });
  }
});

// =============================================================================
// 3. Dispatch compensation
// =============================================================================
describe("dispatch commits the AWB and then compensates", () => {
  const dispatch = bodyOf(
    adminSource,
    "shadowfaxDispatch:",
    "getDeliveryStatus:",
  );

  it("commits the AWB before the order transition", () => {
    const awbCommit = dispatch.indexOf("providerAwb: created.awbNumber");
    const transition = dispatch.indexOf('updateOrderStatus(order.id, "DELIVERY_REQUESTED"');
    expect(awbCommit).toBeGreaterThan(-1);
    expect(transition).toBeGreaterThan(awbCommit);
  });

  it("guards the order transition and compensates on failure", () => {
    expect(dispatch).toMatch(/try\s*\{[\s\S]*updateOrderStatus\(order\.id, "DELIVERY_REQUESTED"[\s\S]*\}\s*catch/);
    expect(dispatch).toMatch(/provider\.cancelDelivery\(\{/);
  });

  it("cancels at the COURIER, not only in our own row", () => {
    // Cancelling only `deliveries` leaves the shipment live at Shadowfax: a rider
    // delivers food for an order stuck at its previous status, forever.
    const catchBody = dispatch.slice(dispatch.indexOf("} catch (transitionErr)"));
    const courierIdx = catchBody.indexOf("provider.cancelDelivery");
    const localIdx = catchBody.indexOf("tx.update(deliveries)");
    expect(courierIdx).toBeGreaterThan(-1);
    expect(localIdx).toBeGreaterThan(-1);
    expect(courierIdx).toBeLessThan(localIdx);
  });

  it("does not claim nothing was dispatched when the courier could not be cancelled", () => {
    const catchBody = dispatch.slice(dispatch.indexOf("} catch (transitionErr)"));
    // The operator-facing message must branch on the real courier outcome rather
    // than always asserting that nothing went out.
    expect(catchBody).toMatch(/throw new Error\(\s*courierCancelled\s*\?/);
    expect(catchBody).toMatch(/: "Shipment was created but the order could not be updated, and the courier could not be cancelled automatically\.[\s\S]*?Support must cancel this shipment manually/);
  });
});

// =============================================================================
// 4. cancelDelivery moves the order too
// =============================================================================
describe("cancelDelivery terminates the order", () => {
  const cancel = bodyOf(adminSource, "cancelDelivery:", "reconcileDeliveries:");

  it("calls the order sync on BOTH the provider and the manual path", () => {
    // Two call sites inside cancelDelivery: the provider path (gated on a
    // confirmed cancel) and the manual/own-rider path (always confirmed).
    const calls = cancel.match(/syncOrderAfterDeliveryCancellation\(order\.id/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("uses the canonical updateOrderStatus so refund bookkeeping runs", () => {
    const helper = bodyOf(
      adminSource,
      "async function syncOrderAfterDeliveryCancellation",
      "export const adminRouter",
    );
    expect(helper).toMatch(/updateOrderStatus\(\s*orderId,\s*"CANCELLED"/);
  });

  it("leaves the order alone while the courier cancellation is unconfirmed", () => {
    // CANCELLATION_PENDING means the courier has not cancelled yet; cancelling the
    // order then would trigger a refund for food that may still be delivered.
    expect(adminSource).toMatch(
      /syncOrderAfterDeliveryCancellation\(order\.id,\s*res\.outcome === "CANCELLED"/
    );
  });
});

// =============================================================================
// 5. Reconciliation repairs the order
// =============================================================================
describe("reconcileDeliveries repairs a lost order transition", () => {
  const reconcile = bodyOf(adminSource, "reconcileDeliveries:", "// Refunds");

  it("advances the order through the canonical helper", () => {
    expect(reconcile).toMatch(/mapDeliveryStatusToOrderStatus/);
    expect(reconcile).toMatch(/updateOrderStatus\(/);
  });

  it("keeps going when one order's transition is rejected", () => {
    // The deliveries row is already corrected; failing the whole batch would
    // block reconciliation for every other order in the run.
    expect(reconcile).toMatch(/catch \(syncErr\)/);
    expect(reconcile).toMatch(/console\.warn\(/);
  });

  it("is idempotent: the order helper no-ops on a repeated target status", () => {
    const updateOrderStatus = bodyOf(
      dbSource,
      "export async function updateOrderStatus(",
      "export async function sendDeliveryMilestoneNotification",
    );
    // Re-running reconcile must not double-count the customer's lifetime stats.
    expect(updateOrderStatus).toMatch(/alreadyInState/);
    expect(updateOrderStatus).toMatch(/if \(status === "DELIVERED" && order\.customerId\)/);
  });
});

// =============================================================================
// 6. Inbound WhatsApp OTP brute force
// =============================================================================
describe("markWhatsappOtpReceived", () => {
  const otp = bodyOf(
    dbSource,
    "export async function markWhatsappOtpReceived",
    "export async function getWhatsappOtpStatus",
  );

  it("charges an attempt when every candidate misses", () => {
    // The `attempts < 5` cap never bound on this path: only verifyOtp
    // incremented, so an attacker could grind unlimited codes against their own
    // pending row through the unauthenticated inbound webhook.
    expect(otp).toMatch(/if \(!match\) \{[\s\S]*attempts: sql`\$\{otpVerifications\.attempts\} \+ 1`/);
  });

  it("never tests unrelated customers' pending OTPs", () => {
    // Correlating by sender is what makes the attempt charge safe: it can only
    // ever lock the sender's own rows.
    expect(otp).toMatch(/right\(\$\{otpVerifications\.phone\}, 10\) = right\(\$\{senderDigits\}, 10\)/);
    expect(otp).toMatch(/if \(senderDigits\.length < 10\) return null;/);
  });

  it("bounds the charged update to the candidate rows it actually tested", () => {
    expect(otp).toMatch(/inArray\(otpVerifications\.id, candidates\.map\(\(c\) => c\.id\)\)/);
    expect(otp).toMatch(/otpVerifications\.attempts\} < 5/);
  });

  it("keeps the single-claim race guard", () => {
    expect(otp).toMatch(/receivedAt\} IS NULL/);
    expect(otp).toMatch(/claimed\.length === 0\) return null/);
  });
});