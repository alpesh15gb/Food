import { TicketPercent } from "lucide-react";

type Offer = {
  code: string;
  description: string;
};

export default function OffersStrip({
  offers,
  onApply,
  appliedCode,
}: {
  offers: Offer[];
  /** Opens the cart with the coupon prefilled. Omit to render read-only. */
  onApply?: (code: string) => void;
  /** Coupon currently applied, so the matching chip can be marked selected. */
  appliedCode?: string;
}) {
  if (!offers.length) return null;

  const applied = appliedCode?.trim().toUpperCase();

  return (
    // Gutter comes from the shared storefront container in OrderingApp; repeating
    // it here compounded the horizontal inset.
    <div>
      <div className="hide-scrollbar sf-edge-fade mt-4 flex gap-3 overflow-x-auto">
        {offers.slice(0, 5).map((offer) => {
          const isApplied = applied === offer.code.toUpperCase();
          const body = (
            <>
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                style={{
                  background: isApplied ? "var(--sf-green-soft)" : "var(--sf-primary-soft)",
                  color: isApplied ? "var(--sf-green)" : "var(--sf-primary)",
                }}
                aria-hidden="true"
              >
                <TicketPercent className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-extrabold tabular-nums"
                  style={{ color: isApplied ? "var(--sf-green)" : "var(--sf-primary)" }}
                >
                  {offer.code}
                  {isApplied && <span className="sr-only"> (applied)</span>}
                </p>
                <p
                  className="line-clamp-2 text-[11px] leading-snug"
                  style={{ color: "var(--sf-text-secondary)" }}
                >
                  {offer.description}
                </p>
              </div>
            </>
          );
          const shell = `sf-card flex max-w-[80vw] shrink-0 items-center gap-2.5 px-4 py-3 text-left ${
            onApply && !isApplied
              ? "cursor-pointer touch-manipulation transition-colors duration-200 hover:border-[var(--sf-primary)] active:scale-[0.99]"
              : ""
          }`;

          // A coupon code the customer can read but cannot act on is a dead end,
          // so tapping a chip prefills the cart's coupon field for the server to
          // validate rather than trusting the displayed code.
          if (!onApply) {
            return (
              <div key={offer.code} className={shell}>
                {body}
              </div>
            );
          }
          if (isApplied) {
            return (
              <div
                key={offer.code}
                className={shell}
                style={{
                  borderColor: "var(--sf-green)",
                  background: "var(--sf-green-soft)",
                }}
              >
                {body}
              </div>
            );
          }
          return (
            <button
              key={offer.code}
              type="button"
              onClick={() => onApply(offer.code)}
              className={shell}
              aria-label={`Apply coupon ${offer.code}`}
            >
              {body}
            </button>
          );
        })}
      </div>
    </div>
  );
}
