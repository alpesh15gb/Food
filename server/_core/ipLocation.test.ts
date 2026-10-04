import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { extractClientIp, isPublicIp, locateByIp, _clearIpLocationCache, _ipLocationCacheSize } from "./ipLocation";

describe("isPublicIp", () => {
  it("accepts routable addresses", () => {
    expect(isPublicIp("203.0.113.24")).toBe(true);
    expect(isPublicIp("2001:db8::1")).toBe(true);
  });

  it("rejects private, loopback, link-local and CGNAT ranges", () => {
    expect(isPublicIp("127.0.0.1")).toBe(false);
    expect(isPublicIp("10.1.2.3")).toBe(false);
    expect(isPublicIp("192.168.1.10")).toBe(false);
    expect(isPublicIp("172.16.5.5")).toBe(false);
    expect(isPublicIp("100.64.0.1")).toBe(false);
    expect(isPublicIp("169.254.169.254")).toBe(false); // cloud metadata
    expect(isPublicIp("::1")).toBe(false);
    expect(isPublicIp("fd00::1")).toBe(false);
    expect(isPublicIp("fe80::1")).toBe(false);
    expect(isPublicIp("")).toBe(false);
  });

  it("rejects malformed octets", () => {
    expect(isPublicIp("999.1.1.1")).toBe(false);
  });

  it("applies the IPv4 rules to IPv4-mapped IPv6", () => {
    // A dual-stack listener hands these out verbatim. The IPv4 checks used to be
    // skipped entirely and the IPv6 fallback (`includes(":")`) called every one
    // of them public — including cloud metadata and loopback, which then got
    // shipped to a third-party geolocation provider.
    expect(isPublicIp("::ffff:169.254.169.254")).toBe(false);
    expect(isPublicIp("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicIp("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicIp("::ffff:192.168.1.10")).toBe(false);
    expect(isPublicIp("::ffff:172.16.5.5")).toBe(false);
    expect(isPublicIp("::ffff:100.64.0.1")).toBe(false);
    expect(isPublicIp("::FFFF:10.1.2.3")).toBe(false); // case-insensitive
    // Deprecated IPv4-compatible form gets the same treatment.
    expect(isPublicIp("::169.254.169.254")).toBe(false);
    expect(isPublicIp("::ffff:203.0.113.24")).toBe(true);
    expect(isPublicIp(" ::ffff:8.8.8.8 ")).toBe(true);
  });

  it("rejects reserved IPv4 ranges that were never covered", () => {
    expect(isPublicIp("192.0.2.1")).toBe(false); // TEST-NET-1
    expect(isPublicIp("198.18.0.1")).toBe(false); // benchmarking 198.18.0.0/15
    expect(isPublicIp("198.19.255.254")).toBe(false);
    expect(isPublicIp("240.0.0.1")).toBe(false); // reserved 240.0.0.0/4
    expect(isPublicIp("255.255.255.255")).toBe(false);
    expect(isPublicIp("224.0.0.1")).toBe(false); // multicast
    expect(isPublicIp("::ffff:198.18.0.1")).toBe(false);
  });
});

describe("locateByIp cache policy", () => {
  beforeEach(() => {
    _clearIpLocationCache();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    _clearIpLocationCache();
  });

  const ipwhoOk = () => ({
    success: true,
    latitude: 12.9352,
    longitude: 77.6245,
    city: "Bengaluru",
    country: "India",
    postal: "560034",
    precision: 20,
  });

  it("does not cache a negative result for the full TTL", async () => {
    // Both providers fail on the first pass (2 HTTP calls), then recover.
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length <= 2) throw new Error("provider down");
      return { ok: true, json: async () => ipwhoOk() };
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await locateByIp("203.0.113.24")).toBeNull();
    // A transient blip must not disable the IP fallback for that IP: a 30s
    // negative TTL is enough to absorb a retry storm, 10 minutes is a customer
    // losing their map seed long after the provider recovered.
    vi.advanceTimersByTime(45 * 1000);
    expect(await locateByIp("203.0.113.24")).not.toBeNull();
  });

  it("still caches a negative result briefly", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("provider down"); });
    vi.stubGlobal("fetch", fetchMock);
    await locateByIp("198.51.100.9");
    await locateByIp("198.51.100.9");
    expect(fetchMock.mock.calls.length).toBe(2); // ipwho + ipapi, once each
    await locateByIp("198.51.100.9");
    expect(fetchMock.mock.calls.length).toBe(2); // served from the negative cache
  });

  it("prunes expired entries instead of growing without bound", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ipwhoOk() })));
    for (let i = 0; i < 12; i++) {
      // Distinct public IPs, as a storefront with rotating visitor IPs sees.
      await locateByIp(`203.0.113.${i + 1}`);
      vi.advanceTimersByTime(11 * 60 * 1000); // past the positive TTL
    }
    expect(_ipLocationCacheSize()).toBeLessThanOrEqual(1);
  });

  it("keeps the cache bounded when every entry is still fresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ipwhoOk() })));
    for (let i = 0; i < 5200; i++) {
      await locateByIp(`203.0.${Math.floor(i / 250)}.${(i % 250) + 1}`);
    }
    expect(_ipLocationCacheSize()).toBeLessThanOrEqual(5000);
  });

  it("never sends a private address to the provider", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ipwhoOk() }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await locateByIp("::ffff:169.254.169.254")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("extractClientIp", () => {
  it("prefers the proxy header a real deployment sets", () => {
    expect(
      extractClientIp({ "cf-connecting-ip": "203.0.113.24", "x-forwarded-for": "198.51.100.9, 10.0.0.1" }),
    ).toBe("203.0.113.24");
  });

  it("takes the first entry of x-forwarded-for", () => {
    expect(extractClientIp({ "x-forwarded-for": "198.51.100.9, 203.0.113.24" })).toBe("198.51.100.9");
  });

  it("handles the array form Express uses for repeated headers", () => {
    expect(extractClientIp({ "x-real-ip": ["203.0.113.24"] })).toBe("203.0.113.24");
  });

  it("skips a private leading hop and keeps looking", () => {
    expect(extractClientIp({ "x-forwarded-for": "10.0.0.5, 203.0.113.24" })).toBe("203.0.113.24");
  });

  it("returns null when only private addresses are present", () => {
    expect(extractClientIp({ "x-forwarded-for": "10.0.0.5, 192.168.0.1" })).toBeNull();
    expect(extractClientIp({})).toBeNull();
  });
});