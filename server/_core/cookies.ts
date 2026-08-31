/** Cookie configuration helpers for secure session management. */
import type { Request } from "express";

export function getSessionCookieOptions(req: Request) {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
  };
}
