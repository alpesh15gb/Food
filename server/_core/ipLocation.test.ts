import { describe, expect, it } from "vitest";
import { extractClientIp, isPublicIp } from "./ipLocation";

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