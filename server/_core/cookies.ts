/**
 * Cookie configuration helpers for secure session management.
 *
 * Both admin and customer sessions use SameSite=Strict because the entire
 * application (storefront + admin panel) is served from the same origin
 * (e.g. 9housekitchen.in). There is no cross-origin iframe or OAuth
 * redirect that requires SameSite=None.
 *
 * Both use HttpOnly + Secure in production.
 */
import type { Request } from "express";

/**
 * Admin session cookie — SameSite=Strict for same-origin CSRF protection.
 * Previously used SameSite=None for Manus SDK iframe compatibility;
 * confirmed unnecessary: admin panel is same-origin at /admin.
 */
export function getSessionCookieOptions(_req: Request) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 12, // 12 hours
  };
}

/**
 * Customer OTP session cookie — SameSite=Strict for same-origin CSRF protection.
 * 30-day session. The storefront and admin panel share the same domain,
 * but customer sessions never satisfy admin role checks (server-side).
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
