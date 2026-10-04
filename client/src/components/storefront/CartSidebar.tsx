import { ArrowRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/types";
import type { CartLine } from "./types";
import Quantity from "./Quantity";
import PhoneField from "./PhoneField";

export default function CartSidebar({
  cart,
  totalQuantity,
  total,
  itemTotal,
  packaging,
  delivery,
  taxes,
  onQuantity,
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
  soldOutLineIds,
}: {
  cart: CartLine[];
  /** Sum of line quantities — `cart.length` is the number of distinct lines. */
  totalQuantity: number;
  total: number;
  itemTotal: number;
  packaging: number;
  delivery: number;
  taxes: number;
  onQuantity: (id: string, qty: number) => void;
  onCheckout: () => void;
  processing: boolean;
  customerPhone: string;
  onCustomerPhone: (v: string) => void;
  orderingClosed?: boolean;
  orderingReason?: string | null;
  /** Coupon field value + change handler (owned by OrderingApp). */
  couponCode?: string;
  onCouponCodeChange?: (value: string) => void;
  /** Server's verdict on the entered coupon, once the quote has answered. */
  couponError?: string | undefined;
  couponApplied?: boolean;
  couponDiscount?: number;
  /** True while the server is repricing the cart. */
  pricingPending?: boolean;
  /** Server-computed minimum-order gap, in rupees. */
  amountToMinOrder?: number;
  /** Lines whose dish sold out after it was added — "+" is frozen on these. */
  soldOutLineIds?: ReadonlySet<string>;
}) {
  // The server gates the minimum order on the ITEM total (see
  // `storefront.quote` → `belowMinimum`, which compares `itemTotalPaise`).
  // Comparing the grand total instead let the CTA enable itself while the
  // "add ₹X more" warning was still on screen, because packaging + delivery +
  // tax can push `total` past the threshold that `itemTotal` has not reached.
  const belowMinimum =
    typeof amountToMinOrder === "number" && amountToMinOrder > 0;

  return (
    <div
      // No `sticky` here: the slide-over panel is now the scroll container, so a
      // sticky child would detach from the top of the drawer and float 80px down.
      className="overflow-hidden"
      style={{
        background: "var(--sf-surface)",
        borderRadius: "var(--sf-radius-card)",
        boxShadow: "var(--sf-shadow-card)",
      }}
    >
      {/* Header */}
      <div
        className="border-b p-4"
        style={{ borderColor: "var(--sf-border-subtle)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-[11px] font-extrabold uppercase tracking-[0.15em]"
              style={{ color: "var(--sf-text-muted)" }}
            >
              Your order
            </p>
            <h2 className="sf-heading mt-1 text-lg" style={{ color: "var(--sf-text)" }}>
              {totalQuantity
                ? `${totalQuantity} item${totalQuantity === 1 ? "" : "s"}`
                : "Your cart is empty"}
            </h2>
          </div>
          <ShoppingBag
            className="h-5 w-5 shrink-0"
            style={{ color: "var(--sf-primary)" }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4 p-4">
        {cart.length ? (
          <>
            {/* Line items */}
            <div
              className="divide-y"
              style={{ borderColor: "var(--sf-border-subtle)" }}
            >
              {cart.map((line) => {
                const soldOut = soldOutLineIds?.has(line.id) ?? false;
                return (
                  <div
                    key={line.id}
                    className="flex min-w-0 items-start gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="line-clamp-2 text-sm font-bold leading-snug"
                        style={{ color: "var(--sf-text)" }}
                      >
                        {line.item.name}
                        {soldOut && (
                          <span
                            className="ml-1.5 text-[10px] font-extrabold uppercase"
                            style={{ color: "var(--sf-red)" }}
                          >
                            Sold out
                          </span>
                        )}
                      </p>
                      <p
                        className="mt-0.5 line-clamp-2 text-[11px] leading-snug"
                        style={{ color: "var(--sf-text-muted)" }}
                      >
                        {line.modifiers?.join(" \u00B7 ") || "As listed"}
                      </p>
                      {line.note && (
                        <p
                          className="mt-0.5 line-clamp-2 text-[11px] italic leading-snug"
                          style={{ color: "var(--sf-text-muted)" }}
                        >
                          "{line.note}"
                        </p>
                      )}
                      <p
                        className="mt-1 text-xs font-bold tabular-nums"
                        style={{ color: "var(--sf-text)" }}
                      >
                        {formatINR(line.unitPrice * line.quantity)}
                      </p>
                    </div>
                    <Quantity
                      compact
                      value={line.quantity}
                      onChange={(next) => onQuantity(line.id, next)}
                      canIncrease={!soldOut}
                      removeLabel={`Remove ${line.item.name}`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Bill details */}
            <div
              className="space-y-2 border-t pt-4"
              style={{ borderColor: "var(--sf-border-subtle)" }}
            >
              <BillRow label="Item total" value={formatINR(itemTotal)} />
              {couponDiscount ? (
                <BillRow
                  label={`Coupon${couponCode ? ` (${couponCode.trim().toUpperCase()})` : ""}`}
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
                {/* Dimmed while the server reprices: `useCartQuote` keeps the
                    previous total on screen, so without this the customer is
                    shown a stale number with no sign anything is happening. */}
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

            {/* Coupon — validated and priced by the server, never by the browser. */}
            {onCouponCodeChange && (
              <CouponField
                couponCode={couponCode ?? ""}
                onCouponCodeChange={onCouponCodeChange}
                couponError={couponError}
                couponApplied={couponApplied}
                couponDiscount={couponDiscount}
                pricingPending={pricingPending}
              />
            )}

            {/* Min order warning — mirrors the server's own belowMinimum verdict. */}
            {belowMinimum && (
              <p className="text-xs font-bold" style={{ color: "var(--sf-red)" }}>
                Add {formatINR(amountToMinOrder)} more for minimum order
              </p>
            )}

            {/* Contact number — same requirement as the checkout page */}
            <PhoneField compact value={customerPhone} onChange={onCustomerPhone} />

            {orderingClosed && (
              <p
                className="text-xs font-bold leading-relaxed"
                style={{ color: "var(--sf-red)" }}
              >
                {orderingReason ?? "This kitchen is not taking orders right now."}
              </p>
            )}

            {/* Checkout button */}
            <Button
              onClick={onCheckout}
              disabled={processing || orderingClosed || belowMinimum}
              className="h-12 w-full cursor-pointer touch-manipulation rounded-[var(--sf-radius-btn)] text-sm font-extrabold text-white transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed [-webkit-tap-highlight-color:transparent]"
              style={{ background: "var(--sf-primary)" }}
            >
              {processing ? "Processing..." : "Checkout"}
              {!processing && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </>
        ) : (
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--sf-text-muted)" }}
          >
            Browse the menu to add items
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Coupon input.
 *
 * Validation is the server's job, but the *timing* of the request is ours:
 * validating on every keystroke sent "SAVE20" as four separate quotes and
 * flashed "Coupon \"S\" is not valid" under the field while the customer was
 * still typing. Commits are debounced, and committed on Enter or blur.
 */
function CouponField({
  couponCode,
  onCouponCodeChange,
  couponError,
  couponApplied,
  couponDiscount,
  pricingPending,
}: {
  couponCode: string;
  onCouponCodeChange: (value: string) => void;
  couponError?: string;
  couponApplied?: boolean;
  couponDiscount?: number;
  pricingPending?: boolean;
}) {
  // Only report the server's verdict once the field has settled, otherwise the
  // message describes a half-typed code rather than what the customer entered.
  const settled = !pricingPending;

  return (
    <div className="space-y-1.5 border-t pt-3">
      <label
        className="text-xs font-bold uppercase tracking-wide"
        style={{ color: "var(--sf-text-secondary)" }}
        htmlFor="cart-coupon"
      >
        Coupon
      </label>
      <input
        id="cart-coupon"
        value={couponCode}
        onChange={(e) => onCouponCodeChange(e.target.value.toUpperCase())}
        onBlur={() => onCouponCodeChange(couponCode)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCouponCodeChange(couponCode);
        }}
        placeholder="Enter code"
        maxLength={48}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-invalid={settled && !!couponError}
        aria-describedby="cart-coupon-status"
        className="w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none focus:ring-2"
        style={{
          background: "var(--sf-bg-subtle)",
          borderColor: settled && couponError ? "var(--sf-red)" : "var(--sf-border)",
          color: "var(--sf-text)",
        }}
      />
      <p id="cart-coupon-status" className="min-h-[1rem]" role="status">
        {settled && couponApplied ? (
          <span className="text-xs font-bold" style={{ color: "var(--sf-green)" }}>
            Coupon applied — you saved {formatINR(couponDiscount ?? 0)}.
          </span>
        ) : settled && couponError ? (
          <span className="text-xs font-bold" style={{ color: "var(--sf-red)" }}>
            {couponError}
          </span>
        ) : null}
      </p>
    </div>
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
