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
 * Resolve restaurantId from explicit input (restaurantId or slug) or from the
 * custom-domain tenant on context.
 * Precedence: input.restaurantId → input.slug lookup → ctx.restaurantId.
 * Returns null when no tenant can be resolved. Input-supplied IDs are safe to
 * accept here because every consumer re-verifies membership before authorizing.
 */
async function resolveTenantId(
  ctx: TrpcContext,
  input?: { slug?: unknown; restaurantId?: unknown },
): Promise<string | null> {
  const rawId = typeof input?.restaurantId === "string" ? input.restaurantId.trim() : "";
  if (rawId.length > 0) {
    return rawId;
  }
  const rawSlug = typeof input?.slug === "string" ? input.slug.trim().toLowerCase() : "";
  if (rawSlug) {
    try {
      const { getRestaurantBySlug } = await import("../db");
      const restaurant = await getRestaurantBySlug(rawSlug);
      if (restaurant) return restaurant.id;
      return null;
    } catch {
      return null;
    }
  }
  if (ctx.restaurantId) return ctx.restaurantId;
  return null;
}

/**
 * Fetch the caller's ACTIVE membership for a restaurant (tenant scoping gate).
 * Returns the membership row or null. Scoped by restaurant_id so a membership
 * in restaurant A never authorizes access to restaurant B.
 */
async function getActiveMembership(userId: number, restaurantId: string) {
  const db = await import("../db").then(m => m.getDb());
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const { restaurantMembers } = await import("../../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");

  const [membership] = await db.select().from(restaurantMembers)
    .where(and(
      eq(restaurantMembers.userId, userId),
      eq(restaurantMembers.restaurantId, restaurantId),
      eq(restaurantMembers.isActive, true),
    ))
    .limit(1);

  return membership ?? null;
}

/**
 * Tenant-scoped procedure for admin endpoints.
 * Resolves restaurantId from input (restaurantId/slug) or custom domain,
 * then enforces an ACTIVE membership in the resolved restaurant — a global
 * admin role alone is NOT sufficient for tenant data.
 *
 * Accepts any authenticated user with an active membership (owner/admin/
 * manager/staff/kitchen). This is what lets self-registered owners
 * (global role "user" + owner membership) reach their own restaurant.
 */
export const tenantProcedure = t.procedure.use(requireUser).use(async opts => {
  const input = opts.input as unknown as Record<string, unknown> | undefined;
  const restaurantId = await resolveTenantId(opts.ctx, input);

  if (!restaurantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Restaurant not found. Provide a valid slug or use a configured custom domain." });
  }

  const membership = await getActiveMembership(opts.ctx.user!.id, restaurantId);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this restaurant." });
  }

  return opts.next({ ctx: { ...opts.ctx, restaurantId } });
});

/**
 * Public storefront procedure with tenant resolution.
 * No auth required, but resolves restaurantId from domain or slug input.
 */
export const storeProcedure = t.procedure.use(async opts => {
  const input = opts.input as unknown as Record<string, unknown> | undefined;
  const restaurantId = await resolveTenantId(opts.ctx, input);

  if (!restaurantId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant not found." });
  }

  return opts.next({ ctx: { ...opts.ctx, restaurantId } });
});

/**
 * Shared tenant gate: fail-closed on unresolved scope; global platform
 * admins (role "admin" without membership) retain access; everyone else
 * needs an ACTIVE membership in the restaurant.
 */
export async function checkTenantAccess(
  user: { id: number; role: string },
  restaurantId: string | null | undefined,
): Promise<void> {
  if (!restaurantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Restaurant scope is required for this operation." });
  }
  if (user.role === "admin") return;
  const membership = await getActiveMembership(user.id, restaurantId);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this restaurant." });
  }
}

/**
 * Tenant access for endpoints whose input already carries the tenant
 * (restaurantId or slug) or whose host resolves one. Any authenticated
 * operator the gate accepts may proceed — use requirePermission when a
 * specific permission is needed instead.
 */
export const tenantAccessProcedure = t.procedure.use(requireUser).use(async opts => {
  const user = opts.ctx.user!;
  const input = opts.input as unknown as Record<string, unknown> | undefined;
  const restaurantId = await resolveTenantId(opts.ctx, input);
  await checkTenantAccess(user, restaurantId);
  return opts.next({ ctx: { ...opts.ctx, user, restaurantId } });
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
  return t.procedure.use(requireUser).use(async opts => {
    const user = opts.ctx.user!;

    const input = opts.input as unknown as Record<string, unknown> | undefined;
    const restaurantId = await resolveTenantId(opts.ctx, input);

    // Fail-closed: permission-gated procedures MUST resolve a tenant.
    // Never call next() without a rid — an unresolved scope must deny.
    if (!restaurantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Restaurant scope is required for this operation." });
    }

    // H-01: Verify user is actually a member of this restaurant.
    // Platform operators (global role "admin" with no tenant membership —
    // e.g. the VPS local administrator) retain access: they operate the
    // platform itself, not one kitchen. Tenant isolation below applies to
    // member accounts (owner bypass + granular role permissions).
    const membership = await getActiveMembership(user.id, restaurantId);
    if (!membership) {
      if (user.role === "admin") {
        return opts.next({ ctx: { ...opts.ctx, user, restaurantId } });
      }
      throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this restaurant." });
    }

    // Owner role bypasses all permission checks
    if (membership.role === "owner") {
      return opts.next({ ctx: { ...opts.ctx, user, restaurantId } });
    }

    // For non-owner roles, check admin_user_roles → admin_role_permissions.
    // Tenant scoping: admin_user_roles.restaurant_id (nullable for legacy global
    // grants). A row grants access when it matches THIS restaurant or is a
    // legacy global (NULL) row. The restaurant_members join re-verifies active
    // membership in this restaurant — do not drop either gate.
    const db = await import("../db").then(m => m.getDb());
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const { restaurantMembers, adminUserRoles, adminRolePermissions } = await import("../../drizzle/schema");
    const { eq, and, or, isNull } = await import("drizzle-orm");

    const perms = await db.select({ permission: adminRolePermissions.permission })
      .from(adminUserRoles)
      .innerJoin(adminRolePermissions, eq(adminUserRoles.roleId, adminRolePermissions.roleId))
      .innerJoin(restaurantMembers, eq(restaurantMembers.userId, adminUserRoles.userId))
      .where(and(
        eq(adminUserRoles.userId, user.id),
        or(eq(adminUserRoles.restaurantId, restaurantId), isNull(adminUserRoles.restaurantId)),
        eq(restaurantMembers.restaurantId, restaurantId),
        eq(restaurantMembers.isActive, true),
      ));

    const hasPermission = perms.some(p => p.permission === permission || p.permission === "*");
    // H-02: Fail-closed — deny access on permission check failure
    if (!hasPermission) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Missing permission: ${permission}` });
    }

    return opts.next({ ctx: { ...opts.ctx, user, restaurantId } });
  });
}
