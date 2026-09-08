import { useRef } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { formatINR, type MenuItem } from "@/lib/types";

export default function PopularCarousel({
  items,
  onAdd,
}: {
  items: MenuItem[];
  onAdd: (item: MenuItem) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  if (!items.length) return null;

  const scrollBy = (dx: number) =>
    trackRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <section id="popular" className="mx-auto max-w-[1440px] px-4 pt-2 sm:px-6 lg:px-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p
            className="text-[11px] font-extrabold uppercase tracking-[0.22em]"
            style={{ color: "var(--sf-primary)" }}
          >
            Most loved
          </p>
          <h2 className="sf-serif mt-1 text-2xl font-bold sm:text-3xl" style={{ color: "var(--sf-text)" }}>
            Popular right now
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => scrollBy(-320)}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/10"
            style={{ background: "var(--sf-surface)", color: "var(--sf-text-secondary)" }}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scrollBy(320)}
            className="grid h-9 w-9 place-items-center rounded-full text-white transition-transform active:scale-90"
            style={{ background: "var(--sf-primary)" }}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="hide-scrollbar -mx-4 mt-8 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      >
        {items.map((item) => (
          <article key={item.id} className="w-[180px] shrink-0 sm:w-[210px]">
            <div className="relative z-10 mx-auto h-28 w-28 sm:h-32 sm:w-32">
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.name}
                  className="h-full w-full rounded-full object-cover shadow-[var(--sf-shadow-elevated)] ring-4 ring-black/25"
                />
              ) : (
                <div
                  className="grid h-full w-full place-items-center rounded-full text-2xl"
                  style={{ background: "var(--sf-bg-subtle)" }}
                >
                  🍽️
                </div>
              )}
            </div>
            <div className="sf-card -mt-10 flex flex-col px-4 pb-4 pt-12">
              <h3 className="truncate text-sm font-extrabold" style={{ color: "var(--sf-text)" }}>
                {item.name}
              </h3>
              <p className="mt-1 line-clamp-1 text-[11px] font-medium" style={{ color: "var(--sf-text-muted)" }}>
                {item.description}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-extrabold" style={{ color: "var(--sf-primary)" }}>
                  {formatINR(item.price)}
                </span>
                <button
                  onClick={() => onAdd(item)}
                  className="grid h-8 w-8 place-items-center rounded-full text-white transition-transform active:scale-90"
                  style={{ background: "var(--sf-primary)" }}
                  aria-label={`Add ${item.name}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
