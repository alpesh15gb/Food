import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/types";
import type { CartLine } from "./types";
import Quantity from "./Quantity";
import PhoneField from "./PhoneField";

export default function CheckoutScreen({
  screen,
  cart,
  totalQuantity,
  total,
  itemTotal,
  packaging,
  delivery,
  taxes,
  onMenu,
  onQuantity,
  canIncreaseLine,
  onCheckout,
  processing,
  customerPhone,
  onCustomerPhone,
  orderingClosed,
  orderingReason,
  couponCode,
  onCouponCodeChange,
  couponError,
  couponApplied,
  couponDiscount,
  pricingPending,
  amountToMinOrder,
}: {
  screen: string;
  cart: CartLine[];
  /** Sum of line quantities — `cart.length` is the number of distinct lines. */
  totalQuantity: number;
  total: number;
  itemTotal: number;
  packaging: number;
  delivery: number;
  taxes: number;
  onMenu: () => void;
  onQuantity: (id: string, qty: number) => void;
  /** Whether a line's "+" is interactive (sold-out dishes are frozen). */
  canIncreaseLine?: (line: CartLine) => boolean;
  onCheckout: () => void;
  processing: boolean;
  customerPhone: string;
  onCustomerPhone: (v: string) => void;
  orderingClosed?: boolean;
  orderingReason?: string | null;
  couponCode?: string;
  onCouponCodeChange?: (value: string) => void;
  couponError?: string | undefined;
  couponApplied?: boolean;
  couponDiscount?: number;
  pricingPending?: boolean;
  /** Server-computed minimum-order gap, in rupees. */
  amountToMinOrder?: number;
}) {
  if (screen === "confirmation") {
    return (
      <main className="grid min-h-dvh place-items-center px-4" style={{ background: "var(--sf-bg)" }}>
        <section className="sf-card w-full max-w-lg p-8 text-center">
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
            Order confirmed!
          </h1>
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: "var(--sf-text-secondary)" }}
          >
            Your order has been placed. The kitchen is preparing your food.
          </p>
          <Button
            onClick={onMenu}
            className="mt-6 h-12 cursor-pointer touch-manipulation rounded-[var(--sf-radius-btn)] px-6 font-extrabold text-white transition-all duration-200 hover:brightness-110 active:scale-95 [-webkit-tap-highlight-color:transparent]"
            style={{ background: "var(--sf-primary)" }}
          >
            Back to menu
          </Button>
        </section>
      </main>
    );
  }

  // Cart / checkout screen
  return (
    <main className="min-h-dvh" style={{ background: "var(--sf-bg)" }}>
      {/* Glass header */}
      <header className="sf-header-blur border-b" style={{ borderColor: "var(--sf-border)" }}>
        <div className="relative mx-auto flex min-h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <button
            onClick={onMenu}
            className="grid h-10 min-h-[44px] w-10 min-w-[44px] shrink-0 cursor-pointer touch-manipulation place-items-center rounded-full border transition-colors duration-200 hover:bg-white/10 active:scale-95 [-webkit-tap-highlight-color:transparent]"
            style={{
              borderColor: "var(--sf-border)",
              color: "var(--sf-text-secondary)",
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p
              className="text-[10px] font-extrabold uppercase tracking-[0.16em]"
              style={{ color: "var(--sf-text-muted)" }}
            >
              Your order
            </p>
            <h1
              className="sf-heading mt-0.5 text-2xl"
              style={{ color: "var(--sf-text)" }}
            >
              Review & checkout
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 md:grid-cols-[1fr_360px]">
        {/* Items list */}
        <section className="sf-card p-5">
          <div className="mb-5 flex items-center justify-between">
            <p
              className="text-sm font-bold"
              style={{ color: "var(--sf-text)" }}
            >
              {totalQuantity} item{totalQuantity !== 1 ? "s" : ""} from your
              order
            </p>
            <button
              onClick={onMenu}
              className="shrink-0 cursor-pointer touch-manipulation text-xs font-extrabold transition-opacity duration-200 hover:underline [-webkit-tap-highlight-color:transparent]"
              style={{ color: "var(--sf-primary)" }}
            >
              + Add more items
            </button>
          </div>
          <div className="space-y-5">
            {cart.map((line) => (
              <div
                key={line.id}
                className="flex min-w-0 gap-3 border-b border-dashed pb-5 last:border-0 last:pb-0"
                style={{ borderColor: "var(--sf-border-subtle)" }}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="line-clamp-2 text-sm font-extrabold leading-snug"
                    style={{ color: "var(--sf-text)" }}
                  >
                    {line.item.name}
                  </p>
                  <p
                    className="mt-1 line-clamp-2 text-xs leading-snug"
                    style={{ color: "var(--sf-text-muted)" }}
                  >
                    {line.modifiers?.join(" \u00B7 ") || "No customizations"}
                  </p>
                  {line.note && (
                    <p
                      className="mt-1 line-clamp-2 text-xs italic"
                      style={{ color: "var(--sf-text-muted)" }}
                    >
                      "{line.note}"
                    </p>
                  )}
                  <button
                    onClick={() => onQuantity(line.id, 0)}
                    className="mt-2 min-h-[44px] cursor-pointer touch-manipulation px-1 py-2 text-xs font-bold transition-opacity duration-200 hover:underline [-webkit-tap-highlight-color:transparent]"
                    style={{ color: "var(--sf-text-secondary)" }}
                  >
                    Remove
                  </button>
                </div>
                <div className="min-w-0 shrink-0 text-right">
                  <p className="mb-2 text-sm font-extrabold tabular-nums" style={{ color: "var(--sf-text)" }}>
                    {formatINR(line.unitPrice * line.quantity)}
                  </p>
                  <Quantity
                    compact
                    value={line.quantity}
                    onChange={(next) => onQuantity(line.id, next)}
                    canIncrease={canIncreaseLine?.(line) ?? true}
                    removeLabel={`Remove ${line.item.name}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bill summary sidebar */}
        <aside className="space-y-4">
          <div className="sf-card overflow-hidden">
            <div
              className="border-b p-5"
              style={{ borderColor: "var(--sf-border-subtle)" }}
            >
              <div className="flex items-center justify-between">
                <h2
                  className="sf-heading text-lg"
                  style={{ color: "var(--sf-text)" }}
                >
                  Bill summary
                </h2>
              </div>
            </div>
            <div className="space-y-3 p-5">
              <BillRow label="Item total" value={formatINR(itemTotal)} />
              {/* A coupon typed in the cart slide-over is still redeemed here, so
                  the discount has to be itemised — otherwise "To pay" is
                  silently lower than item + packaging + delivery + taxes and the
                  customer has no way to see why. */}
              {couponDiscount ? (
                <BillRow
                  label={`Coupon${couponCode?.trim() ? ` (${couponCode.trim().toUpperCase()})` : ""}`}
                  value={`\u2212 ${formatINR(couponDiscount)}`}
                />
              ) : null}
              <BillRow label="Packaging" value={formatINR(packaging)} />
              <BillRow label="Delivery" value={formatINR(delivery)} />
              <BillRow label="Taxes" value={formatINR(taxes)} />
              <div
                className="flex justify-between border-t pt-3 text-base font-extrabold tabular-nums"
                style={{
                  color: "var(--sf-text)",
                  borderColor: "var(--sf-border-subtle)",
                }}
              >
                <span>To pay</span>
                <span
                  className={pricingPending ? "opacity-60" : undefined}
                  aria-busy={pricingPending || undefined}
                >
                  {formatINR(total)}
                </span>
              </div>
              {pricingPending && (
                <p
                  className="text-right text-[11px] font-semibold"
                  style={{ color: "var(--sf-text-muted)" }}
                  role="status"
                >
                  Updating total…
                </p>
              )}
            </div>
          </div>

          {/* Coupon — same field as the cart slide-over, validated by the server. */}
          {onCouponCodeChange && cart.length > 0 && (
            <div className="sf-card p-5">
              <label
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color: "var(--sf-text-secondary)" }}
                htmlFor="checkout-coupon"
              >
                Coupon
              </label>
              <input
                id="checkout-coupon"
                value={couponCode ?? ""}
                onChange={(e) => onCouponCodeChange(e.target.value.toUpperCase())}
                onBlur={() => onCouponCodeChange(couponCode ?? "")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCouponCodeChange(couponCode ?? "");
                }}
                placeholder="Enter code"
                maxLength={48}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={!pricingPending && !!couponError}
                aria-describedby="checkout-coupon-status"
                className="mt-2 h-12 w-full rounded-[var(--sf-radius-btn)] border px-4 text-sm font-semibold outline-none focus:ring-2"
                style={{
                  background: "var(--sf-surface)",
                  borderColor:
                    !pricingPending && couponError
                      ? "var(--sf-red)"
                      : "var(--sf-border)",
                  color: "var(--sf-text)",
                }}
              />
              <p id="checkout-coupon-status" className="mt-1.5 min-h-[1rem]" role="status">
                {!pricingPending && couponApplied ? (
                  <span className="text-xs font-bold" style={{ color: "var(--sf-green)" }}>
                    Coupon applied — you saved {formatINR(couponDiscount ?? 0)}.
                  </span>
                ) : !pricingPending && couponError ? (
                  <span className="text-xs font-bold" style={{ color: "var(--sf-red)" }}>
                    {couponError}
                  </span>
                ) : null}
              </p>
            </div>
          )}

          {/* Contact number — required for order updates + dispatch */}
          <PhoneField value={customerPhone} onChange={onCustomerPhone} />

          {/* Min order warning — server enforces itemTotal >= minOrder, so the
              gap must be measured against the item total, never the grand total. */}
          {typeof amountToMinOrder === "number" && amountToMinOrder > 0 && (
            <p
              className="text-xs font-bold"
              style={{ color: "var(--sf-red)" }}
            >
              Add {formatINR(amountToMinOrder)} more for minimum order
            </p>
          )}

          {orderingClosed && (
            <p
              className="text-xs font-bold leading-relaxed"
              style={{ color: "var(--sf-red)" }}
            >
              {orderingReason ?? "This kitchen is not taking orders right now."}
            </p>
          )}

          <Button
            onClick={onCheckout}
            disabled={
              processing ||
              orderingClosed ||
              cart.length === 0 ||
              (typeof amountToMinOrder === "number" && amountToMinOrder > 0)
            }
            className="h-12 w-full cursor-pointer touch-manipulation rounded-[var(--sf-radius-btn)] text-sm font-extrabold text-white transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed [-webkit-tap-highlight-color:transparent]"
            style={{ background: "var(--sf-primary)" }}
          >
            {processing ? "Processing..." : "Checkout"}
            {!processing && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </aside>
      </div>
    </main>
  );
}

function BillRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex min-w-0 justify-between gap-3 text-xs tabular-nums"
      style={{ color: "var(--sf-text-secondary)" }}
    >
      <span className="min-w-0">{label}</span>
      <span className="shrink-0">{value}</span>
    </div>
  );
}
