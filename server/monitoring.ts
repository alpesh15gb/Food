/**
 * Production monitoring helpers (MP-008): money-critical reconciler queries.
 * Pure SQL builders + an admin-facing summary — alerting (Slack/PagerDuty)
 * polls the `admin.opsAlerts` endpoint or scrapes logs for [ALERT].
 */
import { sql } from "drizzle-orm";

export type OpsAlert = {
  key: string;
  severity: "P0" | "P1";
  count: number;
  message: string;
};

export async function getOpsAlerts(): Promise<{ alerts: OpsAlert[]; checkedAt: string }> {
  const { getDb } = await import("./db");
  const db = await getDb();
  const checkedAt = new Date().toISOString();
  if (!db) {
    return { alerts: [{ key: "db_unavailable", severity: "P0", count: 1, message: "Database unavailable." }], checkedAt };
  }
  const alerts: OpsAlert[] = [];
  try {
    // P0: payments CAPTURED/paid but order never reached PLACED+ (stuck PENDING_PAYMENT >10m).
    const stuck = (await db.execute(sql`
      SELECT count(*)::int AS count FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.status = 'CAPTURED' AND o.status = 'PENDING_PAYMENT'
        AND o.created_at < NOW() - INTERVAL '10 minutes'
    `) as unknown as { rows: Array<{ count: number }> }).rows?.[0]?.count ?? 0;
    if (Number(stuck) > 0) {
      alerts.push({ key: "payment_captured_order_stuck", severity: "P0", count: Number(stuck), message: `${stuck} paid order(s) stuck in PENDING_PAYMENT >10m — investigate webhook/callback gap.` });
      console.error(`[ALERT][P0] payment_captured_order_stuck count=${stuck}`);
    }
    // P0: unprocessed webhook events older than 10 minutes (provider retrying, we failing).
    const wh = (await db.execute(sql`
      SELECT count(*)::int AS count FROM webhook_events
      WHERE processed = false AND created_at < NOW() - INTERVAL '10 minutes'
    `) as unknown as { rows: Array<{ count: number }> }).rows?.[0]?.count ?? 0;
    if (Number(wh) > 0) {
      alerts.push({ key: "webhook_backlog", severity: "P0", count: Number(wh), message: `${wh} webhook event(s) unprocessed >10m.` });
      console.error(`[ALERT][P0] webhook_backlog count=${wh}`);
    }
    // P1: PENDING_PAYMENT orders older than 2h (abandoned holds, coupon/stock tied).
    const stale = (await db.execute(sql`
      SELECT count(*)::int AS count FROM orders
      WHERE status = 'PENDING_PAYMENT' AND created_at < NOW() - INTERVAL '2 hours'
    `) as unknown as { rows: Array<{ count: number }> }).rows?.[0]?.count ?? 0;
    if (Number(stale) > 0) {
      alerts.push({ key: "stale_pending_orders", severity: "P1", count: Number(stale), message: `${stale} order(s) in PENDING_PAYMENT >2h (abandoned checkout).` });
    }
    // P1: refunds stuck PENDING >24h.
    const refunds = (await db.execute(sql`
      SELECT count(*)::int AS count FROM refunds WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '24 hours'
    `) as unknown as { rows: Array<{ count: number }> }).rows?.[0]?.count ?? 0;
    if (Number(refunds) > 0) {
      alerts.push({ key: "refund_backlog", severity: "P1", count: Number(refunds), message: `${refunds} refund(s) PENDING >24h.` });
      console.error(`[ALERT][P1] refund_backlog count=${refunds}`);
    }
  } catch (err) {
    alerts.push({ key: "monitor_query_failed", severity: "P1", count: 1, message: `Monitor query failed: ${err instanceof Error ? err.message : String(err)}` });
  }
  return { alerts, checkedAt };
}
