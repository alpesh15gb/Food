/** tRPC context factory: extracts session from cookie or Bearer token, resolves user. */
import type { Request, Response } from "express";
import { COOKIE_NAME } from "../../shared/const";
import { sdk, type AuthenticatedUser } from "./sdk";

export type TrpcContext = {
  user: AuthenticatedUser | null;
  req: Request;
  res: Response;
};

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
  return { user, req, res };
}
