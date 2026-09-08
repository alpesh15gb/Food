import { ChevronRight, MapPin } from "lucide-react";

export default function DeliveryBar({
  deliveryAddress,
  onOpen,
}: {
  deliveryAddress: {
    confirmed?: boolean;
    flatHouse?: string;
    area?: string;
    city?: string;
    postalCode?: string;
  } | null;
  onOpen: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
      <button
        onClick={onOpen}
        className="sf-card flex w-full items-center gap-3 p-3 text-left"
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{
            background: "var(--sf-primary-soft)",
            color: "var(--sf-primary)",
          }}
        >
          <MapPin className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-extrabold uppercase tracking-[0.14em]"
            style={{ color: "var(--sf-text-muted)" }}
          >
            {deliveryAddress?.confirmed
              ? "Delivering to"
              : "Set delivery location"}
          </p>
          {deliveryAddress?.confirmed ? (
            <p
              className="truncate text-sm font-bold"
              style={{ color: "var(--sf-text)" }}
            >
              {deliveryAddress.flatHouse}, {deliveryAddress.area},{" "}
              {deliveryAddress.city} {deliveryAddress.postalCode}
            </p>
          ) : (
            <p
              className="truncate text-sm font-bold"
              style={{ color: "var(--sf-primary)" }}
            >
              Tap to set your delivery location
            </p>
          )}
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--sf-text-muted)" }}
        />
      </button>
    </div>
  );
}
