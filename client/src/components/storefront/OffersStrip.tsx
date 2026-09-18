import { TicketPercent } from "lucide-react";

type Offer = {
  code: string;
  description: string;
};

export default function OffersStrip({ offers }: { offers: Offer[] }) {
  if (!offers.length) return null;

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
      <div className="hide-scrollbar sf-edge-fade mt-4 flex gap-3 overflow-x-auto">
        {offers.slice(0, 5).map((offer) => (
          <div
            key={offer.code}
            className="sf-card flex max-w-[80vw] shrink-0 items-center gap-2.5 px-4 py-3"
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{
                background: "var(--sf-primary-soft)",
                color: "var(--sf-primary)",
              }}
            >
              <TicketPercent className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p
                className="truncate text-sm font-extrabold tabular-nums"
                style={{ color: "var(--sf-primary)" }}
              >
                {offer.code}
              </p>
              <p
                className="line-clamp-2 text-[11px] leading-snug"
                style={{ color: "var(--sf-text-secondary)" }}
              >
                {offer.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
