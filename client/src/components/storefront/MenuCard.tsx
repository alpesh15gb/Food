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
  const discountPercent =
    hasDiscount && item.originalPrice
      ? Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)
      : 0;

  return (
    <article
      className={`sf-card sf-slide-up flex gap-4 p-4 transition-shadow hover:shadow-[var(--sf-shadow-elevated)] ${
        unavailable ? "opacity-60" : ""
      }`}
    >
      {/* Left column: details */}
      <div className="min-w-0 flex-1">
        {/* Badges row */}
        <div className="flex items-center gap-2">
          <FoodDot kind={item.kind} />
          {item.isBestseller && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
              style={{
                background: "var(--sf-gold-soft)",
                color: "var(--sf-gold)",
              }}
            >
              Bestseller
            </span>
          )}
          {item.tag && item.tag !== "Bestseller" && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
              style={{
                background: "var(--sf-green-soft)",
                color: "var(--sf-green)",
              }}
            >
              {item.tag}
            </span>
          )}
          {item.spiceLevel != null && item.spiceLevel > 0 && (
            <span className="text-xs" title={`Spice level: ${item.spiceLevel}/5`}>
              {"🌶️".repeat(Math.min(item.spiceLevel, 5))}
            </span>
          )}
        </div>

        {/* Name */}
        <h3
          className="sf-heading mt-2 text-[15px] leading-snug"
          style={{ color: "var(--sf-text)" }}
        >
          {item.name}
        </h3>

        {/* Description */}
        {item.description && (
          <p
            className="mt-1.5 line-clamp-2 max-w-md text-xs leading-relaxed"
            style={{ color: "var(--sf-text-secondary)" }}
          >
            {item.description}
          </p>
        )}

        {/* Price row */}
        <div className="mt-3 flex items-baseline gap-2">
          <p className="text-sm font-extrabold" style={{ color: "var(--sf-text)" }}>
            {formatINR(item.price)}
          </p>
          {hasDiscount && (
            <>
              <p className="text-xs text-[var(--sf-text-muted)] line-through">
                {formatINR(item.originalPrice!)}
              </p>
              <p
                className="text-xs font-bold"
                style={{ color: "var(--sf-green)" }}
              >
                {discountPercent}% OFF
              </p>
            </>
          )}
        </div>

        {/* Unavailable note */}
        {unavailable && (
          <p
            className="mt-2 inline-flex rounded-[var(--sf-radius-btn)] px-2 py-1 text-[11px] font-bold"
            style={{
              background: "var(--sf-bg-subtle)",
              color: "var(--sf-red)",
            }}
          >
            {item.availableNote || "Unavailable"}
          </p>
        )}

        {/* ADD button or Quantity stepper */}
        <div className="mt-3">
          {cartQuantity > 0 && onQuantityChange ? (
            <Quantity compact value={cartQuantity} onChange={onQuantityChange} />
          ) : (
            <button
              disabled={unavailable}
              onClick={onAdd}
              className="sf-add-btn disabled:cursor-not-allowed disabled:opacity-40"
            >
              {unavailable
                ? "Unavailable"
                : item.customizable
                ? "CUSTOMISE"
                : "ADD +"}
            </button>
          )}
        </div>

        {/* Customizable hint */}
        {item.customizable && !unavailable && (
          <p
            className="mt-2 border-t border-dashed pt-2 text-[11px] font-semibold"
            style={{
              borderColor: "var(--sf-border-subtle)",
              color: "var(--sf-text-muted)",
            }}
          >
            Customizable
          </p>
        )}
      </div>

      {/* Right column: image */}
      {item.image && (
        <div className="w-[120px] shrink-0">
          <div className="relative overflow-hidden rounded-[12px]">
            <img
              src={item.image}
              alt=""
              className="aspect-[4/3] w-full object-cover"
            />
            {unavailable && (
              <div className="absolute inset-0 grid place-items-center rounded-[12px] bg-black/50 px-2 text-center text-[11px] font-extrabold text-white">
                {item.availability === "SOLD_OUT" ? "Sold out" : "Unavailable"}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
