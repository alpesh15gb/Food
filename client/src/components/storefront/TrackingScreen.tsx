/**
 * Customer order tracking — live status timeline for confirmation + tracking routes.
 * Polls every 20s while the order is active (preparing → rider → delivered),
 * stops on terminal states. Rider name + provider live-tracking link surface
 * automatically once Shadowfax webhooks/dispatch populate them.
 */
import { Bike, Check, Clock3, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/types";
import { trpc } from "@/lib/trpc";

const TERMINAL_STATUSES = ["DELIVERED", "CANCELLED", "REJECTED", "REFUNDED"];

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
  const tracking = trpc.storefront.orderTracking.useQuery(
    { orderNumber, trackingToken },
    {
      enabled: hasCredentials,
      // Live "partner on the way" feel without hammering the server; stop
      // polling once the order reaches a terminal state.
      refetchInterval: (query) => {
        const status = String(
          (query.state.data as { status?: string } | undefined)?.status ?? ""
        );
        return TERMINAL_STATUSES.includes(status) ? false : 20000;
      },
    }
  );

  const formatEtaTime = (value: unknown): string | null => {
    if (typeof value !== "string" && !(value instanceof Date)) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  };

  const eta = tracking.data?.estimatedMinutes
    ? `~${tracking.data.estimatedMinutes} min`
    : formatEtaTime(tracking.data?.delivery?.estimatedDelivery);

  return (
    <main
      className="grid min-h-screen place-items-center px-4 py-10"
      style={{ background: "var(--sf-bg)" }}
    >
      <section
        aria-live="polite"
        className="sf-card w-full max-w-lg p-8 text-center"
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
                className="mt-6 h-12 rounded-[var(--sf-radius-btn)] px-6 font-extrabold text-white"
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
            <div className="mt-6 flex justify-center gap-2">
              <Button
                onClick={() => tracking.refetch()}
                variant="outline"
                className="h-12 rounded-[var(--sf-radius-btn)] px-6 font-extrabold"
              >
                Try again
              </Button>
              {onMenu && (
                <Button
                  onClick={onMenu}
                  className="h-12 rounded-[var(--sf-radius-btn)] px-6 font-extrabold text-white"
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
                className="rounded-full px-3 py-1.5 text-white"
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
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5"
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
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span
                      className="font-bold"
                      style={{ color: "var(--sf-text)" }}
                    >
                      {item.quantity} × {item.itemNameSnapshot}
                    </span>
                    <span
                      className="font-bold"
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
                className="flex items-center justify-between gap-3 border-t border-dashed pt-3 text-base font-extrabold"
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
                  className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--sf-radius-btn)] px-4 py-2.5 text-xs font-extrabold text-white"
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
                className="mt-6 h-12 rounded-[var(--sf-radius-btn)] px-6 font-extrabold text-white"
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
