import { z } from "zod";
import { requirePermission } from "../_core/trpc";
import { router } from "../_core/trpc";

export const analyticsRouter = router({
  revenueTrend: requirePermission("reports:read")
    .input(z.object({
      restaurantId: z.string().min(4),
      startDate: z.string(),
      endDate: z.string(),
      granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { orders } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, sql } = await import("drizzle-orm");

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      const truncFn = input.granularity === "monthly" ? "date_trunc('month', created_at)"
        : input.granularity === "weekly" ? "date_trunc('week', created_at)"
        : "date_trunc('day', created_at)";

      const rows = await db.execute(sql`
        SELECT ${sql.raw(truncFn)} AS period,
               COUNT(*)::int AS order_count,
               COALESCE(SUM(total_paise), 0)::bigint AS total_revenue_paise,
               COALESCE(AVG(total_paise), 0)::bigint AS avg_order_value_paise
        FROM orders
        WHERE restaurant_id = ${input.restaurantId}
          AND created_at >= ${start}
          AND created_at <= ${end}
          AND status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')
        GROUP BY period
        ORDER BY period ASC
      `);

      return (rows as any).rows?.map((r: any) => ({
        period: r.period,
        orderCount: r.order_count,
        totalRevenuePaise: Number(r.total_revenue_paise),
        avgOrderValuePaise: Number(r.avg_order_value_paise),
      })) ?? [];
    }),

  itemPerformance: requirePermission("reports:read")
    .input(z.object({
      restaurantId: z.string().min(4),
      startDate: z.string(),
      endDate: z.string(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { sql } = await import("drizzle-orm");

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      const rows = await db.execute(sql`
        SELECT oi.name AS item_name,
               SUM(oi.quantity)::int AS total_quantity,
               COALESCE(SUM(oi.total_price_paise), 0)::bigint AS total_revenue_paise,
               COALESCE(AVG(oi.unit_price_paise), 0)::bigint AS avg_unit_price_paise
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.restaurant_id = ${input.restaurantId}
          AND o.created_at >= ${start}
          AND o.created_at <= ${end}
          AND o.status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')
        GROUP BY oi.name
        ORDER BY total_revenue_paise DESC
        LIMIT ${input.limit}
      `);

      return (rows as any).rows?.map((r: any) => ({
        itemName: r.item_name,
        totalQuantity: r.total_quantity,
        totalRevenuePaise: Number(r.total_revenue_paise),
        avgUnitPricePaise: Number(r.avg_unit_price_paise),
      })) ?? [];
    }),

  hourlyHeatmap: requirePermission("reports:read")
    .input(z.object({
      restaurantId: z.string().min(4),
      days: z.number().min(1).max(90).default(30),
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { sql } = await import("drizzle-orm");

      const since = new Date(Date.now() - input.days * 86400000);

      const rows = await db.execute(sql`
        SELECT EXTRACT(DOW FROM created_at)::int AS day_of_week,
               EXTRACT(HOUR FROM created_at)::int AS hour_of_day,
               COUNT(*)::int AS order_count
        FROM orders
        WHERE restaurant_id = ${input.restaurantId}
          AND created_at >= ${since}
          AND status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')
        GROUP BY day_of_week, hour_of_day
        ORDER BY day_of_week, hour_of_day
      `);

      return (rows as any).rows?.map((r: any) => ({
        dayOfWeek: r.day_of_week,
        hourOfDay: r.hour_of_day,
        orderCount: r.order_count,
      })) ?? [];
    }),

  categoryBreakdown: requirePermission("reports:read")
    .input(z.object({
      restaurantId: z.string().min(4),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { sql } = await import("drizzle-orm");

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      const rows = await db.execute(sql`
        SELECT COALESCE(mc.name, 'Uncategorized') AS category_name,
               COUNT(DISTINCT o.id)::int AS order_count,
               COALESCE(SUM(oi.total_price_paise), 0)::bigint AS total_revenue_paise
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN menu_categories mc ON mc.id = oi.category_id
        WHERE o.restaurant_id = ${input.restaurantId}
          AND o.created_at >= ${start}
          AND o.created_at <= ${end}
          AND o.status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')
        GROUP BY mc.name
        ORDER BY total_revenue_paise DESC
      `);

      return (rows as any).rows?.map((r: any) => ({
        categoryName: r.category_name,
        orderCount: r.order_count,
        totalRevenuePaise: Number(r.total_revenue_paise),
      })) ?? [];
    }),

  customerRetention: requirePermission("reports:read")
    .input(z.object({
      restaurantId: z.string().min(4),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return { newCustomers: 0, repeatCustomers: 0, retentionRate: 0 };
      const { sql } = await import("drizzle-orm");

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      const rows = await db.execute(sql`
        WITH customer_orders AS (
          SELECT customer_id, COUNT(*) AS order_count
          FROM orders
          WHERE restaurant_id = ${input.restaurantId}
            AND created_at >= ${start}
            AND created_at <= ${end}
            AND status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')
            AND customer_id IS NOT NULL
          GROUP BY customer_id
        )
        SELECT
          COUNT(*) FILTER (WHERE order_count = 1)::int AS new_customers,
          COUNT(*) FILTER (WHERE order_count > 1)::int AS repeat_customers,
          COUNT(*)::int AS total_customers
        FROM customer_orders
      `);

      const row = (rows as any).rows?.[0];
      const total = row?.total_customers || 0;
      const repeat = row?.repeat_customers || 0;

      return {
        newCustomers: row?.new_customers || 0,
        repeatCustomers: repeat,
        retentionRate: total > 0 ? Math.round((repeat / total) * 100) : 0,
      };
    }),

  summaryStats: requirePermission("reports:read")
    .input(z.object({
      restaurantId: z.string().min(4),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return { totalOrders: 0, totalRevenuePaise: 0, avgOrderValuePaise: 0, cancelledCount: 0 };
      const { sql } = await import("drizzle-orm");

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      const rows = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT'))::int AS total_orders,
          COALESCE(SUM(total_paise) FILTER (WHERE status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')), 0)::bigint AS total_revenue_paise,
          COALESCE(AVG(total_paise) FILTER (WHERE status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')), 0)::bigint AS avg_order_value_paise,
          COUNT(*) FILTER (WHERE status IN ('CANCELLED', 'REJECTED'))::int AS cancelled_count
        FROM orders
        WHERE restaurant_id = ${input.restaurantId}
          AND created_at >= ${start}
          AND created_at <= ${end}
      `);

      const row = (rows as any).rows?.[0];
      return {
        totalOrders: row?.total_orders || 0,
        totalRevenuePaise: Number(row?.total_revenue_paise || 0),
        avgOrderValuePaise: Number(row?.avg_order_value_paise || 0),
        cancelledCount: row?.cancelled_count || 0,
      };
    }),
});
