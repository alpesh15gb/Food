import { Bike, Clock3, ShoppingBag, Star } from "lucide-react";

type HeroBannerProps = {
  restaurant: {
    name: string;
    logo?: string;
    bannerImage?: string;
    cuisines: string[];
    description?: string | null;
    eta: string;
    deliveryFee: number;
    minOrder: number;
    isOpen?: boolean;
  };
};

function InfoBadge({ icon, label, value }: { icon: React.ReactNode; label?: string; value: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2"
      style={{
        background: "var(--sf-bg-subtle)",
        border: "1px solid var(--sf-border-subtle, var(--sf-border))",
      }}
    >
      <span style={{ color: "var(--sf-primary)" }}>{icon}</span>
      <div className="flex flex-col leading-none">
        {label && (
          <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--sf-text-muted)" }}>
            {label}
          </span>
        )}
        <span className="text-xs font-bold" style={{ color: "var(--sf-text)" }}>
          {value}
        </span>
      </div>
    </div>
  );
}

export default function HeroBanner({ restaurant }: HeroBannerProps) {
  const hasBanner = !!restaurant.bannerImage;

  return (
    <section>
      {/* Banner image or gradient fallback */}
      {hasBanner ? (
        <div className="relative overflow-hidden">
          <img
            src={restaurant.bannerImage!}
            alt={restaurant.name}
            className="h-[180px] w-full object-cover object-center sm:h-[220px]"
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white via-white/60 to-transparent" />
        </div>
      ) : (
        <div
          className="relative flex h-[140px] items-end overflow-hidden sm:h-[160px]"
          style={{
            background: "linear-gradient(135deg, var(--sf-primary-soft, #fef2f0) 0%, var(--sf-bg-subtle) 50%, var(--sf-bg) 100%)",
          }}
        >
          {/* Decorative circles */}
          <div
            className="absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-10"
            style={{ background: "var(--sf-primary)" }}
          />
          <div
            className="absolute -left-6 top-12 h-24 w-24 rounded-full opacity-[0.07]"
            style={{ background: "var(--sf-primary)" }}
          />
        </div>
      )}

      {/* Restaurant info card */}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className={`${hasBanner ? "-mt-8" : "-mt-6"} pb-2`}>
          {/* Logo + Name row */}
          <div className="flex items-start gap-4">
            {restaurant.logo ? (
              <img
                src={restaurant.logo}
                alt={restaurant.name}
                className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-md sm:h-16 sm:w-16"
              />
            ) : (
              <div
                className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white shadow-md sm:h-16 sm:w-16"
                style={{ background: "var(--sf-primary)" }}
              >
                {restaurant.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0 pt-1">
              <h1
                className="sf-heading truncate text-xl leading-tight sm:text-[26px]"
                style={{ color: "var(--sf-text)" }}
              >
                {restaurant.name}
              </h1>
              {restaurant.cuisines.length > 0 && (
                <p className="mt-0.5 truncate text-sm font-medium" style={{ color: "var(--sf-text-secondary)" }}>
                  {restaurant.cuisines.join(" \u2022 ")}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          {restaurant.description && (
            <p
              className="mt-3 max-w-xl text-[13px] leading-relaxed"
              style={{ color: "var(--sf-text-muted)" }}
            >
              {restaurant.description}
            </p>
          )}

          {/* Info badges row */}
          <div className="mt-4 flex flex-wrap gap-2.5">
            <InfoBadge
              icon={<Clock3 className="h-4 w-4" />}
              label="Delivery"
              value={restaurant.eta}
            />
            {restaurant.deliveryFee >= 0 && (
              <InfoBadge
                icon={<Bike className="h-4 w-4" />}
                label="Fee"
                value={restaurant.deliveryFee === 0 ? "Free" : `\u20B9${restaurant.deliveryFee}`}
              />
            )}
            {restaurant.minOrder > 0 && (
              <InfoBadge
                icon={<ShoppingBag className="h-4 w-4" />}
                label="Min order"
                value={`\u20B9${restaurant.minOrder}`}
              />
            )}
            {!restaurant.isOpen && (
              <div
                className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2"
                style={{
                  background: "var(--sf-gold-soft, #FFF4DC)",
                  border: "1px solid var(--sf-gold, #EEA61B)",
                }}
              >
                <Star className="h-4 w-4" style={{ color: "var(--sf-gold)" }} />
                <span className="text-xs font-bold" style={{ color: "var(--sf-gold)" }}>
                  Closed now
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
