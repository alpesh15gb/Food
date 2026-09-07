/** Privacy-safe funnel beacon (MP-009). Fire-and-forget, never blocks UX. No PII. */
const ALLOWED = new Set([
  "restaurant_viewed", "item_viewed", "add_to_cart", "view_cart",
  "checkout_started", "address_selected", "payment_started",
  "payment_successful", "order_created",
  "payment_failed", "coupon_failed", "restaurant_unavailable",
  "item_unavailable", "address_not_serviceable", "login_failed",
]);

const seen = new Set<string>();

export function funnel(event: string, opts?: { slug?: string; reason?: string; dedupeKey?: string }) {
  try {
    if (!ALLOWED.has(event)) return;
    // Dedupe re-render double-fires (same key once per page load).
    if (opts?.dedupeKey) {
      if (seen.has(opts.dedupeKey)) return;
      seen.add(opts.dedupeKey);
    }
    const body = JSON.stringify({
      event,
      slug: opts?.slug?.slice(0, 96),
      reason: opts?.reason?.slice(0, 64),
    });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/funnel", body);
    else fetch("/api/funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => undefined);
  } catch { /* ignore */ }
}
