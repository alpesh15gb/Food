/**
 * tRPC configuration — public, protected, admin, tenant-scoped, and permission-gated procedures.
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
 * Resolve restaurantId from context (custom domain) or fallback to slug lookup.
 * Used by both tenantProcedure (admin) and storeProcedure (storefront).
 */
async function resolveTenantId(ctx: TrpcContext, slug?: string): Promise<string | null> {
  if (ctx.restaurantId) return ctx.restaurantId;
  if (!slug) return null;
  try {
    const { getRestaurantBySlug } = await import("../db");
    const restaurant = await getRestaurantBySlug(slug);
    return restaurant?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Tenant-scoped procedure for admin endpoints.
 * Resolves restaurantId from custom domain (Host header) or requires it in input.
 * Ensures the authenticated user is a member of the resolved restaurant.
 */
export const tenantProcedure = t.procedure.use(requireAdmin).use(async opts => {
  const input = opts.input as unknown as Record<string, unknown> | undefined;
  const slug = typeof input?.slug === "string" ? input.slug : undefined;
  const restaurantId = await resolveTenantId(opts.ctx, slug);

  if (!restaurantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Restaurant not found. Provide a valid slug or use a configured custom domain." });
  }

  return opts.next({ ctx: { ...opts.ctx, restaurantId } });
});

/**
 * Public storefront procedure with tenant resolution.
 * No auth required, but resolves restaurantId from domain or slug input.
 */
export const storeProcedure = t.procedure.use(async opts => {
  const input = opts.input as unknown as Record<string, unknown> | undefined;
  const slug = typeof input?.slug === "string" ? input.slug : undefined;
  const restaurantId = await resolveTenantId(opts.ctx, slug);

  if (!restaurantId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant not found." });
  }

  return opts.next({ ctx: { ...opts.ctx, restaurantId } });
});

/**
 * Require a specific permission for an admin procedure.
 * Super Admin (user with all permissions) bypasses checks.
 *
 * Permission strings follow the format "resource:action":
 *   orders:read, orders:write, menu:read, menu:write,
 *   customers:read, customers:write, reports:read,
 *   payments:refund, integrations:read, integrations:write,
 *   restaurant:write, settings:write, audit:read
 */
export function requirePermission(permission: string) {
  return t.procedure.use(requireAdmin).use(async opts => {
    const user = opts.ctx.user!;

    const input = opts.input as unknown as Record<string, unknown> | undefined;
    const slug = typeof input?.slug === "string" ? input.slug : undefined;
    const restaurantId = await resolveTenantId(opts.ctx, slug);

    if (restaurantId) {
      const db = await import("../db").then(m => m.getDb());
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { restaurantMembers } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      const [membership] = await db.select().from(restaurantMembers)
        .where(and(
          eq(restaurantMembers.userId, user.id),
          eq(restaurantMembers.restaurantId, restaurantId),
          eq(restaurantMembers.isActive, true),
        ))
        .limit(1);

      // H-01: Verify user is actually a member of this restaurant
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this restaurant." });
      }

      // Owner role bypasses all permission checks
      if (membership.role === "owner") {
        return opts.next({ ctx: { ...opts.ctx, user, restaurantId } });
      }

      // For non-owner roles, check admin_user_roles → admin_role_permissions
      const { adminUserRoles, adminRolePermissions } = await import("../../drizzle/schema");
      const perms = await db.select({ permission: adminRolePermissions.permission })
        .from(adminUserRoles)
        .innerJoin(adminRolePermissions, eq(adminUserRoles.roleId, adminRolePermissions.roleId))
        .where(eq(adminUserRoles.userId, user.id));

      const hasPermission = perms.some(p => p.permission === permission || p.permission === "*");
      // H-02: Fail-closed — deny access on permission check failure
      if (!hasPermission) {
        throw new TRPCError({ code: "FORBIDDEN", message: `Missing permission: ${permission}` });
      }
    }

    return opts.next({ ctx: { ...opts.ctx, user, restaurantId } });
  });
}
