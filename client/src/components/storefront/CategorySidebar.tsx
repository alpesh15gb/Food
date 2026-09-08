type CategoryLike = {
  id: string;
  name: string;
  emoji?: string | null;
  isOpen: boolean;
};

export default function CategorySidebar({
  categories,
  activeCategory,
  onSelect,
}: {
  categories: CategoryLike[];
  activeCategory: string;
  onSelect: (name: string) => void;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20">
        <p
          className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.16em]"
          style={{ color: "var(--sf-text-muted)" }}
        >
          On the menu
        </p>
        <nav className="space-y-0.5">
          {categories.map((category) => {
            const active = activeCategory === category.name;
            return (
              <button
                key={category.id}
                onClick={() => onSelect(category.name)}
                className={`block w-full rounded-[var(--sf-radius-btn)] px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                  active ? "" : "hover:bg-[var(--sf-bg-subtle)]"
                }`}
                style={{
                  background: active ? "var(--sf-primary-soft)" : "transparent",
                  color: active ? "var(--sf-primary)" : "var(--sf-text-secondary)",
                }}
              >
                {category.emoji && (
                  <span className="mr-2">{category.emoji}</span>
                )}
                {category.name}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
