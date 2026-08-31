/**
 * Cookie configuration helpers for secure session management.
 *
 * Two cookie profiles:
 * - Admin: SameSite=None (preserves Manus SDK cross-origin iframe compatibility)
 * - Customer: SameSite=Strict (same-origin app, maximum CSRF protection)
 *
 * Both use HttpOnly + Secure in production.
 */
import type { Request } from "express";

/**
 * Admin/shared session cookie — keeps existing Manus SDK behavior.
 * SameSite=None allows cross-origin iframe auth flows.
 * Do NOT weaken this without verifying Manus OAuth still works.
 */
export function getSessionCookieOptions(_req: Request) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
  };
}

/**
 * Customer OTP session cookie — strict same-origin protection.
 * SameSite=Strict prevents CSRF entirely for same-origin apps.
 * The storefront and admin panel are served from the same domain,
 * so Strict is correct and more secure than None/Lax.
 */
export function getCustomerCookieOptions(_req: Request) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  };
}
