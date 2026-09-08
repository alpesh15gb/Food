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
  if (!items.length)
    return (
      <div className="sf-card mt-5 p-9 text-center">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-full"
          style={{ background: "var(--sf-primary-soft)", color: "var(--sf-primary)" }}
        >
          <Utensils className="h-6 w-6" />
        </div>
        <h2 className="sf-serif mt-4 text-xl" style={{ color: "var(--sf-text)" }}>
          The menu is being prepared
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--sf-text-secondary)" }}>
          The kitchen team will publish dishes shortly.
        </p>
      </div>
    );

  const shown = query
    ? items
    : items.filter((item) =>
        activeCategory === "All"
          ? true
          : activeCategory === "Popular"
          ? item.isBestseller
          : item.category === activeCategory
      );

  const display = shown.length ? shown : items;

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
