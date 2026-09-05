import { z } from "zod";
import { requirePermission } from "../_core/trpc";
import { router } from "../_core/trpc";

/** Validate date range: start <= end and range <= 366 days. */
function assertValidRange(start: Date, end: Date) {
  if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid startDate or endDate.");
  }
  if (start > end) {
    throw new Error("startDate must be before or equal to endDate.");
  }
  const days = (end.getTime() - start.getTime()) / 86400000;
  if (days > 366) {
    throw new Error("Date range must not exceed 366 days.");
  }
}

/**
 * Normalize YYYY-MM-DD inputs to full-day UTC bounds so the end date is
 * inclusive. Date inputs arrive as midnight; without this the entire end
 * day (except 00:00:00) is excluded from every report.
 */
function normalizeDayBounds(start: Date, end: Date): { start: Date; end: Date } {
  const s = new Date(start);
  s.setUTCHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setUTCHours(23, 59, 59, 999);
  return { start: s, end: e };
}

const dateRangeSchema = {
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
};

export const analyticsRouter = router({
  revenueTrend: requirePermission("reports:read")
    .input(z.object({
      restaurantId: z.string().min(4),
      ...dateRangeSchema,
      granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { sql } = await import("drizzle-orm");

      assertValidRange(input.startDate, input.endDate);
      const { start, end } = normalizeDayBounds(input.startDate, input.endDate);

      // Timezone Asia/Kolkata: bucket periods in IST, not UTC.
      const truncFn = input.granularity === "monthly" ? "date_trunc('month', created_at AT TIME ZONE 'Asia/Kolkata')"
        : input.granularity === "weekly" ? "date_trunc('week', created_at AT TIME ZONE 'Asia/Kolkata')"
        : "date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')";

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
      ...dateRangeSchema,
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { sql } = await import("drizzle-orm");

      assertValidRange(input.startDate, input.endDate);
      const { start, end } = normalizeDayBounds(input.startDate, input.endDate);

      const rows = await db.execute(sql`
        SELECT oi.item_name_snapshot AS item_name,
               SUM(oi.quantity)::int AS total_quantity,
               COALESCE(SUM(oi.unit_price_paise * oi.quantity), 0)::bigint AS total_revenue_paise,
               COALESCE(AVG(oi.unit_price_paise), 0)::bigint AS avg_unit_price_paise
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.restaurant_id = ${input.restaurantId}
          AND o.created_at >= ${start}
          AND o.created_at <= ${end}
          AND o.status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')
        GROUP BY oi.item_name_snapshot
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
        SELECT EXTRACT(DOW FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS day_of_week,
               EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour_of_day,
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
      ...dateRangeSchema,
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return [];
      const { sql } = await import("drizzle-orm");

      assertValidRange(input.startDate, input.endDate);
      const { start, end } = normalizeDayBounds(input.startDate, input.endDate);

      const rows = await db.execute(sql`
        SELECT COALESCE(mc.name, 'Uncategorized') AS category_name,
               COUNT(DISTINCT o.id)::int AS order_count,
               COALESCE(SUM(oi.unit_price_paise * oi.quantity), 0)::bigint AS total_revenue_paise
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        LEFT JOIN menu_categories mc ON mc.id = mi.category_id
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
      ...dateRangeSchema,
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return { newCustomers: 0, repeatCustomers: 0, retentionRate: 0 };
      const { sql } = await import("drizzle-orm");

      assertValidRange(input.startDate, input.endDate);
      const { start, end } = normalizeDayBounds(input.startDate, input.endDate);

      // First-ever order CTE: new = first order ever falls in range;
      // repeat = ordered in range but first order was before range.
      const rows = await db.execute(sql`
        WITH first_orders AS (
          SELECT customer_id, MIN(created_at) AS first_at
          FROM orders
          WHERE restaurant_id = ${input.restaurantId}
            AND status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')
            AND customer_id IS NOT NULL
          GROUP BY customer_id
        ),
        range_customers AS (
          SELECT DISTINCT customer_id
          FROM orders
          WHERE restaurant_id = ${input.restaurantId}
            AND created_at >= ${start}
            AND created_at <= ${end}
            AND status NOT IN ('CANCELLED', 'REJECTED', 'PENDING_PAYMENT')
            AND customer_id IS NOT NULL
        )
        SELECT
          COUNT(*) FILTER (WHERE f.first_at >= ${start} AND f.first_at <= ${end})::int AS new_customers,
          COUNT(*) FILTER (WHERE f.first_at < ${start})::int AS repeat_customers,
          COUNT(*)::int AS total_customers
        FROM range_customers r
        JOIN first_orders f ON f.customer_id = r.customer_id
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
      ...dateRangeSchema,
    }))
    .query(async ({ input }) => {
      const db = await import("../db").then(m => m.getDb());
      if (!db) return { totalOrders: 0, totalRevenuePaise: 0, avgOrderValuePaise: 0, cancelledCount: 0 };
      const { sql } = await import("drizzle-orm");

      assertValidRange(input.startDate, input.endDate);
      const { start, end } = normalizeDayBounds(input.startDate, input.endDate);

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
