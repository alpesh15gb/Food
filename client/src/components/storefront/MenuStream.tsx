import { Utensils } from "lucide-react";
import type { MenuItem } from "@/lib/types";
import MenuCard from "./MenuCard";

export default function MenuStream({
  items,
  activeCategory,
  query,
  onAdd,
  cartQuantities = {},
  onQuantityChange,
}: {
  items: MenuItem[];
  activeCategory: string;
  query: string;
  onAdd: (item: MenuItem) => void;
  cartQuantities?: Record<string, number>;
  onQuantityChange?: (id: string, qty: number) => void;
}) {
  // Empty states are handled query-aware below (never fall back to the
  // full menu on zero results).
  const shown = query
    ? items
    : items.filter((item) =>
        activeCategory === "All"
          ? true
          : activeCategory === "Popular"
          ? item.isBestseller
          : item.category === activeCategory
      );

  // Never fall back to the full menu on zero results — that hides the fact
  // that nothing matched. Show a real empty state instead.
  if (!shown.length) {
    const searching = query.trim().length > 0;
    return (
      <div className="sf-card mt-5 p-9 text-center">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-full"
          style={{ background: "var(--sf-primary-soft)", color: "var(--sf-primary)" }}
        >
          <Utensils className="h-6 w-6" />
        </div>
        <h2 className="sf-serif mt-4 text-xl" style={{ color: "var(--sf-text)" }}>
          {searching ? "No dishes match your search" : activeCategory === "All" || items.length === 0
            ? "The menu is being prepared"
            : `No dishes in ${activeCategory} yet`}
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--sf-text-secondary)" }}>
          {searching ? (
            <>
              Nothing matched{" "}
              <span className="font-bold">“{query.trim()}”</span>. Try a
              different dish or clear the search.
            </>
          ) : items.length === 0 ? (
            "The kitchen team will publish dishes shortly."
          ) : (
            "Try another category or clear your search."
          )}
        </p>
      </div>
    );
  }

  const display = shown;

  return (
    <div className="pb-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {display.map((item) => (
          <MenuCard
            key={item.id}
            item={item}
            onAdd={() => onAdd(item)}
            cartQuantity={cartQuantities[item.id] ?? 0}
            onQuantityChange={
              onQuantityChange ? (next) => onQuantityChange(item.id, next) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
