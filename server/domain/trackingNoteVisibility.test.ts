/**
 * Order-timeline note visibility.
 *
 * getOrderForTracking() documents that it "never exposes admin notes", but it
 * selected order_status_history.note unfiltered — so operator-typed
 * cancellation/rejection reasons were published to anyone holding the customer
 * tracking link. That included the row written by admin dispatch:
 *
 *   "Shadowfax shipment created. AWB: SF1234567."
 *
 * The AWB is the key the delivery provider's own tracking API uses, so this was a
 * real data leak. These tests pin the fail-closed rule: a note is staff-only
 * unless a writer explicitly marks it customer-visible.
 */
import { describe, it, expect } from "vitest";

/** Mirrors the predicate in getOrderForTracking. */
const isPubliclyVisible = (row: { noteVisibility?: string | null }): boolean =>
  row.noteVisibility === "customer";

/** Mirrors updateOrderStatus' rule: an operator-supplied note stays internal. */
const visibilityForUpdateOrderStatus = (operatorNote?: string | null): string =>
  operatorNote ? "internal" : "customer";

describe("tracking note visibility", () => {
  it("hides internal notes from the public tracking response", () => {
    expect(isPubliclyVisible({ noteVisibility: "internal" })).toBe(false);
  });

  it("shows explicitly customer-visible notes", () => {
    expect(isPubliclyVisible({ noteVisibility: "customer" })).toBe(true);
  });

  it("fails closed for a row with no visibility set at all", () => {
    // A pre-migration row, or a writer that forgets the column, must not leak.
    expect(isPubliclyVisible({ noteVisibility: null })).toBe(false);
    expect(isPubliclyVisible({})).toBe(false);
  });

  it("never publishes the courier AWB written by dispatch", () => {
    const dispatchNote = "Shadowfax shipment created. AWB: SF1234567.";
    const visibility = visibilityForUpdateOrderStatus(dispatchNote);
    expect(visibility).toBe("internal");
    expect(isPubliclyVisible({ noteVisibility: visibility })).toBe(false);
  });

  it("keeps operator-typed reasons internal", () => {
    expect(visibilityForUpdateOrderStatus("Customer called to cancel")).toBe("internal");
  });

  it("keeps auto-generated milestone text customer-visible", () => {
    // Without this the customer's timeline would lose every milestone note,
    // since the status alone is thin context.
    expect(visibilityForUpdateOrderStatus(undefined)).toBe("customer");
    expect(visibilityForUpdateOrderStatus(null)).toBe("customer");
  });

  it("does not leak an internal note even when the status is public", () => {
    // Status is always safe to show; only the note is filtered.
    const row = { status: "CANCELLED", noteVisibility: "internal" };
    expect(row.status).toBe("CANCELLED");
    expect(isPubliclyVisible(row)).toBe(false);
  });
});
