/**
 * Webhook route hardening — exercised over a REAL Express app on a real socket.
 *
 * The bugs fixed alongside these tests were all about what a ROUTE did with a
 * payload (which status it answered, what it wrote, what it logged), not about
 * pure helpers, so unit-testing extracted copies would have pinned nothing:
 *  - every webhook_events insert error used to be reported as a benign
 *    "duplicate" (200), so a real DB failure silently dropped the OTP;
 *  - a processed:false row left by a crash between insert and match was
 *    laundered as a duplicate too, making the loss PERMANENT;
 *  - shared secrets were accepted from the query string (access logs);
 *  - /webhooks/health reported "evolution healthy" while every inbound callback
 *    was 401ing because WHATSAPP_WEBHOOK_SECRET was unset;
 *  - the event-type filter was fail-open and the replay window was skipped
 *    whenever the payload carried no parseable timestamp.
 *
 * server/db.ts is mocked so the OTP side effect is observable without Postgres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const WA_SECRET = "route-test-whatsapp-secret-9f2c";
const SF_SECRET = "route-test-shadowfax-secret-9f2c";
const RZ_SECRET = "route-test-razorpay-secret-9f2c";

// Set before ./webhookRoutes is imported: server/_core/env snapshots these at
// module-evaluation time.
process.env.WHATSAPP_WEBHOOK_SECRET = WA_SECRET;
process.env.SHADOWFAX_WEBHOOK_SECRET = SF_SECRET;
process.env.RAZORPAY_WEBHOOK_SECRET = RZ_SECRET;

// --- fake db + OTP side effect ------------------------------------------------
type EventRow = { processed: boolean; processingError?: string | null };
type Scenario = {
  /** Row the dedupe SELECT returns (null = the message is new). */
  select: EventRow | null;
  /** Error the dedupe INSERT throws (23505 = concurrent duplicate delivery). */
  insertError: unknown;
  match: { phone: string; purpose: string } | null;
  matchError: Error | null;
  inserts: number;
  matches: Array<{ code: string; senderDigits: string | null; waMessageId: string }>;
  updates: EventRow[];
};

const scenario = vi.hoisted(() => ({
  select: null as { processed: boolean } | null,
  insertError: null as unknown,
  match: null as { phone: string; purpose: string } | null,
  matchError: null as Error | null,
  inserts: 0,
  matches: [] as Array<{ code: string; senderDigits: string | null; waMessageId: string }>,
  updates: [] as Array<{ processed: boolean; processingError?: string | null }>,
}));

vi.mock("../db", () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (scenario.select ? [{ processed: scenario.select.processed }] : []),
        }),
      }),
    }),
    insert: () => ({
      values: async () => {
        scenario.inserts += 1;
        if (scenario.insertError) throw scenario.insertError;
      },
    }),
    update: () => ({
      set: (patch: { processed: boolean; processingError?: string | null }) => ({
        where: async () => {
          scenario.updates.push(patch);
          return [];
        },
      }),
    }),
  }),
  markWhatsappOtpReceived: async (args: { code: string; senderDigits: string | null; waMessageId: string }) => {
    scenario.matches.push(args);
    if (scenario.matchError) throw scenario.matchError;
    return scenario.match;
  },
}));

let server: Server;
let base: string;

beforeAll(async () => {
  const { registerWebhookRoutes } = await import("./webhookRoutes");
  const app = express();
  registerWebhookRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  scenario.select = null;
  scenario.insertError = null;
  scenario.match = null;
  scenario.matchError = null;
  scenario.inserts = 0;
  scenario.matches.length = 0;
  scenario.updates.length = 0;
});

let msgSeq = 0;

