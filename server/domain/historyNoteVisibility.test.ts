/**
 * Customer-visible order history notes.
 *
 * `order_status_history` is the operator log. It carries the milestones a
 * customer should read AND the things they must never see: the courier AWB, raw
 * provider status text, admin price-override justifications, and anything an
 * operator typed into the console. The public tracking page is reachable by
 * anyone holding an order number + tracking token, so `getOrderForTracking`
 * replays these notes.
 *
 * The mechanism is an explicit `noteVisibility` column that DEFAULTS TO
 * 'internal' (fail-closed). That default is the whole security property: a new
 * internal note cannot leak by forgetting a field. But it cuts both ways — a
 * system note the customer is entitled to (a refund amount, a payment receipt)
 * silently disappears unless its writer opts in. That failure is invisible in
 * tests and in code review, and it hits the customer at the exact moment they
 * are checking: "did my refund go through?".
 *
 * These are structural pins (no Postgres in CI). They assert the policy across
 * every writer in the codebase rather than one function's behaviour.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SERVER_ROOT = join(process.cwd(), "server");

/** Every .ts file under server/, excluding tests. */
function serverSources(dir = SERVER_ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...serverSources(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

type InsertSite = { file: string; line: number; body: string };

/** Find every `insert(orderStatusHistory).values({...})` call site. */
function historyInsertSites(): InsertSite[] {
  const sites: InsertSite[] = [];
  for (const file of serverSources()) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/insert\(\s*orderStatusHistory\s*\)/.test(lines[i])) continue;
      // The values object spans until the closing `.values({...})` — take a
      // generous window so a long note template does not escape the scan.
      const body = lines.slice(i, i + 14).join("\n");
      sites.push({ file, line: i + 1, body });
    }
  }
  return sites;
}

describe("order history note visibility", () => {
  const sites = historyInsertSites();

  it("finds the history insert sites (guards the scan itself)", () => {
    // If this ever reads 0 the assertions below pass vacuously, which is the
    // classic failure mode of source-scanning tests.
    expect(sites.length).toBeGreaterThanOrEqual(8);
  });

  it("requires every history writer to set noteVisibility explicitly", () => {
    // The column defaults to 'internal', so omitting this field silently hides a
    // customer-entitled note. Making it mandatory at every call site converts a
    // silent UX regression into a loud test failure.
    const missing = sites
      .filter((s) => !/noteVisibility\s*:/.test(s.body))
      .map((s) => `${s.file}:${s.line}`);
    expect(missing, `history writers omitting noteVisibility: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("uses only the two known visibility values", () => {
    // A typo like "Customer" would not throw; the read side compares against
    // 'customer' exactly, so the note would just vanish.
    const bad = sites.flatMap((s) => {
      const m = s.body.match(/noteVisibility\s*:\s*["']([^"']+)["']/);
      return m && !["customer", "internal"].includes(m[1])
        ? [`${s.file}:${s.line} -> "${m[1]}"`]
        : [];
    });
    expect(bad, `unknown noteVisibility values: ${bad.join(", ")}`).toEqual([]);
  });

  it("never marks a row carrying provider credentials as customer-visible", () => {
    // The AWB is the key Shadowfax's own tracking API is queried with. Leaking it
    // lets anyone holding an order number + tracking token query the courier
    // directly. No history note that embeds an AWB may be marked customer.
    const offenders = sites
      .filter((s) => /\bawb\b/i.test(s.body) && /noteVisibility\s*:\s*["']customer["']/.test(s.body))
      .map((s) => `${s.file}:${s.line}`);
    expect(offenders, `customer-visible notes containing an AWB: ${offenders.join(", ")}`)
      .toEqual([]);
  });
});

describe("public tracking read side", () => {
  const dbSource = readFileSync(join(SERVER_ROOT, "db.ts"), "utf8");
  const trackingFn = dbSource.slice(
    dbSource.indexOf("export async function getOrderForTracking")
  );

  it("nulls the note rather than dropping the milestone row", () => {
    // Filtering whole rows on note_visibility also deletes the status +
    // timestamp. Every operator-driven transition writes an internal note, so an
    // operator cancellation erased the CANCELLED milestone entirely: the status
    // chip flipped with no timeline row and no explanation.
    //
    // (Per-row visibility behaviour itself is covered by
    // trackingNoteVisibility.test.ts; this pins the SHAPE of the fix.)
    expect(trackingFn).toMatch(
      /noteVisibility\s*===\s*["']customer["']\s*\?\s*\w+\.note\s*:\s*null/
    );
  });

  it("does not filter history rows by visibility in SQL", () => {
    expect(trackingFn).not.toMatch(/eq\(\s*orderStatusHistory\.noteVisibility/);
  });

  it("reads the delivery row with explicit ordering", () => {
    // An unordered limit(1) over a multi-shipment order can return a cancelled
    // shipment, leaving support acting on one that is not running.
    expect(dbSource).toMatch(/orderBy\(desc\(deliveries\.createdAt\)\)/);
  });
});
