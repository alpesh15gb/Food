import { Plus } from "lucide-react";
import { formatINR, type MenuItem } from "@/lib/types";
import FoodDot from "./FoodDot";
import Quantity from "./Quantity";

export default function MenuCard({
  item,
  onAdd,
  cartQuantity = 0,
  onStep,
  stepHeadroom,
}: {
  item: MenuItem;
  onAdd: () => void;
  cartQuantity?: number;
  /**
   * Applies a RELATIVE change (-1 / +1) rather than an absolute quantity.
   * The card shows the sum across every cart line for this item, so writing an
   * absolute value back to one line made the displayed count and the real cart
   * diverge (and could silently exceed the per-order maximum).
   */
  onStep?: (delta: number) => void;
  /** Remaining headroom before the per-order ceiling; freezes "+" at 0. */
  stepHeadroom?: number;
}) {
  const unavailable = item.availability !== "AVAILABLE";
  const hasDiscount = item.originalPrice && item.originalPrice > item.price;

  return (
    <article
      className={`sf-card group flex items-center gap-4 p-4 transition-all duration-200 hover:border-[var(--sf-primary)] ${
        unavailable ? "opacity-50" : ""
      }`}
    >
      {/* Circular dish image */}
      <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="aspect-square h-full w-full rounded-full object-cover ring-1 ring-white/15 transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className="grid h-full w-full place-items-center rounded-full text-xl"
            style={{ background: "var(--sf-bg-subtle)" }}
          >
            🍽️
          </div>
        )}
        {unavailable && (
          <div className="absolute inset-0 grid place-items-center rounded-full bg-black/60 text-[9px] font-extrabold text-white">
            {item.availability === "SOLD_OUT" ? "Sold out" : "N/A"}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="line-clamp-2 min-w-0 flex-1 text-sm font-extrabold leading-snug sm:text-[15px]" style={{ color: "var(--sf-text)" }}>
            {item.name}
          </h3>
          <FoodDot kind={item.kind} />
        </div>
        <p className="mt-0.5 truncate text-[11px] font-semibold" style={{ color: "var(--sf-text-muted)" }}>
          {item.tag || item.category}
          {item.isBestseller && (
            <span style={{ color: "var(--sf-gold)" }}> • Bestseller</span>
          )}
        </p>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: "var(--sf-text-secondary)" }}>
            {item.description}
          </p>
        )}
      </div>

      {/* Price + add */}
      <div className="flex min-w-0 shrink-0 flex-col items-end gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-extrabold tabular-nums sm:text-base" style={{ color: "var(--sf-primary)" }}>
            {formatINR(item.price)}
          </span>
          {hasDiscount && (
            <span className="text-[11px] tabular-nums line-through" style={{ color: "var(--sf-text-muted)" }}>
              {formatINR(item.originalPrice!)}
            </span>
          )}
        </div>
        {cartQuantity > 0 && onStep ? (
          <Quantity
            compact
            value={cartQuantity}
            // Quantity reports an absolute target; the card works in deltas, so
            // translate. A drop to 0 (the trash affordance) is a decrement too:
            // changeItemQty removes the line only once it is already at 1.
            onChange={(next) => onStep(next > cartQuantity ? 1 : -1)}
            canIncrease={!unavailable}
            max={(stepHeadroom ?? 0) + cartQuantity}
            removeLabel={`Remove ${item.name}`}
          />
        ) : (
          <button
            disabled={unavailable}
            onClick={onAdd}
            className="grid h-9 min-h-[44px] w-9 min-w-[44px] cursor-pointer touch-manipulation place-items-center rounded-full text-white outline-none transition-all duration-200 hover:brightness-110 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-offset-2 [-webkit-tap-highlight-color:transparent]"
            style={{ background: "var(--sf-primary)" }}
            aria-label={unavailable ? `${item.name} is unavailable` : `Add ${item.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}
