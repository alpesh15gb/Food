import { useState } from "react";
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
  const [bannerFailed, setBannerFailed] = useState(false);
  const hasBanner = !!restaurant.bannerImage && !bannerFailed;

  return (
    <section className="pb-2">
      {/* Banner image or gradient fallback */}
      {hasBanner ? (
        <div className="relative overflow-hidden">
          <img
            src={restaurant.bannerImage!}
            alt={restaurant.name}
            className="h-[160px] w-full object-cover object-center sm:h-[200px]"
            onError={() => setBannerFailed(true)}
          />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
        </div>
      ) : (
        <div
          className="relative h-[80px] overflow-hidden sm:h-[100px]"
          style={{
            background: "linear-gradient(135deg, var(--sf-primary-soft, #fef2f0) 0%, var(--sf-bg-subtle) 50%, var(--sf-bg) 100%)",
          }}
        >
          <div
            className="absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-10"
            style={{ background: "var(--sf-primary)" }}
          />
        </div>
      )}

      {/* Restaurant info (name already shown in TopBar) */}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="mt-4">
          {/* Cuisines */}
          {restaurant.cuisines.length > 0 && (
            <p className="text-sm font-semibold" style={{ color: "var(--sf-text-secondary)" }}>
              {restaurant.cuisines.join(" \u2022 ")}
            </p>
          )}

          {/* Description */}
          {restaurant.description && (
            <p
              className="mt-2 max-w-xl text-[13px] leading-relaxed"
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
