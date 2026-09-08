import { useState } from "react";
import { Search, ShoppingBag, UserRound, X } from "lucide-react";

export default function TopBar({
  restaurantName,
  restaurantLogo,
  itemCount,
  onCart,
  onAccount,
  query,
  onQueryChange,
}: {
  restaurantName: string;
  restaurantLogo?: string;
  itemCount: number;
  onCart: () => void;
  onAccount: () => void;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const showLogo = !!restaurantLogo && !logoFailed;

  const words = restaurantName.trim().split(/\s+/);
  const wordmark =
    words.length > 1
      ? { first: words[0], rest: words.slice(1).join(" ") }
      : { first: restaurantName, rest: "" };

  return (
    <header className="sf-header-blur sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          {showLogo ? (
            <img
              src={restaurantLogo}
              alt={restaurantName}
              className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/20"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span
              className="sf-serif grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-bold text-white"
              style={{ background: "var(--sf-primary)" }}
            >
              {restaurantName.charAt(0)}
            </span>
          )}
          <span className="sf-serif truncate text-xl font-bold tracking-tight" style={{ color: "var(--sf-text)" }}>
            {wordmark.first}
            {wordmark.rest && (
              <>
                {" "}
                <span style={{ color: "var(--sf-primary)" }}>•</span> {wordmark.rest}
              </>
            )}
          </span>
        </button>

        <nav className="flex shrink-0 items-center gap-2 sm:gap-4">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="hidden text-xs font-bold hover:opacity-80 md:block"
            style={{ color: "var(--sf-text-secondary)" }}
          >
            Home
          </button>
          <a
            href="#menu"
            className="hidden text-xs font-bold hover:opacity-80 md:block"
            style={{ color: "var(--sf-text)" }}
          >
            Menu
          </a>
          <button
            onClick={() => setSearchOpen((open) => !open)}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/10"
            aria-label="Search dishes"
            style={{ color: "var(--sf-text-secondary)" }}
          >
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </button>
          <button
            onClick={onAccount}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/10"
            aria-label="Account"
            style={{ color: "var(--sf-text-secondary)" }}
          >
            <UserRound className="h-4 w-4" />
          </button>
          <button
            onClick={onCart}
            className="relative grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/10"
            aria-label="Open cart"
            style={{ color: "var(--sf-text)" }}
          >
            <ShoppingBag className="h-4 w-4" />
            {itemCount > 0 && (
              <span
                className="sf-pop-in absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-0.5 text-[9px] font-extrabold text-white ring-2"
                style={{ background: "var(--sf-primary)", "--tw-ring-color": "var(--sf-bg)" } as React.CSSProperties}
              >
                {itemCount}
              </span>
            )}
          </button>
          <a
            href="#menu"
            className="hidden rounded-full px-5 py-2.5 text-xs font-extrabold text-white shadow-[var(--sf-shadow-fab)] sm:inline-flex"
            style={{ background: "var(--sf-primary)" }}
          >
            Order now
          </a>
        </nav>
      </div>

      {searchOpen && (
        <div className="border-t px-4 py-3 sm:px-6 lg:px-10" style={{ borderColor: "var(--sf-border-subtle)" }}>
          <div className="relative mx-auto max-w-xl">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--sf-text-muted)" }}
            />
            <input
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search dishes..."
              className="h-11 w-full rounded-full border pl-11 pr-4 text-sm font-medium outline-none placeholder:text-[var(--sf-text-muted)] focus:ring-2"
              style={{
                background: "var(--sf-bg-subtle)",
                borderColor: "var(--sf-border)",
                color: "var(--sf-text)",
                "--tw-ring-color": "var(--sf-primary)",
              } as React.CSSProperties}
            />
          </div>
        </div>
      )}
    </header>
  );
}
