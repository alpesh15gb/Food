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
