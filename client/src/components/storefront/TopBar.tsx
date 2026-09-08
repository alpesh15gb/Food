import { ShoppingBag, UserRound } from "lucide-react";

export default function TopBar({
  restaurantName,
  restaurantLogo,
  itemCount,
  onCart,
  onAccount,
  customerPhone,
}: {
  restaurantName: string;
  restaurantLogo?: string;
  itemCount: number;
  onCart: () => void;
  onAccount: () => void;
  customerPhone?: string;
}) {
  return (
    <header
      className="sticky top-0 z-40 border-b sf-header-blur"
      style={{ borderColor: "var(--sf-border)" }}
    >
      <div className="mx-auto flex h-[60px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
        {/* Logo + Name */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          {restaurantLogo ? (
            <img
              src={restaurantLogo}
              alt={restaurantName}
              className="h-10 w-10 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-extrabold text-white"
              style={{ background: "var(--sf-primary)" }}
            >
              {restaurantName.charAt(0)}
            </span>
          )}
          <span
            className="sf-heading truncate text-lg leading-tight"
            style={{ color: "var(--sf-text)" }}
          >
            {restaurantName}
          </span>
        </button>

        {/* Actions */}
        <nav className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={onAccount}
            className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-black/5"
            aria-label="Account"
            style={{ color: "var(--sf-text-secondary)" }}
          >
            <UserRound className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={onCart}
            className="relative grid h-10 w-10 place-items-center rounded-full text-white transition-transform"
            style={{ background: "var(--sf-primary)" }}
            aria-label="Open cart"
          >
            <ShoppingBag className="h-[18px] w-[18px]" />
            {itemCount > 0 && (
              <span
                className="sf-pop-in absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-0.5 text-[9px] font-extrabold text-white ring-2 ring-white"
                style={{ background: "var(--sf-green)" }}
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
