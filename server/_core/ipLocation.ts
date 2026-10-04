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

export function isPublicIp(value: string): boolean {
  const ip = value.trim();
  if (!ip) return false;
  if (ip === "::1" || ip === "::" || ip.toLowerCase() === "localhost") return false;
  // IPv4
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (v4.slice(1).some((part) => Number(part) > 255)) return false;
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false; // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    return true;
  }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  const lower = ip.toLowerCase();
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return false;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return false;
  return lower.includes(":");
}

const PROVIDER_TIMEOUT_MS = 2500;

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

  // Short TTL: a mobile carrier CGNAT address can move between cities.
  cache.set(key, { value: result, expires: Date.now() + 10 * 60 * 1000 });
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