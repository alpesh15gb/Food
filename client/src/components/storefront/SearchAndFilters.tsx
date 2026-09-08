import { Search } from "lucide-react";
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
  const allCategories = [{ id: "all", name: "All", emoji: null, isOpen: true }, ...categories];

  return (
    <div className="sticky top-[52px] z-20 -mx-4 px-4 pb-3 pt-3 sf-header-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0">
      {/* Search bar (compact) */}
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--sf-text-muted)" }}
        />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search dishes..."
          className="h-10 w-full rounded-full border pl-10 pr-4 text-sm font-medium outline-none placeholder:text-[var(--sf-text-muted)] focus:ring-2"
          style={{
            background: "var(--sf-bg-subtle)",
            borderColor: "var(--sf-border)",
            color: "var(--sf-text)",
            "--tw-ring-color": "var(--sf-primary)",
          } as React.CSSProperties}
        />
      </div>

      {/* Category Pills */}
      <div className="hide-scrollbar sf-edge-fade flex gap-2 overflow-x-auto pb-1">
        {allCategories.map((category) => {
          const active = activeCategory === category.name;
          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.name)}
              className={`shrink-0 rounded-full px-5 py-2.5 text-xs font-bold transition-all ${
                active ? "" : "hover:border-[var(--sf-text-muted)]"
              }`}
              style={{
                background: active ? "var(--sf-primary)" : "transparent",
                color: active ? "white" : "var(--sf-text-secondary)",
                border: active ? "1px solid var(--sf-primary)" : "1px solid var(--sf-border)",
              }}
            >
              {category.emoji && <span className="mr-1">{category.emoji}</span>}
              {category.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
