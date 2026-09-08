import { Plus } from "lucide-react";
import { formatINR, type MenuItem } from "@/lib/types";
import Quantity from "./Quantity";

export default function MenuCard({
  item,
  onAdd,
  cartQuantity = 0,
  onQuantityChange,
}: {
  item: MenuItem;
  onAdd: () => void;
  cartQuantity?: number;
  onQuantityChange?: (next: number) => void;
}) {
  const unavailable = item.availability !== "AVAILABLE";
  const hasDiscount = item.originalPrice && item.originalPrice > item.price;

  return (
    <article
      className={`sf-card group flex flex-col overflow-hidden transition-all hover:shadow-[var(--sf-shadow-elevated)] ${
        unavailable ? "opacity-50" : ""
      }`}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className="grid h-full w-full place-items-center"
            style={{ background: "var(--sf-bg-subtle)" }}
          >
            <span className="text-3xl opacity-30">🍽️</span>
          </div>
        )}
        {unavailable && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-xs font-extrabold text-white">
            {item.availability === "SOLD_OUT" ? "Sold out" : "Unavailable"}
          </div>
        )}
        {item.isBestseller && (
          <span
            className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
            style={{ background: "var(--sf-gold-soft)", color: "var(--sf-gold)" }}
          >
            Bestseller
          </span>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col p-4">
        <h3
          className="sf-heading line-clamp-1 text-[15px] sm:text-base"
          style={{ color: "var(--sf-text)" }}
        >
          {item.name}
        </h3>

        {item.description && (
          <p
            className="mt-1 line-clamp-2 text-xs leading-relaxed"
            style={{ color: "var(--sf-text-muted)" }}
          >
            {item.description}
          </p>
        )}

        {/* Price + Add row */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-extrabold sm:text-base" style={{ color: "var(--sf-text)" }}>
              {formatINR(item.price)}
            </span>
            {hasDiscount && (
              <span className="text-[11px] line-through" style={{ color: "var(--sf-text-muted)" }}>
                {formatINR(item.originalPrice!)}
              </span>
            )}
          </div>

          {cartQuantity > 0 && onQuantityChange ? (
            <Quantity compact value={cartQuantity} onChange={onQuantityChange} />
          ) : (
            <button
              disabled={unavailable}
              onClick={onAdd}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white transition-transform active:scale-90 disabled:opacity-40"
              style={{ background: "var(--sf-primary)" }}
              aria-label={`Add ${item.name}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
