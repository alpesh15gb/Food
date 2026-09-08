import { Plus } from "lucide-react";
import { formatINR, type MenuItem } from "@/lib/types";
import FoodDot from "./FoodDot";
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
      className={`sf-card group flex items-center gap-4 p-4 transition-all hover:border-[var(--sf-primary)] ${
        unavailable ? "opacity-50" : ""
      }`}
    >
      {/* Circular dish image */}
      <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="h-full w-full rounded-full object-cover ring-1 ring-white/15 transition-transform duration-300 group-hover:scale-105"
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
          <h3 className="truncate text-sm font-extrabold sm:text-[15px]" style={{ color: "var(--sf-text)" }}>
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
          <p className="mt-1 line-clamp-1 text-xs leading-relaxed" style={{ color: "var(--sf-text-secondary)" }}>
            {item.description}
          </p>
        )}
      </div>

      {/* Price + add */}
      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-extrabold sm:text-base" style={{ color: "var(--sf-primary)" }}>
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
            className="grid h-9 w-9 place-items-center rounded-full text-white transition-transform active:scale-90 disabled:opacity-40"
            style={{ background: "var(--sf-primary)" }}
            aria-label={`Add ${item.name}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  );
}
