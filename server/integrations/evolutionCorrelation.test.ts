/**
 * Inbound-OTP correlation + configuration-failure guards.
 *
 * Two failure modes are pinned here:
 *  - `expected_sender` is never populated today, so the "sender-aware" ordering
 *    in matchInboundOtp was dead code described as the strongest signal. The
 *    matcher must be HONEST about that and must never weaken: a row pinned to a
 *    different sender is excluded, not merely deprioritised, so an unrelated
 *    sender's message cannot consume someone else's pending OTP.
 *  - verifyOtpHash THROWS (never returns false) when OTP_HMAC_SECRET is missing
 *    or too short. Swallowing that as "no match" made a misconfigured secret
 *    look exactly like an idle deployment: zero captures, zero errors.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { matchInboundOtp, type PendingOtpRow } from "./evolution";
import { hashOtp } from "../security/otpHash";

const OLD_SECRET = process.env.OTP_HMAC_SECRET;
const OLD_ENV = process.env.NODE_ENV;

beforeAll(() => {
  process.env.OTP_HMAC_SECRET = "test-secret-for-correlation-guards";
});

afterAll(() => {
  if (OLD_SECRET === undefined) delete process.env.OTP_HMAC_SECRET;
  else process.env.OTP_HMAC_SECRET = OLD_SECRET;
  if (OLD_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = OLD_ENV;
});

const NOW = Date.now();
const live = new Date(NOW + 5 * 60 * 1000);
const CODE = "482193";
const SENDER = "919876543210";

function row(over: Partial<PendingOtpRow> & { id: number; phone: string; code: string }): PendingOtpRow {
  return {
    purpose: "login",
    expiresAt: live,
    usedAt: null,
    attempts: 0,
    createdAt: new Date(NOW - 1000),
    expectedSender: null,
    receivedAt: null,
    waMessageId: null,
    ...over,
  } as PendingOtpRow;
}

const hashed = (phone: string, code: string) => hashOtp(phone, "login", code);

describe("expected_sender never weakens matching", () => {
  it("excludes a row pinned to a DIFFERENT sender even when the code matches", () => {
    // The old code deprioritised keyed rows instead of excluding them, so the
    // pinned row stayed in the pool and any sender's message was tested against
    // unrelated customers' pending OTPs.
    const rows = [row({ id: 1, phone: "919810273645", code: hashed("919810273645", CODE), expectedSender: "14150001111" })];
    expect(matchInboundOtp(CODE, SENDER, rows, NOW)).toBeNull();
  });

  it("matches the unconstrained row and ignores the pinned-to-other row", () => {
    const rows = [
      // Newer, and the code actually matches: still must not win.
      row({ id: 1, phone: "919810273645", code: hashed("919810273645", CODE), expectedSender: "14150001111", createdAt: new Date(NOW) }),
      row({ id: 2, phone: SENDER, code: hashed(SENDER, CODE), expectedSender: null, createdAt: new Date(NOW - 60_000) }),
    ];
    expect(matchInboundOtp(CODE, SENDER, rows, NOW)?.rowId).toBe(2);
  });

  it("cannot honour a pinned row when the sender is unknown", () => {
    const rows = [row({ id: 1, phone: "919810273645", code: hashed("919810273645", CODE), expectedSender: SENDER })];
    expect(matchInboundOtp(CODE, null, rows, NOW)).toBeNull();
  });

  it("still prefers a row that expects THIS sender", () => {
    const rows = [
      row({ id: 1, phone: SENDER, code: hashed(SENDER, "111222"), expectedSender: SENDER }),
      row({ id: 2, phone: "919810273645", code: hashed("919810273645", CODE), expectedSender: null }),
    ];
    expect(matchInboundOtp(CODE, SENDER, rows, NOW)?.phone).toBe("919810273645");
  });

  it("tolerates country-code prefixes on either side of the sender comparison", () => {
    const rows = [row({ id: 1, phone: SENDER, code: hashed(SENDER, CODE), expectedSender: "9876543210" })];
    expect(matchInboundOtp(CODE, SENDER, rows, NOW)?.rowId).toBe(1);
  });

  it("is a no-op for the real data shape (every row has expected_sender NULL)", () => {
    const rows = [
      row({ id: 1, phone: "919810273645", code: hashed("919810273645", "999000"), createdAt: new Date(NOW) }),
      row({ id: 2, phone: SENDER, code: hashed(SENDER, CODE), createdAt: new Date(NOW - 1000) }),
    ];
    expect(matchInboundOtp(CODE, SENDER, rows, NOW)?.rowId).toBe(2);
  });
});

describe("a misconfigured HMAC secret is loud, not silent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces the configuration error instead of reporting a plain no-match", () => {
    // hashOtp must run while the secret is still valid.
    const phone = "919810273645";
    const rows = [row({ id: 1, phone, code: hashed(phone, CODE) })];
    expect(matchInboundOtp(CODE, null, rows, NOW)?.rowId).toBe(1);

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.NODE_ENV = "production";
    delete process.env.OTP_HMAC_SECRET;
    try {
      expect(matchInboundOtp(CODE, null, rows, NOW)).toBeNull();
      // A silent "no match" is indistinguishable from an idle deployment; the
      // operator must be told the secret is the problem.
      expect(spy).toHaveBeenCalledTimes(1);
      const logged = String(spy.mock.calls[0]?.[0] ?? "");
      expect(logged).toContain("otp_match_config_error");
      expect(String(spy.mock.calls[0]?.[1] ?? "")).toContain("OTP_HMAC_SECRET");
    } finally {
      process.env.OTP_HMAC_SECRET = "test-secret-for-correlation-guards";
      process.env.NODE_ENV = OLD_ENV;
      spy.mockRestore();
    }
  });

  it("reports a short secret the same way", () => {
    const phone = "919810273645";
    const rows = [row({ id: 1, phone, code: hashed(phone, CODE) })];
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.NODE_ENV = "production";
    process.env.OTP_HMAC_SECRET = "too-short";
    try {
      expect(matchInboundOtp(CODE, null, rows, NOW)).toBeNull();
      expect(String(spy.mock.calls[0]?.[1] ?? "")).toContain("too short");
    } finally {
      process.env.OTP_HMAC_SECRET = "test-secret-for-correlation-guards";
      process.env.NODE_ENV = OLD_ENV;
      spy.mockRestore();
    }
  });

  it("logs once per call, not once per candidate row", () => {
    // Hash first: hashOtp needs a valid secret too.
    const rows = [1, 2, 3, 4].map((id) =>
      row({ id, phone: `91981027364${id}`, code: hashed(`91981027364${id}`, "111222") }),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.NODE_ENV = "production";
    delete process.env.OTP_HMAC_SECRET;
    try {
      expect(matchInboundOtp(CODE, null, rows, NOW)).toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      process.env.OTP_HMAC_SECRET = "test-secret-for-correlation-guards";
      process.env.NODE_ENV = OLD_ENV;
      spy.mockRestore();
    }
  });
});