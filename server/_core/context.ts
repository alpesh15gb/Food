/** tRPC context factory: extracts session from cookie or Bearer token, resolves user and tenant. */
import type { Request, Response } from "express";
import { COOKIE_NAME } from "../../shared/const";
import { sdk, type AuthenticatedUser } from "./sdk";

export type TrpcContext = {
  user: AuthenticatedUser | null;
  req: Request;
  res: Response;
  restaurantId: string | null;
};

async function resolveRestaurantFromHost(host: string): Promise<string | null> {
  const domain = host.split(":")[0].toLowerCase();
  try {
    const { getDb } = await import("../db");
    const { customDomains, restaurants } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return null;
    const match = await db
      .select({ restaurantId: customDomains.restaurantId })
      .from(customDomains)
      .where(and(eq(customDomains.domain, domain), eq(customDomains.isVerified, true)))
      .limit(1);
    return match[0]?.restaurantId ?? null;
  } catch {
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
  let user: AuthenticatedUser | null = null;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    user = null;
  }

  const host = req.headers.host ?? "";
  const restaurantId = await resolveRestaurantFromHost(host);

  return { user, req, res, restaurantId };
}
