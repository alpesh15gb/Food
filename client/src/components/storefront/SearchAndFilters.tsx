type CategoryLike = {
  id: string;
  name: string;
  emoji?: string | null;
  isOpen: boolean;
};

export default function SearchAndFilters({
  categories,
  activeCategory,
  onCategoryChange,
  subtitle,
}: {
  categories: CategoryLike[];
  activeCategory: string;
  onCategoryChange: (name: string) => void;
  subtitle?: string;
}) {
  const pills = [
    { id: "all", name: "All", emoji: null },
    { id: "popular", name: "Popular", emoji: null },
    ...categories.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji ?? null })),
  ];

  return (
    <div id="menu" className="sf-menu-glow relative scroll-mt-16">
      <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-16 text-center sm:px-6 lg:px-10">
        <p
          className="text-[11px] font-extrabold uppercase tracking-[0.28em]"
          style={{ color: "var(--sf-primary)" }}
        >
          Menu • Menu
        </p>
        <h2
          className="sf-serif mx-auto mt-4 max-w-2xl text-3xl font-bold leading-tight sm:text-5xl"
          style={{ color: "var(--sf-text)" }}
        >
          Flavours you&apos;ll come back for.
        </h2>
        {subtitle && (
          <p
            className="mx-auto mt-4 max-w-xl text-sm leading-relaxed"
            style={{ color: "var(--sf-text-secondary)" }}
          >
            {subtitle}
          </p>
        )}

        <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
          {pills.map((pill) => {
            const active = activeCategory === pill.name;
            return (
              <button
                key={pill.id}
                onClick={() => onCategoryChange(pill.name)}
                className="rounded-full px-5 py-2.5 text-xs font-bold transition-all"
                style={
                  active
                    ? {
                        background: "var(--sf-primary)",
                        color: "white",
                        border: "1px solid var(--sf-primary)",
                        boxShadow: "var(--sf-shadow-fab)",
                      }
                    : {
                        background: "transparent",
                        color: "var(--sf-text-secondary)",
                        border: "1px solid var(--sf-border)",
                      }
                }
              >
                {pill.emoji && <span className="mr-1">{pill.emoji}</span>}
                {pill.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