/** A valid Evolution MESSAGES_UPSERT body carrying an OTP. */
function upsert(text = "Your OTP is 482193") {
  msgSeq += 1;
  return {
    event: "MESSAGES_UPSERT",
    instance: "whatsapp-main",
    data: {
      key: { remoteJid: "919810273645@s.whatsapp.net", fromMe: false, id: `MSG${msgSeq}` },
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
}

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const wa = (body: unknown, headers?: Record<string, string>) =>
  post("/api/webhooks/whatsapp", body, headers);

describe("inbound OTP dedupe is not a blanket catch (bug: every db error read as duplicate)", () => {
  it("surfaces a non-duplicate insert failure as a retryable 5xx and never matches", async () => {
    scenario.insertError = Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" });
    const res = await wa(upsert(), { authorization: WA_SECRET });

    // Old behaviour: 200 { processed:true, duplicate:true } — the OTP was gone.
    expect(res.status).toBe(500);
    expect(res.body.received).toBe(false);
    expect(res.body.duplicate).toBeUndefined();
    // The side effect must not be attempted on a poisoned store read.
    expect(scenario.matches).toHaveLength(0);
  });

  it("treats a connection reset as a failure, not as a duplicate", async () => {
    scenario.insertError = new Error("Connection terminated unexpectedly");
    const res = await wa(upsert(), { authorization: WA_SECRET });
    expect(res.status).toBe(500);
    expect(res.body.duplicate).toBeUndefined();
  });

  it("still treats a processed row as a plain duplicate without re-matching", async () => {
    scenario.select = { processed: true };
    scenario.match = { phone: "919810273645", purpose: "login" };
    const res = await wa(upsert(), { authorization: WA_SECRET });

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(scenario.matches).toHaveLength(0);
    expect(scenario.inserts).toBe(0);
  });

  it("RESUMES a row left processed:false by a crashed attempt instead of calling it a duplicate", async () => {
    // This was the permanent-loss path: insert-then-crash left processed:false,
    // every retry hit 23505 and was laundered as "duplicate" + 200.
    scenario.select = { processed: false };
    scenario.match = { phone: "919810273645", purpose: "login" };
    const res = await wa(upsert(), { authorization: WA_SECRET });

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(true);
    expect(res.body.duplicate).toBeUndefined();
    // No second insert needed, and the side effect was actually attempted.
    expect(scenario.inserts).toBe(0);
    expect(scenario.matches).toHaveLength(1);
    expect(scenario.updates.at(-1)).toEqual({ processed: true, processingError: null });
  });

  it("lets a concurrent duplicate delivery (23505) race into the same idempotent match", async () => {
    scenario.insertError = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    scenario.match = { phone: "919810273645", purpose: "login" };
    const res = await wa(upsert(), { authorization: WA_SECRET });

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(true);
    expect(scenario.matches).toHaveLength(1);
  });

  it("never marks an OTP event processed when the match threw", async () => {
    scenario.matchError = new Error("could not reach database");
    const res = await wa(upsert(), { authorization: WA_SECRET });

    expect(res.status).toBe(500);
    expect(res.body.processed).toBe(false);
    expect(scenario.updates.at(-1)?.processed).toBe(false);
    expect(scenario.updates.at(-1)?.processingError).toContain("could not reach database");
  });

  it("keeps the event unprocessed when no pending request matched", async () => {
    scenario.match = null;
    const res = await wa(upsert(), { authorization: WA_SECRET });

    // processed:true here recorded the OTP as definitively handled when
    // nothing had actually been captured.
    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(false);
    expect(res.body.processed).toBe(false);
    expect(scenario.updates.at(-1)).toEqual({
      processed: false,
      processingError: "No pending OTP request matched.",
    });
  });

  it("records a real match as processed with no error", async () => {
    scenario.match = { phone: "919810273645", purpose: "login" };
    const res = await wa(upsert(), { authorization: WA_SECRET });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, processed: true, matched: true });
    expect(scenario.matches[0]).toMatchObject({ code: "482193", senderDigits: "919810273645" });
    expect(scenario.updates).toEqual([{ processed: true, processingError: null }]);
  });
});

describe("shared secrets are accepted from headers only", () => {
  it("rejects a WhatsApp secret supplied as ?token=", async () => {
    const res = await wa(upsert(), {});
    expect(res.status).toBe(401);
    expect(res.body.received).toBe(false);
    expect(scenario.matches).toHaveLength(0);

    const viaQuery = await post(`/api/webhooks/whatsapp?token=${encodeURIComponent(WA_SECRET)}`, upsert());
    expect(viaQuery.status).toBe(401);
    expect(scenario.matches).toHaveLength(0);
  });

  it("rejects a Razorpay signature supplied as ?signature=", async () => {
    const forged = "a".repeat(64);
    const res = await post(`/webhooks/razorpay?signature=${forged}`, { event: "payment.captured", payload: {} });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing webhook signature.");
  });

  it("rejects a Shadowfax secret supplied as ?secret=", async () => {
    const res = await post(`/webhooks/shadowfax?secret=${encodeURIComponent(SF_SECRET)}`, { awb_number: "SF1" });
    expect(res.status).toBe(401);
    expect(res.body.received).toBe(false);
  });

  it("still accepts the header forms", async () => {
    scenario.match = { phone: "919810273645", purpose: "login" };
    const ok = await wa(upsert(), { authorization: `Bearer ${WA_SECRET}` });
    expect(ok.status).toBe(200);
    expect(ok.body.matched).toBe(true);
  });
});

