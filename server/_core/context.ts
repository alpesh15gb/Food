/** tRPC context factory: extracts session from cookie or Bearer token, resolves user and tenant. */
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { sdk, type AuthenticatedUser } from "./sdk";

export type TrpcContext = {
  user: AuthenticatedUser | null;
  req: Request;
  res: Response;
  restaurantId: string | null;
};

// NOTE on null semantics: return null ONLY for genuine not-found (no verified
// custom-domain row, or no session cookie). Database/unexpected errors must be
// logged with the request-id below and STILL resolve null, so a transient DB
// blip degrades to "unresolved tenant / anonymous" instead of 500ing every
// request. This stays fail-closed because tenant/permission procedures
// re-verify membership before authorizing anything.
async function resolveRestaurantFromHost(host: string, requestId: string): Promise<string | null> {
  const raw = host.split(":")[0].toLowerCase().replace(/^\.+|\.+$/g, "");
  // Strip a leading www. so www.example.com and example.com resolve to the
  // same verified custom-domain row (matches storefront defaultSlug).
  const domain = raw.replace(/^www\./, "");
  if (!domain) return null;
  try {
    const { getDb } = await import("../db");
    const { customDomains } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) {
      console.error(`[Tenant] (${requestId}) database unavailable during custom-domain lookup for host "${domain}"`);
      return null;
    }
    const match = await db
      .select({ restaurantId: customDomains.restaurantId })
      .from(customDomains)
      .where(and(eq(customDomains.domain, domain), eq(customDomains.isVerified, true)))
      .limit(1);
    return match[0]?.restaurantId ?? null;
  } catch (err) {
    console.error(
      `[Tenant] (${requestId}) custom-domain lookup failed for host "${domain}":`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function createContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<TrpcContext> {
  const rawRequestId = req.headers["x-request-id"];
  // X-Request-Id is attacker-controlled: use only for log correlation, bound
  // its length to avoid log-injection / oversized-header abuse.
  const requestId =
    (Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId)?.split(",")[0]?.trim().slice(0, 64) ||
    randomUUID();

  let user: AuthenticatedUser | null = null;
  try {
    user = await sdk.authenticateRequest(req);
  } catch (err) {
    // M-06: Log auth failures for observability (non-PII), tagged with request-id
    const path = req.path ?? req.url ?? "unknown";
    if (path !== "/" && !path.startsWith("/assets") && !path.startsWith("/images")) {
      console.warn(`[Auth] (${requestId}) Session rejected for ${path}:`, err instanceof Error ? err.message : "unknown");
    }
    user = null;
  }

  const host = req.headers.host ?? "";
  const restaurantId = await resolveRestaurantFromHost(host, requestId);

  return { user, req, res, restaurantId };
}
