/** Platform-domain helpers (MunchPro brand host vs restaurant hosts). */
import { trpc } from "@/lib/trpc";

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

/** True when `hostname` is the platform apex (or its www), never a restaurant host. */
export function isPlatformHostname(hostname: string, platformDomain: string): boolean {
  const host = normalizeHostname(hostname);
  const apex = normalizeHostname(platformDomain).replace(/^www\./, "");
  if (!apex) return false;
  return host === apex || host === `www.${apex}`;
}

/**
 * First path segments owned by the shell, never a restaurant slug.
 * Slugs are created lowercase server-side (see Signup + admin router), so any
 * other first segment is a restaurant slug and is canonicalized to lowercase
 * (storefront reads are case-sensitive; tenant procedures tolerate case, but
 * canonical links keep back-button + share URLs stable).
 */
export const RESERVED_PATH_FIRST = new Set([
  "admin",
  "signup",
  "order",
  "assets",
  "api",
  "images",
  "manus-storage",
  "__manus__",
]);

/**
 * Canonicalize a wouter location (pathname + preserved ?query/#hash):
 * collapse duplicate slashes, strip a trailing slash, lowercase reserved +
 * slug segments. `/order/:number` keeps the order number's case (opaque id).
 * Returns the corrected location, or null when already canonical.
 */
export function canonicalPath(location: string): string | null {
  let cut = location.length;
  const q = location.indexOf("?");
  const h = location.indexOf("#");
  if (q !== -1) cut = Math.min(cut, q);
  if (h !== -1) cut = Math.min(cut, h);
  const pathname = location.slice(0, cut);
  const suffix = location.slice(cut);
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  let path = collapsed.length > 1 ? collapsed.replace(/\/+$/, "") : collapsed;
  if (!path.startsWith("/")) path = `/${path}`;
  const segs = path.split("/").filter(Boolean);
  const firstLow = segs.length > 0 ? segs[0].toLowerCase() : "";
  const fixed = segs.map((s, i) => {
    // Order numbers are opaque ids — preserve their case.
    if (i === 1 && firstLow === "order") return s;
    return s.toLowerCase();
  });
  const next = `/${fixed.join("/")}${suffix}`;
  return next === location ? null : next;
}

export function usePlatformHost(): {
  isPlatform: boolean;
  isLoading: boolean;
  platformDomain: string;
  featuredName: string;
  featuredUrl: string;
} {
  const platform = trpc.system.platformConfig.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const domain = platform.data?.platformDomain ?? "";
  const isPlatform =
    typeof window !== "undefined" && isPlatformHostname(window.location.hostname, domain);
  return {
    isPlatform,
    isLoading: platform.isLoading,
    platformDomain: domain,
    featuredName: platform.data?.featuredStorefrontName ?? "",
    featuredUrl: platform.data?.featuredStorefrontUrl ?? "",
  };
}
