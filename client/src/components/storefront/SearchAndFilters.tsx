import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import FoodDot from "./FoodDot";
import type { Filter } from "./types";

type CategoryLike = {
  id: string;
  name: string;
  emoji?: string | null;
  isOpen: boolean;
};

export default function SearchAndFilters({
  query,
  onQueryChange,
  categories,
  activeCategory,
  onCategoryChange,
  filter,
  onFilterChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  categories: CategoryLike[];
  activeCategory: string;
  onCategoryChange: (name: string) => void;
  filter: Filter;
  onFilterChange: (value: Filter) => void;
}) {
  const filterOptions: [Filter, string][] = [
    ["all", "All"],
    ["veg", "Veg"],
    ["nonveg", "Non-Veg"],
    ["bestseller", "Bestseller"],
  ];

  return (
    <div className="sticky top-[60px] z-20 -mx-4 px-4 pb-3 pt-4 sf-header-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0">
      {/* Search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--sf-text-muted)" }}
        />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search for dishes, cuisines..."
          className="h-12 rounded-full border bg-[var(--sf-bg-subtle)] pl-11 pr-4 text-sm font-medium shadow-sm placeholder:text-[var(--sf-text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]/20"
          style={{ borderColor: "var(--sf-border)" }}
        />
      </div>

      {/* Mobile Category Pills */}
      <div className="hide-scrollbar sf-edge-fade mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.name)}
            className={`sf-pill shrink-0 ${
              activeCategory === category.name
                ? "sf-pill-active"
                : "sf-pill-inactive"
            }`}
          >
            {category.emoji && <span className="mr-1">{category.emoji}</span>}
            {category.name}
          </button>
        ))}
      </div>

      {/* Filter Chips */}
      <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        {filterOptions.map(([value, label]) => (
          <button
            key={value}
            onClick={() => onFilterChange(value)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all ${
              filter === value
                ? "sf-pill-active shadow-sm"
                : "sf-pill-inactive hover:border-[var(--sf-text-muted)]"
            }`}
          >
            {value === "veg" && <FoodDot kind="veg" />}
            {value === "nonveg" && <FoodDot kind="nonveg" />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
