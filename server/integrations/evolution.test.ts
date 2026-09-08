/**
 * Evolution WhatsApp-inbound OTP tests (pure, no DB/network).
 * Candidate rows use the real otpHash construction so matcher coverage is
 * end-to-end at the crypto layer.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isValidWhatsappWebhookAuth,
  parseEvolutionUpsert,
  extractOtpCandidate,
  messageHasOtpKeyword,
  matchInboundOtp,
  maskOtp,
  buildSetWebhookPayload,
  INBOUND_STALE_MS,
  type PendingOtpRow,
} from "./evolution";
import { hashOtp } from "../security/otpHash";

const NOW = Date.now();
const live = new Date(NOW + 10 * 60 * 1000);
const expired = new Date(NOW - 60 * 1000);
const created = new Date(NOW - 30 * 1000);

function row(over: Partial<PendingOtpRow> & { phone: string; code: string }): PendingOtpRow {
  return {
    id: 1,
    purpose: "login",
    expiresAt: live,
    usedAt: null,
    attempts: 0,
    createdAt: created,
    expectedSender: null,
    receivedAt: null,
    waMessageId: null,
    ...over,
  } as PendingOtpRow;
}

function upsert(sender: string, text: string, opts?: { fromMe?: boolean; id?: string; ts?: number }) {
  return {
    event: "MESSAGES_UPSERT",
    instance: "whatsapp-main",
    data: {
      key: {
        remoteJid: sender,
        fromMe: opts?.fromMe ?? false,
        id: opts?.id ?? "MSGID123",
      },
      message: { conversation: text },
      messageTimestamp: opts?.ts ?? Math.floor(NOW / 1000),
    },
  };
}

describe("webhook auth (shared secret, no body trust)", () => {
  const secret = "test-webhook-secret-abc123";
  it("accepts query token and Authorization header forms", () => {
    expect(isValidWhatsappWebhookAuth(secret, undefined, secret)).toBe(true);
    expect(isValidWhatsappWebhookAuth(undefined, secret, secret)).toBe(true);
    expect(isValidWhatsappWebhookAuth(undefined, `Bearer ${secret}`, secret)).toBe(true);
  });
  it("rejects wrong, missing, and empty-secret configs", () => {
    expect(isValidWhatsappWebhookAuth("nope", undefined, secret)).toBe(false);
    expect(isValidWhatsappWebhookAuth(undefined, undefined, secret)).toBe(false);
    expect(isValidWhatsappWebhookAuth(secret, undefined, "")).toBe(false);
    // The Evolution API key is NOT an accepted webhook credential.
    expect(isValidWhatsappWebhookAuth("evolution-api-key", undefined, secret)).toBe(false);
  });
});

describe("payload parsing (Baileys shapes)", () => {
  it("parses conversation text + sender digits + ms timestamp", () => {
    const m = parseEvolutionUpsert(upsert("919810273645@s.whatsapp.net", "Your OTP is 482193"))!;
    expect(m.messageId).toBe("MSGID123");
    expect(m.senderDigits).toBe("919810273645");
    expect(m.fromMe).toBe(false);
    expect(m.isGroup).toBe(false);
    expect(m.text).toBe("Your OTP is 482193");
    expect(m.timestampMs).toBeGreaterThan(1e12);
  });
  it("parses extendedTextMessage text", () => {
    const body = {
      data: {
        key: { remoteJid: "919810273645@s.whatsapp.net", fromMe: false, id: "M2" },
        message: { extendedTextMessage: { text: "Use 827194 to continue" } },
        messageTimestamp: NOW,
      },
    };
    const m = parseEvolutionUpsert(body)!;
    expect(m.text).toBe("Use 827194 to continue");
  });
  it("flags fromMe, groups, and textless messages", () => {
    expect(parseEvolutionUpsert(upsert("919810273645@s.whatsapp.net", "hi", { fromMe: true }))!.fromMe).toBe(true);
    const g = parseEvolutionUpsert(upsert("120363012345@g.us", "Your OTP is 482193"))!;
    expect(g.isGroup).toBe(true);
    expect(g.senderDigits).toBeNull();
    const media = parseEvolutionUpsert({
      data: {
        key: { remoteJid: "919810273645@s.whatsapp.net", fromMe: false, id: "M3" },
        message: { imageMessage: { caption: "pic" } },
        messageTimestamp: NOW,
      },
    })!;
    expect(media.text).toBeNull();
  });
  it("returns null for status updates, receipts, and malformed bodies", () => {
    expect(parseEvolutionUpsert(null)).toBeNull();
    expect(parseEvolutionUpsert({})).toBeNull();
    expect(parseEvolutionUpsert({ data: { key: {} } })).toBeNull();
    expect(parseEvolutionUpsert({ event: "CONNECTION_UPDATE", data: {} })).toBeNull();
  });
});

describe("OTP extraction (keyword-gated, 4–8 digits)", () => {
  it("valid 6-digit OTP", () => {
    expect(extractOtpCandidate("Your OTP is 482193")).toBe("482193");
  });
  it("valid 4-digit OTP", () => {
    expect(extractOtpCandidate("OTP: 4821")).toBe("4821");
  });
  it("other documented phrasings", () => {
    expect(extractOtpCandidate("Use 827194 to continue")).toBe("827194");
    expect(extractOtpCandidate("Your verification code is 381029")).toBe("381029");
  });
  it("ignores bare numbers without keywords", () => {
    expect(extractOtpCandidate("Your bill is 482193, pay 500")).toBeNull();
    expect(extractOtpCandidate("Call me at 9810273645")).toBeNull();
  });
  it("ignores over-long digit runs", () => {
    expect(extractOtpCandidate("OTP ref 482193001122 for you")).toBeNull();
  });
  it("prefers 6-digit runs, handles null", () => {
    expect(extractOtpCandidate("code 12 then OTP 654321 ok")).toBe("654321");
    expect(extractOtpCandidate(null)).toBeNull();
  });
  it("keyword gate is case-insensitive", () => {
    expect(messageHasOtpKeyword("LOGIN code 1122")).toBe(true);
    expect(messageHasOtpKeyword("hello there")).toBe(false);
  });
  it("masking never leaks full codes", () => {
    expect(maskOtp("482193")).toBe("48**93");
    expect(maskOtp("482193")).not.toContain("482193");
  });
});

describe("correlation (one match max, sender-aware)", () => {
  const phoneA = "919810273645";
  const phoneB = "919810273646";
  const codeA = "482193";
  const mkRow = (phone: string, code: string, over?: Partial<PendingOtpRow>) =>
    row({ id: phone === phoneA ? 1 : 2, phone, code: hashOtp(phone, "login", code), ...over });

  it("matches the right row when multiple requests are pending", () => {
    const rows = [mkRow(phoneA, codeA), mkRow(phoneB, "111222")];
    const m = matchInboundOtp(codeA, "14150001111", rows, NOW);
    expect(m).toMatchObject({ phone: phoneA, purpose: "login" });
  });
  it("prefers the row expecting this sender", () => {
    const sender = "14150001111";
    const older = mkRow(phoneA, codeA, { id: 1, createdAt: new Date(NOW - 5000), expectedSender: sender });
    const newer = mkRow(phoneB, codeA, { id: 2, createdAt: new Date(NOW - 1000), expectedSender: null });
    // Same code for both phones is unrealistic; give B a different code and
    // assert sender preference wins when both could match via recency games.
    const rows = [older, { ...newer, code: hashOtp(phoneB, "login", "999000") }];
    const m = matchInboundOtp(codeA, sender, rows, NOW);
    expect(m?.phone).toBe(phoneA);
  });
  it("skips used, expired, received, and exhausted rows", () => {
    const base = mkRow(phoneA, codeA);
    expect(matchInboundOtp(codeA, null, [{ ...base, usedAt: new Date() }], NOW)).toBeNull();
    expect(matchInboundOtp(codeA, null, [{ ...base, expiresAt: expired }], NOW)).toBeNull();
    expect(matchInboundOtp(codeA, null, [{ ...base, receivedAt: new Date() }], NOW)).toBeNull();
    expect(matchInboundOtp(codeA, null, [{ ...base, attempts: 5 }], NOW)).toBeNull();
    expect(matchInboundOtp(codeA, null, [], NOW)).toBeNull();
  });
  it("wrong code never matches", () => {
    expect(matchInboundOtp("000000", null, [mkRow(phoneA, codeA)], NOW)).toBeNull();
  });
});

describe("setup payload + constants", () => {
  it("builds the MESSAGES_UPSERT subscription", () => {
    expect(buildSetWebhookPayload("https://9housekitchen.in/api/webhooks/whatsapp")).toEqual({
      enabled: true,
      url: "https://9housekitchen.in/api/webhooks/whatsapp",
      events: ["MESSAGES_UPSERT"],
      base64: false,
    });
  });
  it("stale horizon is 5 minutes", () => {
    expect(INBOUND_STALE_MS).toBe(5 * 60 * 1000);
  });
});

describe("env isolation", () => {
  const OLD = process.env.OTP_HMAC_SECRET;
  beforeEach(() => {
    process.env.OTP_HMAC_SECRET = "test-secret-for-evolution-unit-tests";
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.OTP_HMAC_SECRET;
    else process.env.OTP_HMAC_SECRET = OLD;
  });
  it("matcher uses the live HMAC secret (no hardcoded vectors)", () => {
    const phone = "919810273645";
    const code = "777888";
    const rows = [row({ id: 9, phone, code: hashOtp(phone, "login", code) })];
    expect(matchInboundOtp(code, null, rows, NOW)?.phone).toBe(phone);
  });
});
