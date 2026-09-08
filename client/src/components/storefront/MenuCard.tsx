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
      className={`sf-card group flex gap-4 p-4 transition-all hover:shadow-[var(--sf-shadow-elevated)] sm:p-5 ${
        unavailable ? "opacity-60" : ""
      }`}
    >
      {/* Left column: details */}
      <div className="min-w-0 flex-1">
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FoodDot kind={item.kind} />
          {item.isBestseller && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
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
              className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
              style={{
                background: "var(--sf-green-soft)",
                color: "var(--sf-green)",
              }}
            >
              {item.tag}
            </span>
          )}
          {hasDiscount && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
              style={{
                background: "var(--sf-green-soft)",
                color: "var(--sf-green)",
              }}
            >
              {discountPercent}% OFF
            </span>
          )}
        </div>

        {/* Name */}
        <h3
          className="sf-heading mt-2 text-[15px] leading-snug sm:text-base"
          style={{ color: "var(--sf-text)" }}
        >
          {item.name}
        </h3>

        {/* Description */}
        {item.description && (
          <p
            className="mt-1 line-clamp-2 max-w-md text-xs leading-relaxed sm:text-[13px]"
            style={{ color: "var(--sf-text-secondary)" }}
          >
            {item.description}
          </p>
        )}

        {/* Price + ADD row */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-extrabold sm:text-base" style={{ color: "var(--sf-text)" }}>
              {formatINR(item.price)}
            </p>
            {hasDiscount && (
              <p className="text-xs text-[var(--sf-text-muted)] line-through">
                {formatINR(item.originalPrice!)}
              </p>
            )}
          </div>

          {/* ADD button or Quantity stepper */}
          {cartQuantity > 0 && onQuantityChange ? (
            <Quantity compact value={cartQuantity} onChange={onQuantityChange} />
          ) : (
            <button
              disabled={unavailable}
              onClick={onAdd}
              className="sf-add-btn shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {unavailable
                ? "Unavailable"
                : item.customizable
                ? "CUSTOMISE"
                : "ADD"}
            </button>
          )}
        </div>

        {/* Unavailable note */}
        {unavailable && (
          <p
            className="mt-2 inline-flex rounded-lg px-2 py-1 text-[11px] font-bold"
            style={{
              background: "var(--sf-bg-subtle)",
              color: "var(--sf-red)",
            }}
          >
            {item.availableNote || "Unavailable"}
          </p>
        )}

        {/* Customizable hint */}
        {item.customizable && !unavailable && cartQuantity === 0 && (
          <p
            className="mt-2 text-[11px] font-semibold"
            style={{ color: "var(--sf-text-muted)" }}
          >
            Customizable
          </p>
        )}
      </div>

      {/* Right column: image */}
      {item.image && (
        <div className="w-[110px] shrink-0 sm:w-[130px]">
          <div className="relative overflow-hidden rounded-xl">
            <img
              src={item.image}
              alt=""
              className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {unavailable && (
              <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/50 px-2 text-center text-[11px] font-extrabold text-white">
                {item.availability === "SOLD_OUT" ? "Sold out" : "Unavailable"}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
