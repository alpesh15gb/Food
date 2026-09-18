import { ArrowRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/types";
import type { CartLine } from "./types";
import Quantity from "./Quantity";
import PhoneField from "./PhoneField";

export default function CartSidebar({
  cart,
  total,
  itemTotal,
  packaging,
  delivery,
  taxes,
  onQuantity,
  onCheckout,
  processing,
  restaurant,
  customerPhone,
  onCustomerPhone,
}: {
  cart: CartLine[];
  total: number;
  itemTotal: number;
  packaging: number;
  delivery: number;
  taxes: number;
  onQuantity: (id: string, qty: number) => void;
  onCheckout: () => void;
  processing: boolean;
  restaurant: any;
  customerPhone: string;
  onCustomerPhone: (v: string) => void;
}) {
  return (
    <div
      className="sticky top-20 overflow-hidden"
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
        <div className="flex items-center justify-between">
          <div>
            <p
              className="text-[11px] font-extrabold uppercase tracking-[0.15em]"
              style={{ color: "var(--sf-text-muted)" }}
            >
              Your order
            </p>
            <h2
              className="sf-heading mt-1 text-lg"
              style={{ color: "var(--sf-text)" }}
            >
              {cart.length ? `${cart.length} items` : "Your cart is empty"}
            </h2>
          </div>
          <ShoppingBag className="h-5 w-5" style={{ color: "var(--sf-primary)" }} />
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
              {cart.map((line) => (
                <div key={line.id} className="flex min-w-0 gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p
                      className="line-clamp-2 text-sm font-bold leading-snug"
                      style={{ color: "var(--sf-text)" }}
                    >
                      {line.item.name}
                    </p>
                    <p
                      className="mt-0.5 line-clamp-2 text-[11px] leading-snug"
                      style={{ color: "var(--sf-text-muted)" }}
                    >
                      {line.modifiers?.join(" \u00B7 ") || "As listed"}
                    </p>
                    <p className="mt-1 text-xs font-bold tabular-nums" style={{ color: "var(--sf-text)" }}>
                      {formatINR(line.unitPrice * line.quantity)}
                    </p>
                  </div>
                  <Quantity
                    compact
                    value={line.quantity}
                    onChange={(next) => onQuantity(line.id, next)}
                  />
                </div>
              ))}
            </div>

            {/* Bill details */}
            <div
              className="space-y-2 border-t pt-4"
              style={{ borderColor: "var(--sf-border-subtle)" }}
            >
              <BillRow label="Item total" value={formatINR(itemTotal)} />
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
                <span>{formatINR(total)}</span>
              </div>
            </div>

            {/* Min order warning — server enforces itemTotal >= minOrder */}
            {restaurant?.minOrder > 0 && itemTotal < restaurant.minOrder && (
              <p
                className="text-xs font-bold"
                style={{ color: "var(--sf-red)" }}
              >
                Add {formatINR(restaurant.minOrder - itemTotal)} more for minimum
                order
              </p>
            )}

            {/* Contact number — same requirement as the checkout page */}
            <PhoneField compact value={customerPhone} onChange={onCustomerPhone} />

            {/* Checkout button */}
            <Button
              onClick={onCheckout}
              disabled={
                processing ||
                cart.length === 0 ||
                (restaurant?.minOrder > 0 && itemTotal < restaurant.minOrder)
              }
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
