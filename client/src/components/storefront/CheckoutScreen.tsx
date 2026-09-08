import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/types";
import type { CartLine } from "./types";
import Quantity from "./Quantity";

export default function CheckoutScreen({
  screen,
  cart,
  total,
  itemTotal,
  packaging,
  delivery,
  taxes,
  onMenu,
  onQuantity,
  onCheckout,
  processing,
  restaurant,
}: {
  screen: string;
  cart: CartLine[];
  total: number;
  itemTotal: number;
  packaging: number;
  delivery: number;
  taxes: number;
  onMenu: () => void;
  onQuantity: (id: string, qty: number) => void;
  onCheckout: () => void;
  processing: boolean;
  restaurant: any;
}) {
  if (screen === "confirmation") {
    return (
      <main className="grid min-h-screen place-items-center px-4" style={{ background: "var(--sf-bg)" }}>
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
            className="mt-6 h-12 rounded-[var(--sf-radius-btn)] px-6 font-extrabold text-white"
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
    <main className="min-h-screen" style={{ background: "var(--sf-bg)" }}>
      {/* Glass header */}
      <header className="sf-header-blur border-b" style={{ borderColor: "var(--sf-border)" }}>
        <div className="relative mx-auto flex min-h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <button
            onClick={onMenu}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border hover:bg-white/10"
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
              {cart.length} item{cart.length !== 1 ? "s" : ""} from your order
            </p>
            <button
              onClick={onMenu}
              className="text-xs font-extrabold"
              style={{ color: "var(--sf-primary)" }}
            >
              + Add more items
            </button>
          </div>
          <div className="space-y-5">
            {cart.map((line) => (
              <div
                key={line.id}
                className="flex gap-3 border-b border-dashed pb-5 last:border-0 last:pb-0"
                style={{ borderColor: "var(--sf-border-subtle)" }}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-extrabold"
                    style={{ color: "var(--sf-text)" }}
                  >
                    {line.item.name}
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--sf-text-muted)" }}
                  >
                    {line.modifiers?.join(" \u00B7 ") || "No customizations"}
                  </p>
                  {line.note && (
                    <p
                      className="mt-1 text-xs italic"
                      style={{ color: "var(--sf-text-muted)" }}
                    >
                      "{line.note}"
                    </p>
                  )}
                  <button
                    onClick={() => onQuantity(line.id, 0)}
                    className="mt-2 text-xs font-bold hover:underline"
                    style={{ color: "var(--sf-text-secondary)" }}
                  >
                    Remove
                  </button>
                </div>
                <div className="text-right">
                  <p className="mb-2 text-sm font-extrabold" style={{ color: "var(--sf-text)" }}>
                    {formatINR(line.unitPrice * line.quantity)}
                  </p>
                  <Quantity
                    compact
                    value={line.quantity}
                    onChange={(next) => onQuantity(line.id, next)}
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
              <BillRow label="Packaging" value={formatINR(packaging)} />
              <BillRow label="Delivery" value={formatINR(delivery)} />
              <BillRow label="Taxes" value={formatINR(taxes)} />
              <div
                className="flex justify-between border-t pt-3 text-base font-extrabold"
                style={{
                  color: "var(--sf-text)",
                  borderColor: "var(--sf-border-subtle)",
                }}
              >
                <span>To pay</span>
                <span>{formatINR(total)}</span>
              </div>
            </div>
          </div>

          {/* Min order warning */}
          {restaurant?.minOrder > 0 && total < restaurant.minOrder && (
            <p
              className="text-xs font-bold"
              style={{ color: "var(--sf-red)" }}
            >
              Add {formatINR(restaurant.minOrder - total)} more for minimum order
            </p>
          )}

          <Button
            onClick={onCheckout}
            disabled={
              processing ||
              (restaurant?.minOrder > 0 && total < restaurant.minOrder)
            }
            className="h-12 w-full rounded-[var(--sf-radius-btn)] text-sm font-extrabold text-white"
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
      className="flex justify-between text-xs"
      style={{ color: "var(--sf-text-secondary)" }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
