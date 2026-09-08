import { useState } from "react";
import { ShoppingBag, UserRound } from "lucide-react";

export default function TopBar({
  restaurantName,
  restaurantLogo,
  itemCount,
  onCart,
  onAccount,
}: {
  restaurantName: string;
  restaurantLogo?: string;
  itemCount: number;
  onCart: () => void;
  onAccount: () => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = !!restaurantLogo && !logoFailed;

  return (
    <header
      className="sticky top-0 z-40 border-b sf-header-blur"
      style={{ borderColor: "var(--sf-border)" }}
    >
      <div className="mx-auto flex h-[52px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          {showLogo ? (
            <img
              src={restaurantLogo}
              alt={restaurantName}
              className="h-8 w-8 shrink-0 rounded-lg object-cover"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-extrabold text-white"
              style={{ background: "var(--sf-primary)" }}
            >
              {restaurantName.charAt(0)}
            </span>
          )}
          <span
            className="sf-heading truncate text-base leading-tight"
            style={{ color: "var(--sf-text)" }}
          >
            {restaurantName}
          </span>
        </button>

        <nav className="flex shrink-0 items-center gap-1">
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
            className="relative grid h-9 w-9 place-items-center rounded-full text-white transition-transform"
            style={{ background: "var(--sf-primary)" }}
            aria-label="Open cart"
          >
            <ShoppingBag className="h-4 w-4" />
            {itemCount > 0 && (
              <span
                className="sf-pop-in absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-0.5 text-[9px] font-extrabold text-white ring-2"
                style={{ background: "var(--sf-green)", "--tw-ring-color": "var(--sf-bg)" } as React.CSSProperties}
              >
                {itemCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}
