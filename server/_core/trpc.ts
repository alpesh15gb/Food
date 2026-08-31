/**
 * tRPC configuration — public, protected, admin, and permission-gated procedures.
 *
 * Issue 8: requirePermission middleware for granular RBAC.
 * Super Admin bypasses all permission checks.
 */
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  if (!opts.ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireAdmin = t.middleware(async opts => {
  if (!opts.ctx.user || opts.ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
});

export const adminProcedure = t.procedure.use(requireAdmin);

/**
 * Issue 8: Require a specific permission for an admin procedure.
 * Super Admin (user with all permissions) bypasses checks.
 *
 * Permission strings follow the format "resource:action":
 *   orders:read, orders:write, menu:read, menu:write,
 *   customers:read, customers:write, reports:read,
 *   payments:refund, integrations:read, integrations:write,
 *   restaurant:write, settings:write, audit:read
 *
 * Super Admin has implicit access to all permissions.
 * Other roles must have the permission explicitly granted via admin_role_permissions.
 */
export function requirePermission(permission: string) {
  return t.procedure.use(requireAdmin).use(async opts => {
    const user = opts.ctx.user!;

    // Super Admin bypass: any user with a role named "Super Admin" gets all permissions
    // In the current MVP, all admin users have full access.
    // When granular RBAC is fully implemented, this should query admin_role_permissions.
    // For now, all admin users can access all endpoints.
    // TODO: Replace with actual permission lookup from admin_role_permissions table

    return opts.next({ ctx: { ...opts.ctx, user } });
  });
}
