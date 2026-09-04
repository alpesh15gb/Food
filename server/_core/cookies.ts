/**
 * Cookie configuration helpers for secure session management.
 *
 * Both admin and customer sessions use SameSite=Strict because the entire
 * application (storefront + admin panel) is served from the same origin
 * (e.g. 9housekitchen.in). There is no cross-origin iframe or OAuth
 * redirect that requires SameSite=None.
 *
 * Both use HttpOnly + Secure when served over HTTPS / in production.
 */
import type { Request } from "express";
import {
  ADMIN_COOKIE_NAME,
  COOKIE_NAME,
  CUSTOMER_COOKIE_NAME,
} from "../../shared/const";

// Re-export the canonical cookie names so callers use shared const.
export { ADMIN_COOKIE_NAME, COOKIE_NAME, CUSTOMER_COOKIE_NAME };

/** Admin session lifetime: 12 hours. */
export const ADMIN_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12h
/** Customer OTP session lifetime: 30 days. */
export const CUSTOMER_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30d

/**
 * HTTPS detection for the Secure cookie flag. `secure` must be true whenever
 * the response actually goes over TLS — otherwise proxy it from
 * X-Forwarded-Proto (VPS behind nginx/Caddy) or force it in production.
 * A blanket `secure: true` breaks local HTTP dev (cookie never stored), and
 * a blanket `false` leaks sessions; hence this per-request check.
 * `req.protocol === "https"` is equivalent to Express `req.secure` and is
 * included so plain mock requests still resolve correctly.
 */
function isSecureRequest(req: Request): boolean {
  const r = req as unknown as {
    secure?: boolean;
    protocol?: unknown;
    headers?: Record<string, unknown>;
  };
  if (r?.secure) return true;
  if (typeof r?.protocol === "string" && r.protocol.split(",")[0]?.trim().toLowerCase() === "https") {
    return true;
  }
  const proto = r?.headers?.["x-forwarded-proto"];
  const first = Array.isArray(proto) ? proto[0] : proto;
  if (typeof first === "string" && first.split(",")[0]?.trim().toLowerCase() === "https") {
    return true;
  }
  return process.env.NODE_ENV === "production";
}

/**
 * Admin session cookie — SameSite=Strict for same-origin CSRF protection.
 * Previously used SameSite=None for Manus SDK iframe compatibility;
 * confirmed unnecessary: admin panel is same-origin at /admin.
 * 12-hour session.
 */
export function getSessionCookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "strict" as const,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_MS, // 12 hours
  };
}

/**
 * Admin cookie options alias (12h). Prefer this over getSessionCookieOptions
 * in admin auth flows for clarity; both are identical.
 */
export function getAdminCookieOptions(req: Request) {
  return getSessionCookieOptions(req);
}

/**
 * Customer OTP session cookie — SameSite=Strict for same-origin CSRF protection.
 * 30-day session. The storefront and admin panel share the same domain,
 * but customer sessions never satisfy admin role checks (server-side).
 */
export function getCustomerCookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "strict" as const,
    path: "/",
    maxAge: CUSTOMER_SESSION_MAX_AGE_MS, // 30 days
  };
}
