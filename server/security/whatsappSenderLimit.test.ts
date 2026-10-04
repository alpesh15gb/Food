/**
 * Inbound WhatsApp per-sender throttling.
 *
 * The pre-existing limit is per-IP at 300/min. That cannot bound a single
 * WhatsApp number, because every inbound message is delivered by the ONE
 * Evolution instance: all senders share a single IP key, so 300/min is a coarse
 * global ceiling. One number could stream garbage at that full rate, and the
 * per-OTP-row `attempts` cap only bounds how many times a given code can be
 * GUESSED — never how many requests arrive.
 *
 * The per-sender limiter must also fail CLOSED on an unusable key: a group chat
 * or malformed JID has no per-sender identity to bound it with, so it shares one
 * bucket rather than being waved through unlimited.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { checkWhatsappSenderLimit, checkWhatsappWebhookLimit, clearAllRateLimitStores } from "../security/rateLimit";

const SENDER_A = "919812345678";
const SENDER_B = "919899999999";

describe("per-sender inbound throttle", () => {
  beforeEach(() => clearAllRateLimitStores());

  it("allows a normal OTP reply", () => {
    expect(checkWhatsappSenderLimit(SENDER_A).allowed).toBe(true);
  });

  it("throttles a sender that floods", () => {
    // The attack: many guesses arriving fast. The first 20 pass, the 21st does not.
    let allowed = 0;
    for (let i = 0; i < 50; i++) {
      if (checkWhatsappSenderLimit(SENDER_A).allowed) allowed++;
    }
    expect(allowed).toBe(20);
    expect(checkWhatsappSenderLimit(SENDER_A).allowed).toBe(false);
  });

  it("bounds one sender WITHOUT throttling everyone else", () => {
    // The whole point of a per-sender key: a flood from one number must not
    // consume the budget of every other customer on the platform.
    for (let i = 0; i < 50; i++) checkWhatsappSenderLimit(SENDER_A);
    expect(checkWhatsappSenderLimit(SENDER_A).allowed).toBe(false);
    expect(checkWhatsappSenderLimit(SENDER_B).allowed).toBe(true);
  });

  it("is independent of the global per-IP ceiling", () => {
    // 20 messages from a sender must not eat into the 300/min webhook budget,
    // which exists to absorb Evolution reconnect bursts for everyone at once.
    for (let i = 0; i < 25; i++) checkWhatsappSenderLimit(SENDER_A);
    expect(checkWhatsappSenderLimit(SENDER_A).allowed).toBe(false);
    expect(checkWhatsappWebhookLimit("127.0.0.1").allowed).toBe(true);
  });

  it("shares one bucket for unparseable senders instead of waving them through", () => {
    // Fails closed: no identity means no individual budget, but it must still be
    // BOUNDED. An empty or junk key is not a licence for unlimited traffic.
    for (let i = 0; i < 50; i++) checkWhatsappSenderLimit("");
    expect(checkWhatsappSenderLimit("").allowed).toBe(false);
    expect(checkWhatsappSenderLimit("not-a-number").allowed).toBe(false);
  });

  it("normalises formatting so one number cannot buy extra budget", () => {
    // Otherwise the same sender could bypass the limit by reformatting: JIDs
    // arrive with and without a "+", spaces, or a country-code prefix.
    for (let i = 0; i < 20; i++) {
      expect(checkWhatsappSenderLimit(SENDER_A).allowed).toBe(true);
    }
    for (const variant of [
      `+${SENDER_A}`,
      SENDER_A.replace(/^91/, "0091"),
      `+${SENDER_A.slice(2)}`,
      ` ${SENDER_A} `,
    ]) {
      expect(checkWhatsappSenderLimit(variant).allowed, variant).toBe(false);
    }
  });

  it("reports a retry hint so Evolution backs off rather than spinning", () => {
    for (let i = 0; i < 20; i++) checkWhatsappSenderLimit(SENDER_A);
    const denied = checkWhatsappSenderLimit(SENDER_A);
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });
});