describe("event-type filter and replay window fail closed", () => {
  it("ignores a payload with no event type instead of processing it", async () => {
    const bare = upsert();
    delete (bare as Record<string, unknown>).event;
    const res = await wa(bare, { authorization: WA_SECRET });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(false);
    expect(scenario.matches).toHaveLength(0);
    expect(scenario.inserts).toBe(0);
  });

  it("ignores the bare Baileys envelope that carries no event", async () => {
    const bare = upsert();
    const res = await wa(bare.data, { authorization: WA_SECRET });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(false);
    expect(scenario.matches).toHaveLength(0);
  });

  it("ignores a non-MESSAGES_UPSERT event", async () => {
    for (const event of ["CONNECTION_UPDATE", "MESSAGES_DELETE", "", "messages_upsert"]) {
      scenario.matches.length = 0;
      const body = { ...upsert(), event };
      const res = await wa(body, { authorization: WA_SECRET });
      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(false);
      expect(scenario.matches).toHaveLength(0);
    }
  });

  it("ignores an OTP message with no parseable timestamp", async () => {
    const body = upsert();
    delete (body.data as Record<string, unknown>).messageTimestamp;
    const res = await wa(body, { authorization: WA_SECRET });

    // `if (msg.timestampMs && ...)` short-circuited on null, so the replay
    // window was skipped and an arbitrarily old message was accepted.
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(false);
    expect(scenario.matches).toHaveLength(0);
  });

  it("ignores a stale OTP message", async () => {
    const body = upsert();
    (body.data as Record<string, unknown>).messageTimestamp = Math.floor((Date.now() - 60 * 60 * 1000) / 1000);
    const res = await wa(body, { authorization: WA_SECRET });

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(false);
    expect(scenario.matches).toHaveLength(0);
  });

  it("ignores own messages, groups, textless media and non-OTP text", async () => {
    const fromMe = upsert();
    (fromMe.data.key as Record<string, unknown>).fromMe = true;
    const group = upsert();
    (group.data.key as Record<string, unknown>).remoteJid = "120363012345@g.us";
    const media = upsert();
    (media.data as Record<string, unknown>).message = { imageMessage: { caption: "otp 482193" } };
    const chat = upsert("how is my order doing");

    for (const body of [fromMe, group, media, chat]) {
      scenario.matches.length = 0;
      const res = await wa(body, { authorization: WA_SECRET });
      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(false);
      expect(scenario.matches).toHaveLength(0);
    }
  });
});

describe("GET /webhooks/health reflects inbound readiness", () => {
  const health = async () => {
    const res = await fetch(`${base}/webhooks/health`);
    return (await res.json()) as Record<string, boolean>;
  };

  it("reports evolution unhealthy when the inbound webhook secret is unset", async () => {
    const saved = process.env.WHATSAPP_WEBHOOK_SECRET;
    process.env.EVOLUTION_API_URL = "http://127.0.0.1:8080";
    process.env.EVOLUTION_API_KEY = "api-key";
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    try {
      // Outbound config alone claimed healthy while every inbound OTP callback
      // was 401ing — misleading exactly during an OTP-capture incident.
      expect((await health()).evolution).toBe(false);
    } finally {
      process.env.WHATSAPP_WEBHOOK_SECRET = saved;
    }
  });

  it("reports evolution healthy only with url + key + inbound secret", async () => {
    process.env.EVOLUTION_API_URL = "http://127.0.0.1:8080";
    process.env.EVOLUTION_API_KEY = "api-key";
    expect((await health()).evolution).toBe(true);
    delete process.env.EVOLUTION_API_KEY;
    expect((await health()).evolution).toBe(false);
  });
});

describe("only 23505 means duplicate delivery", () => {
  it("accepts the postgres unique_violation code", async () => {
    const { isUniqueViolation } = await import("./webhookRoutes");
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error("dupe"), { code: "23505" }))).toBe(true);
  });

  it("refuses every other database failure mode", async () => {
    const { isUniqueViolation } = await import("./webhookRoutes");
    expect(isUniqueViolation({ code: "55P03" })).toBe(false); // lock timeout
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // foreign key violation
    expect(isUniqueViolation({ code: "22001" })).toBe(false); // value too long for column
    expect(isUniqueViolation(new Error("Connection terminated unexpectedly"))).toBe(false);
    // Text-based matching is deliberately not used: without a 23505 code an
    // error must fail loud so the provider retries.
    expect(isUniqueViolation(new Error("duplicate key value violates unique constraint"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});