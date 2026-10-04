/**
 * IP-to-location fallback.
 *
 * Zomato and Swiggy never leave a customer without a starting point: when the GPS
 * fix is denied, unavailable or absurdly coarse, they drop back to an IP-derived
 * location, show it on the map, and ask the customer to correct it. That last part
 * matters — the IP pin is a starting guess, never an answer.
 *
 * This runs server-side on purpose: a browser-side IP lookup leaks the customer's
 * address to a third party, breaks under CORS, and burns the provider quota once per
 * retry instead of once per request.
 */

export type IpLocation = {
  latitude: number;
  longitude: number;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  /** Radius of confidence in km — an IP pin is city/block level, never GPS-grade. */
  accuracyKm: number;
  source: "ip";
};

/** Headers set by the usual reverse proxies ahead of Express. */
const IP_HEADERS = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
  "true-client-ip",
] as const;

/**
 * Best-effort public IP for a request. Returns null for private/loopback addresses,
 * which are useless for geolocation and must never be sent to a third party.
 */
export function extractClientIp(headers: Record<string, string | string[] | undefined>): string | null {
  for (const name of IP_HEADERS) {
    const raw = headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) continue;
    // X-Forwarded-For is "client, proxy1, proxy2". The client is normally first, but
    // some edge setups prepend an internal hop, so walk forward and take the first
    // routable address. If every hop is private we return null rather than shipping
    // an unroutable address to a third party.
    for (const candidate of value.split(",")) {
      const trimmed = candidate.trim();
      if (trimmed && isPublicIp(trimmed)) return trimmed;
    }
  }
  return null;
}

/** IPv4 octets are all in range (the regex already enforces 1-3 digits). */
function isPublicIpv4(value: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!v4) return false;
  if (v4.slice(1).some((part) => Number(part) > 255)) return false;
  const a = Number(v4[1]);
  const b = Number(v4[2]);
  const c = Number(v4[3]);
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false; // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 192 && b === 0 && c === 2) return false; // TEST-NET-1 (documentation)
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 benchmarking
  if (a >= 224) return false; // multicast 224/4 + reserved 240.0.0.0/4
  return true;
}

export function isPublicIp(value: string): boolean {
  const ip = value.trim().toLowerCase();
  if (!ip) return false;
  if (ip === "::1" || ip === "::" || ip === "localhost") return false;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) IPv6.
  // Dual-stack listeners hand these to us verbatim, so they must be judged by
  // the IPv4 rules — skipping straight to the IPv6 branch let
  // ::ffff:169.254.169.254 (cloud metadata) and ::ffff:127.0.0.1 through as
  // "public" because the only IPv6 fallback test was `includes(":")`.
  const mapped = /^::(?:ffff:)?((?:\d{1,3}\.){3}\d{1,3})$/.exec(ip);
  if (mapped) return isPublicIpv4(mapped[1]);

  if (isPublicIpv4(ip)) return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(ip)) return false;
  if (/^fe[89ab][0-9a-f]:/.test(ip)) return false;
  return ip.includes(":");
}

const PROVIDER_TIMEOUT_MS = 2500;

/**
 * Cache policy.
 *
 * A hit is a 10-minute TTL because a mobile carrier CGNAT address really can
 * move between cities.
 *
 * A miss gets a deliberately short 30s TTL instead of being cached for the full
 * 10 minutes: one transient provider blip (or one exhausted upstream quota)
 * used to cache `null` and disable the IP fallback for that IP for ten minutes,
 * so the customer who happened to hit the outage lost their map seed long after
 * the provider recovered. Short is enough to absorb a retry storm without
 * outliving the outage.
 */
const POSITIVE_TTL_MS = 10 * 60 * 1000;
const NEGATIVE_TTL_MS = 30 * 1000;
/**
 * Hard ceiling on distinct cached IPs. A public storefront with unique visitor
 * IPs (mobile + CGNAT churn) would otherwise grow this Map without bound for the
 * life of the process.
 */
const MAX_CACHE_ENTRIES = 5000;

/**
 * Resolve an IP to an approximate location.
 *
 * `ipwho.is` is used first: HTTPS, no API key, and a generous free tier. `ipapi.co`
 * is the fallback. Any failure resolves to null — a missing fallback must never
 * break checkout, it only means the customer picks their address manually.
 */
export async function locateByIp(ip: string): Promise<IpLocation | null> {
  if (!isPublicIp(ip)) return null;

  const key = ip;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const result =
    (await fetchIpwho(key)) ?? (await fetchIpapi(key)) ?? null;

  const now = Date.now();
  // Prune before inserting: expired entries are dead weight, and a public
  // storefront sees a unique IP per visitor, so the Map must not be append-only.
  // forEach + delete rather than for..of: this module targets a downlevel
  // lib where Map iteration is not directly iterable.
  const stale: string[] = [];
  cache.forEach((v, k) => { if (v.expires <= now) stale.push(k); });
  for (const k of stale) cache.delete(k);
  // Still oversized after pruning (everything fresh): evict oldest-first so the
  // cache stays a bound on memory rather than on traffic.
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
  cache.set(key, {
    value: result,
    expires: now + (result ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
  });
  return result;
}

const cache = new Map<string, { value: IpLocation | null; expires: number }>();

function toFinite(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchIpwho(ip: string): Promise<IpLocation | null> {
  const data = (await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`)) as Record<string, unknown> | null;
  if (!data || data.success === false) return null;
  const latitude = toFinite(data.latitude);
  const longitude = toFinite(data.longitude);
  if (latitude == null || longitude == null) return null;
  const accuracyKm = toFinite(data.precision) ?? 20;
  return {
    latitude,
    longitude,
    city: typeof data.city === "string" ? data.city : null,
    region: typeof data.region === "string" ? data.region : null,
    postalCode: typeof data.postal === "string" ? data.postal : null,
    country: typeof data.country === "string" ? data.country : null,
    // An IP fix is never better than a few kilometres.
    accuracyKm: Math.min(Math.max(accuracyKm, 1), 200),
    source: "ip",
  };
}

async function fetchIpapi(ip: string): Promise<IpLocation | null> {
  const data = (await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`)) as Record<string, unknown> | null;
  if (!data || data.error) return null;
  const latitude = toFinite(data.latitude);
  const longitude = toFinite(data.longitude);
  if (latitude == null || longitude == null) return null;
  return {
    latitude,
    longitude,
    city: typeof data.city === "string" ? data.city : null,
    region: typeof data.region === "string" ? data.region : null,
    postalCode: typeof data.postal === "string" ? data.postal : null,
    country: typeof data.country_name === "string" ? data.country_name : null,
    accuracyKm: 20,
    source: "ip",
  };
}

/** Exposed for tests / diagnostics. */
export function _clearIpLocationCache(): void {
  cache.clear();
}

/** Exposed for tests / diagnostics: how many IPs are currently memoized. */
export function _ipLocationCacheSize(): number {
  return cache.size;
}