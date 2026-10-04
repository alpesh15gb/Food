/**
 * Customer order tracking — live status timeline for confirmation + tracking routes.
 * Polls every 20s while the order is active (preparing → rider → delivered),
 * stops on terminal states. Rider name + provider live-tracking link surface
 * automatically once Shadowfax webhooks/dispatch populate them.
 */
import { useRef } from "react";
import { Bike, Check, Clock3, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/types";
import { trpc } from "@/lib/trpc";

const TERMINAL_STATUSES = [
  "DELIVERED",
  "CANCELLED",
  "REJECTED",
  "REFUNDED",
  // A normal full refund goes DELIVERED -> REFUND_PENDING. Omitting it polled
  // every 20s forever on an order that was never going to change again.
  "REFUND_PENDING",
];

/** Give up on automatic polling after this many consecutive failures. */
const MAX_POLL_FAILURES = 3;
/** Poll cadence while the order is still in flight. */
const POLL_INTERVAL_MS = 20000;

export default function TrackingScreen({
  orderNumber,
  trackingToken,
  restaurantName,
  onMenu,
  variant,
}: {
  orderNumber: string;
  trackingToken: string;
  restaurantName?: string;
  onMenu?: () => void;
  variant: "confirmation" | "tracking";
}) {
  const hasCredentials = orderNumber.length >= 5 && trackingToken.length >= 16;
  // Counts DISTINCT failed polls, not invocations. `refetchInterval` is
  // re-evaluated more than once per fetch (on every observer update), so a naive
  // counter would exhaust its budget on a healthy order and silently freeze live
  // tracking. `errorUpdatedAt` changes exactly once per failed fetch and returns
  // to 0 on success, which is the documented signal for "one more failure".
  const consecutiveFailures = useRef(0);
  const lastErrorAt = useRef(0);
  const tracking = trpc.storefront.orderTracking.useQuery(
    { orderNumber, trackingToken },
    {
      enabled: hasCredentials,
      // Live "partner on the way" feel without hammering the server; stop
      // polling once the order reaches a terminal state, or after repeated
      // failures (the manual "Try again" button remains).
      refetchInterval: (query) => {
        const status = String(
          (query.state.data as { status?: string } | undefined)?.status ?? ""
        );
        if (status && TERMINAL_STATUSES.includes(status)) return false;

        const errorAt = query.state.errorUpdatedAt ?? 0;
        if (errorAt === 0) {
          consecutiveFailures.current = 0;
        } else if (errorAt !== lastErrorAt.current) {
          lastErrorAt.current = errorAt;
          consecutiveFailures.current += 1;
        }
        if (consecutiveFailures.current >= MAX_POLL_FAILURES) return false;
        return POLL_INTERVAL_MS;
      },
    }
  );

  // Every time shown to a customer is pinned to IST explicitly. Without an
  // explicit timeZone these render in the *device's* zone, so a customer browsing
  // from abroad sees kitchen-local times as if they were their own.
  const formatClockTime = (value: unknown): string | null => {
    if (typeof value !== "string" && !(value instanceof Date)) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  };

  const formatEtaTime = formatClockTime;

  /** "Today 7:45 pm" / "8 Mar, 7:45 pm" — used for timeline milestones. */
  const formatMilestoneTime = (value: unknown): string | null => {
    if (typeof value !== "string" && !(value instanceof Date)) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const clock = formatClockTime(date);
    if (!clock) return null;
    const istDay = new Date(
      date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );
    const todayIst = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );
    const sameDay = istDay.toDateString() === todayIst.toDateString();
    if (sameDay) return `Today ${clock}`;
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }) + `, ${clock}`;
  };

  const status = String(tracking.data?.status ?? "");
  const isTerminal = TERMINAL_STATUSES.includes(status);
  // Prefer the absolute delivery window written at dispatch and recomputed at
  // pickup — it is a real clock time that tightens as the order progresses. The
  // order-level `estimatedMinutes` is a duration, and neither form is shown on a
  // terminal order, where a frozen "ETA ~45 min" (or a stale arrival clock time)
  // reads as though the food were still coming.
  const etaClockTime = formatEtaTime(tracking.data?.delivery?.estimatedDelivery);
  const eta = isTerminal
    ? null
    : etaClockTime ?? (tracking.data?.estimatedMinutes
      ? `~${tracking.data.estimatedMinutes} min`
      : null);

  return (
    <main
      className="grid min-h-dvh place-items-center px-4 py-10"
      style={{ background: "var(--sf-bg)" }}
    >
      <section
        aria-live="polite"
        className="sf-card w-full max-w-lg min-w-0 p-8 text-center"
      >
        {!hasCredentials ? (
          <>
            <h1
              className="sf-heading mt-2 text-3xl"
              style={{ color: "var(--sf-text)" }}
            >
              {variant === "confirmation"
                ? "Thank you!"
                : "Track your order"}
            </h1>
            <p
              role="alert"
              className="mt-3 text-sm leading-relaxed"
              style={{ color: "var(--sf-text-secondary)" }}
            >
              We couldn't find your secure order link — the order number or
              tracking token looks missing or invalid. Please open tracking
              from your confirmation page or receipt. If you need help,
              contact {restaurantName ?? "the restaurant"} directly for
              support.
            </p>
            {onMenu && (
              <Button
                onClick={onMenu}
                className="mt-6 h-12 cursor-pointer touch-manipulation rounded-[var(--sf-radius-btn)] px-6 font-extrabold text-white transition-all duration-200 hover:brightness-110 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                style={{ background: "var(--sf-primary)" }}
              >
                Back to menu
              </Button>
            )}
          </>
        ) : tracking.isLoading ? (
          <>
            <div
              className="mx-auto grid h-16 w-16 place-items-center rounded-full"
              style={{
                background: "var(--sf-primary-soft)",
                color: "var(--sf-primary)",
              }}
            >
              <Clock3 className="h-7 w-7 animate-pulse" />
            </div>
            <h1
              className="sf-heading mt-5 text-3xl"
              style={{ color: "var(--sf-text)" }}
            >
              Fetching your order…
            </h1>
            <p
              className="mt-3 text-sm"
              style={{ color: "var(--sf-text-secondary)" }}
            >
              One moment while we check the kitchen.
            </p>
          </>
        ) : tracking.isError || !tracking.data ? (
          <>
            <h1
              className="sf-heading mt-2 text-3xl"
              style={{ color: "var(--sf-text)" }}
            >
              Couldn't load your order
            </h1>
            <p
              role="alert"
              className="mt-3 text-sm leading-relaxed"
              style={{ color: "var(--sf-text-secondary)" }}
            >
              Something went wrong while fetching your order. Please try
              again. If this keeps happening, contact{" "}
              {restaurantName ?? "the restaurant"} directly for support.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => tracking.refetch()}
                variant="outline"
                className="h-12 cursor-pointer touch-manipulation rounded-[var(--sf-radius-btn)] px-6 font-extrabold transition-colors duration-200 active:scale-95 [-webkit-tap-highlight-color:transparent]"
              >
                Try again
              </Button>
              {onMenu && (
                <Button
                  onClick={onMenu}
                  className="h-12 cursor-pointer touch-manipulation rounded-[var(--sf-radius-btn)] px-6 font-extrabold text-white transition-all duration-200 hover:brightness-110 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                  style={{ background: "var(--sf-primary)" }}
                >
                  Back to menu
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              className="mx-auto grid h-16 w-16 place-items-center rounded-full"
              style={{
                background: "var(--sf-green-soft)",
                color: "var(--sf-green)",
              }}
            >
              <Check className="h-7 w-7" />
            </div>
            <h1
              className="sf-heading mt-5 text-3xl"
              style={{ color: "var(--sf-text)" }}
            >
              {variant === "confirmation"
                ? "Thank you — order confirmed!"
                : "Your order"}
            </h1>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: "var(--sf-text-secondary)" }}
            >
              {variant === "confirmation"
                ? `The kitchen${restaurantName ? ` at ${restaurantName}` : ""} has your order and the burners are already warming up. Sit back — we'll take it from here.`
                : `Here's the latest from the kitchen${restaurantName ? ` at ${restaurantName}` : ""}.`}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs font-extrabold">
              <span
                className="min-w-0 truncate rounded-full px-3 py-1.5 tabular-nums text-white"
                style={{ background: "var(--sf-text)" }}
              >
                Order {tracking.data.orderNumber}
              </span>
              <span
                className="rounded-full px-3 py-1.5 uppercase tracking-wide"
                style={{
                  background: "var(--sf-primary-soft)",
                  color: "var(--sf-primary)",
                }}
              >
                {String(tracking.data.status).replace(/_/g, " ")}
              </span>
              {eta && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 tabular-nums"
                  style={{
                    background: "var(--sf-green-soft)",
                    color: "var(--sf-green)",
                  }}
                >
                  <Clock3 className="h-3.5 w-3.5" />
                  ETA {eta}
                </span>
              )}
            </div>
            <div
              className="mt-5 space-y-2 border-t border-dashed pt-4 text-left"
              style={{ borderColor: "var(--sf-border-subtle)" }}
            >
              {tracking.data.items.map(
                (item: {
                  id: string;
                  itemNameSnapshot: string;
                  quantity: number;
                  unitPricePaise: number;
                }) => (
                  <div
                    key={item.id}
                    className="flex min-w-0 items-center justify-between gap-3 text-sm"
                  >
                    <span
                      className="line-clamp-2 min-w-0 flex-1 text-left font-bold leading-snug"
                      style={{ color: "var(--sf-text)" }}
                    >
                      {item.quantity} × {item.itemNameSnapshot}
                    </span>
                    <span
                      className="shrink-0 font-bold tabular-nums"
                      style={{ color: "var(--sf-text-secondary)" }}
                    >
                      {formatINR(
                        (item.unitPricePaise / 100) * item.quantity
                      )}
                    </span>
                  </div>
                )
              )}
              <div
                className="flex min-w-0 items-center justify-between gap-3 border-t border-dashed pt-3 text-base font-extrabold tabular-nums"
                style={{
                  color: "var(--sf-text)",
                  borderColor: "var(--sf-border-subtle)",
                }}
              >
                <span>Paid total</span>
                <span>{formatINR(tracking.data.totalPaise / 100)}</span>
              </div>
              {(tracking.data.deliveryArea ||
                tracking.data.deliveryCity) && (
                <p
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: "var(--sf-text-secondary)" }}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Delivering to{" "}
                  {[tracking.data.deliveryArea, tracking.data.deliveryCity]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {tracking.data.delivery?.riderName && (
                <p
                  className="flex items-center gap-1.5 text-xs font-bold"
                  style={{ color: "var(--sf-green)" }}
                >
                  <Bike className="h-3.5 w-3.5" />
                  {tracking.data.delivery.riderName} is delivering your
                  order
                </p>
              )}
              {tracking.data.delivery?.trackingUrl && (
                <a
                  href={tracking.data.delivery.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex min-h-[44px] cursor-pointer touch-manipulation items-center gap-1.5 rounded-[var(--sf-radius-btn)] px-4 py-2.5 text-xs font-extrabold text-white transition-all duration-200 hover:brightness-110 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                  style={{ background: "var(--sf-text)" }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Live delivery tracking
                </a>
              )}
            </div>
            {tracking.data.history.length > 0 && (
              <ol
                className="mt-5 space-y-2 border-t border-dashed pt-4 text-left"
                style={{ borderColor: "var(--sf-border-subtle)" }}
              >
                {tracking.data.history.map(
                  (
                    entry: {
                      status: string;
                      note: string | null;
                      createdAt: Date | string;
                    },
                    index: number
                  ) => (
                    <li
                      key={`${entry.status}-${index}`}
                      className="flex items-start gap-2 text-xs"
                      style={{ color: "var(--sf-text-secondary)" }}
                    >
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        style={{ color: "var(--sf-green)" }}
                      />
                      <span>
                        <span
                          className="font-extrabold"
                          style={{ color: "var(--sf-text)" }}
                        >
                          {String(entry.status).replace(/_/g, " ")}
                        </span>
                        {/* The real time each milestone was reached. Without this
                            the timeline is a list of labels with no clock, and
                            because the ETA is deliberately hidden on terminal
                            orders a completed order would otherwise show no
                            timing information at all. */}
                        {(() => {
                          const when = formatMilestoneTime(entry.createdAt);
                          if (!when) return null;
                          return (
                            <>
                              {" · "}
                              <span aria-label={`at ${when}`}>{when}</span>
                            </>
                          );
                        })()}
                        {entry.note ? ` — ${entry.note}` : ""}
                      </span>
                    </li>
                  )
                )}
              </ol>
            )}
            {onMenu && (
              <Button
                onClick={onMenu}
                className="mt-6 h-12 cursor-pointer touch-manipulation rounded-[var(--sf-radius-btn)] px-6 font-extrabold text-white transition-all duration-200 hover:brightness-110 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                style={{ background: "var(--sf-primary)" }}
              >
                Back to menu
              </Button>
            )}
          </>
        )}
      </section>
    </main>
  );
}
