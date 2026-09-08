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
    <header className="sticky top-0 z-40 sf-header-blur border-b" style={{ borderColor: "var(--sf-border)" }}>
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-2.5 text-left"
        >
          {restaurantLogo ? (
            <img
              src={restaurantLogo}
              alt={restaurantName}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white"
              style={{ background: "var(--sf-primary)" }}
            >
              {restaurantName.charAt(0)}
            </span>
          )}
          <span className="sf-heading text-lg leading-tight" style={{ color: "var(--sf-text)" }}>
            {restaurantName}
          </span>
        </button>
        <nav className="flex items-center gap-2">
          <button
            onClick={onAccount}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-gray-100"
            aria-label="Account"
            style={{ color: "var(--sf-text-secondary)" }}
          >
            <UserRound className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={onCart}
            className="relative grid h-9 w-9 place-items-center rounded-full text-white"
            style={{ background: "var(--sf-primary)" }}
            aria-label="Open cart"
          >
            <ShoppingBag className="h-4 w-4" />
            {itemCount > 0 && (
              <span
                className="sf-pop-in absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-extrabold text-white"
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
