/**
 * Customer tracking screen — polling bounds and terminal-state rendering.
 *
 * These pins exist because the screen used to create an unbounded client AND
 * server poll loop on a permanently broken link: a stale or mistyped tracking
 * token makes getOrderForTracking return NOT_FOUND, so the query refetched every
 * 20s forever while the UI simultaneously rendered "Couldn't load your order".
 *
 * The status list and the ETA rule are the two pieces of the decision, so they
 * are pinned structurally against the component source (the query/JSX wiring
 * itself needs a React renderer and a live tRPC client, neither of which CI has).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./TrackingScreen.tsx", import.meta.url),
  "utf8",
);

function listBody(name: string): string {
  const start = source.indexOf(`const ${name}`);
  expect(start, `could not find ${name}`).toBeGreaterThan(-1);
  const end = source.indexOf("];", start);
  return source.slice(start, end === -1 ? source.length : end + 2);
}

const terminal = listBody("TERMINAL_STATUSES");

describe("terminal statuses stop the poll loop", () => {
  it("includes the delivered/cancelled/rejected/refunded terminal set", () => {
    for (const status of ["DELIVERED", "CANCELLED", "REJECTED", "REFUNDED"]) {
      expect(terminal).toContain(`"${status}"`);
    }
  });

  it("includes REFUND_PENDING", () => {
    // A normal full refund goes DELIVERED -> REFUND_PENDING, which is a normal
    // money path. Omitting it polled every 20s forever on an order that could
    // never change again (only a later REFUNDED would stop it).
    expect(terminal).toContain('"REFUND_PENDING"');
  });

  it("does not treat an in-flight status as terminal", () => {
    for (const status of ["PLACED", "PREPARING", "DELIVERY_REQUESTED", "RIDER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"]) {
      expect(terminal).not.toContain(`"${status}"`);
    }
  });

  it("stops the interval on a terminal status", () => {
    expect(source).toMatch(
      /if \(status && TERMINAL_STATUSES\.includes\(status\)\) return false;/
    );
  });
});

describe("bounded polling on a broken link", () => {
  it("gives up after a bounded number of consecutive failures", () => {
    expect(source).toMatch(/const MAX_POLL_FAILURES = \d+;/);
    expect(source).toMatch(/consecutiveFailures\.current >= MAX_POLL_FAILURES\) return false;/);
  });

  it("counts distinct failed polls, not refetchInterval invocations", () => {
    // refetchInterval is re-evaluated more than once per fetch, so incrementing
    // blindly would exhaust the budget on a HEALTHY order and silently freeze
    // live tracking. errorUpdatedAt changes exactly once per failed fetch.
    expect(source).toMatch(/const errorAt = query\.state\.errorUpdatedAt \?\? 0;/);
    expect(source).toMatch(/else if \(errorAt !== lastErrorAt\.current\)/);
  });

  it("resets the failure budget after a successful fetch", () => {
    expect(source).toMatch(/if \(errorAt === 0\) \{\s*consecutiveFailures\.current = 0;/);
  });

  it("still exposes a manual retry to the customer", () => {
    expect(source).toMatch(/onClick=\{\(\) => tracking\.refetch\(\)\}/);
  });
});

describe("ETA chip", () => {
  it("is suppressed entirely on terminal orders", () => {
    // estimatedMinutes is written once at order creation and never updated, so
    // showing it after delivery reads as though the food were still coming.
    expect(source).toMatch(/const eta = isTerminal\s*\?\s*null\s*:/);
  });

  it("still shows a duration while the order is in flight", () => {
    expect(source).toContain("~${tracking.data.estimatedMinutes} min");
  });

  it("renders the chip only when an eta exists", () => {
    expect(source).toMatch(/\{eta && \(/);
  });
});