/**
 * Provider serviceability mapping tests (spec section 6).
 *
 * Two failure modes live here, both of which reached the customer as a
 * permanent-sounding "we don't serve this pincode" verdict:
 *  1. A transport failure (timeout / DNS / HTTP 5xx) collapsed into
 *     `serviceable: false` — coverage was never actually established.
 *  2. `{"status":"success","data":[]}` — zero per-pincode rows — read the
 *     envelope as a record and its "success" status as a positive marker, so an
 *     EMPTY payload reported the pincode as serviceable.
 *
 * Pure unit tests: fetch is stubbed per test, no network, no DB.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getDeliveryProvider, isPincodeMarkedServiceable } from "./shadowfax";

const ENV_KEYS = ["SHADOWFAX_ENABLED", "SHADOWFAX_TOKEN", "SHADOWFAX_API_BASE_URL"] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.SHADOWFAX_ENABLED = "true";
  process.env.SHADOWFAX_TOKEN = "test-token-123";
  delete process.env.SHADOWFAX_API_BASE_URL;
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env.SHADOWFAX_TOKEN;
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

function stubFetch(json: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  })));
}

describe("isPincodeMarkedServiceable — empty payloads fail closed", () => {
  it("does not treat an empty success payload as serviceable", () => {
    // Nothing is pushed for `data: []`, the envelope is read as a record with an
    // empty pin, and `status === "success" && !pin` returned true.
    expect(isPincodeMarkedServiceable({ status: "success", data: [] }, "560034")).toBe(false);
    expect(isPincodeMarkedServiceable({ status: "success", results: [] }, "560034")).toBe(false);
    expect(isPincodeMarkedServiceable({ status: "success", pincodes: [] }, "560034")).toBe(false);
    // An envelope with no collection key at all is equally ambiguous.
    expect(isPincodeMarkedServiceable({ status: "success" }, "560034")).toBe(false);
  });

  it("still honours an explicit marker", () => {
    expect(isPincodeMarkedServiceable({ data: [{ pincode: "560034", serviceable: true }] }, "560034")).toBe(true);
    expect(isPincodeMarkedServiceable({ data: [{ pincode: "560034", serviceable: false }] }, "560034")).toBe(false);
    expect(isPincodeMarkedServiceable({ data: [{ pincode: "560034", status: "success" }] }, "560034")).toBe(true);
    // Records for other pincodes never leak a verdict to ours.
    expect(isPincodeMarkedServiceable({ data: [{ pincode: "560001", serviceable: true }] }, "560034")).toBe(false);
  });
});

describe("checkPincodeServiceability — transport failures are not coverage verdicts", () => {
  const pair = { pickupPincode: "560038", deliveryPincode: "560034" };

  it("a timeout rejects with an error rather than `serviceable: false`", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }));
    const provider = getDeliveryProvider();
    await expect(provider.checkPincodeServiceability(pair)).rejects.toThrow(/timed out/i);
  });

  it("HTTP 5xx rejects rather than reporting the pincode unserviceable", async () => {
    stubFetch({ message: "Service Unavailable" }, 503);
    const provider = getDeliveryProvider();
    await expect(provider.checkPincodeServiceability(pair)).rejects.toThrow(/unavailable|503/i);
  });

  it("HTTP 429 rejects as unavailability", async () => {
    stubFetch({ message: "Too Many Requests" }, 429);
    const provider = getDeliveryProvider();
    await expect(provider.checkPincodeServiceability(pair)).rejects.toThrow();
  });

  it("a network failure rejects rather than reporting the pincode unserviceable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const provider = getDeliveryProvider();
    await expect(provider.checkPincodeServiceability(pair)).rejects.toThrow(/could not be reached/i);
  });

  it("auth failures keep their existing behaviour", async () => {
    stubFetch({ message: "Invalid token" }, 401);
    const provider = getDeliveryProvider();
    await expect(provider.checkPincodeServiceability(pair)).rejects.toThrow(/authentication/i);
  });

  it("a genuine provider NO still resolves as unserviceable", async () => {
    stubFetch({ data: [{ pincode: "560038", serviceable: true }, { pincode: "560034", serviceable: false }] });
    const provider = getDeliveryProvider();
    const res = await provider.checkPincodeServiceability(pair);
    expect(res.pickupServiceable).toBe(true);
    expect(res.deliveryServiceable).toBe(false);
    expect(res.serviceable).toBe(false);
  });
});