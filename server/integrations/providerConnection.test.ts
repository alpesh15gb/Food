/**
 * Connection-test helpers for test-key onboarding (Razorpay + Shadowfax).
 * Pure unit tests with stubbed fetch/env — no network, no DB.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  razorpayKeyMode,
  testRazorpayConnection,
} from "./razorpay";
import {
  shadowfaxEnvironment,
  shadowfaxBaseUrl,
  testShadowfaxConnection,
  SHADOWFAX_STAGING_BASE_URL,
  SHADOWFAX_PROD_BASE_URL,
} from "./shadowfax";

const ENV_KEYS = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "SHADOWFAX_ENABLED",
  "SHADOWFAX_TOKEN",
  "SHADOWFAX_API_BASE_URL",
  "SHADOWFAX_API_URL",
  "SHADOWFAX_ENVIRONMENT",
] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

function stubFetchStatus(status: number) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  })));
}

describe("razorpayKeyMode", () => {
  it("detects test / live / unknown prefixes", () => {
    expect(razorpayKeyMode("rzp_test_abc123")).toBe("test");
    expect(razorpayKeyMode("rzp_live_abc123")).toBe("live");
    expect(razorpayKeyMode("something-else")).toBe("unknown");
    expect(razorpayKeyMode(null)).toBe("unknown");
    expect(razorpayKeyMode(undefined)).toBe("unknown");
  });
});

describe("testRazorpayConnection", () => {
  it("reports not-configured without leaking anything", async () => {
    const res = await testRazorpayConnection();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not configured/);
    expect(JSON.stringify(res)).not.toContain("secret");
  });
  it("returns ok + test mode on HTTP 200", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc1234567";
    process.env.RAZORPAY_KEY_SECRET = "shhhh";
    stubFetchStatus(200);
    const res = await testRazorpayConnection();
    expect(res.ok).toBe(true);
    expect(res.mode).toBe("test");
    expect(res.keyPrefix).toBe("rzp_test_abc1");
  });
  it("surfaces auth failure as user-safe error", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc1234567";
    process.env.RAZORPAY_KEY_SECRET = "wrong";
    stubFetchStatus(401);
    const res = await testRazorpayConnection();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Authentication failed/);
  });
});

describe("shadowfax staging resolution", () => {
  it("defaults to production, honors ENVIRONMENT=staging", () => {
    expect(shadowfaxBaseUrl()).toBe(SHADOWFAX_PROD_BASE_URL);
    process.env.SHADOWFAX_ENVIRONMENT = "staging";
    expect(shadowfaxBaseUrl()).toBe(SHADOWFAX_STAGING_BASE_URL);
    expect(shadowfaxEnvironment()).toBe("staging");
  });
  it("explicit base URL wins over the environment flag", () => {
    process.env.SHADOWFAX_ENVIRONMENT = "staging";
    process.env.SHADOWFAX_API_BASE_URL = "https://custom.example/api/";
    expect(shadowfaxBaseUrl()).toBe("https://custom.example/api");
    expect(shadowfaxEnvironment("https://custom.example/api")).toBe("production");
  });
});

describe("testShadowfaxConnection", () => {
  it("refuses when dispatch is disabled", async () => {
    process.env.SHADOWFAX_ENABLED = "false";
    process.env.SHADOWFAX_TOKEN = "tok";
    const res = await testShadowfaxConnection({});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/disabled/);
  });
  it("auth-only probe passes on HTTP 200 and reports environment", async () => {
    process.env.SHADOWFAX_ENABLED = "true";
    process.env.SHADOWFAX_TOKEN = "staging-token";
    process.env.SHADOWFAX_ENVIRONMENT = "staging";
    stubFetchStatus(200);
    const res = await testShadowfaxConnection({});
    expect(res.ok).toBe(true);
    expect(res.environment).toBe("staging");
    expect(JSON.stringify(res)).not.toContain("staging-token");
  });
  it("auth-only probe surfaces 401 as user-safe error", async () => {
    process.env.SHADOWFAX_ENABLED = "true";
    process.env.SHADOWFAX_TOKEN = "bad-token";
    stubFetchStatus(401);
    const res = await testShadowfaxConnection({});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Authentication failed/);
  });
});
