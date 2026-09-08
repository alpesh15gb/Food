import { useState } from "react";
import { Clock3, MapPin, Phone } from "lucide-react";

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
    address?: string;
    contactPhone?: string | null;
  };
  firstItemImage?: string;
};

export default function HeroBanner({ restaurant, firstItemImage }: HeroBannerProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const heroImage = (!imgFailed && (restaurant.bannerImage || firstItemImage)) || "";

  return (
    <section className="relative overflow-hidden pb-8 pt-6 sm:pb-12 sm:pt-10">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start lg:gap-16">
          {/* Left: Text content */}
          <div className="flex-1 text-center lg:text-left">
            <h1
              className="sf-heading text-3xl leading-tight sm:text-4xl lg:text-5xl"
              style={{ color: "var(--sf-text)" }}
            >
              {restaurant.name}
            </h1>

            {restaurant.cuisines.length > 0 && (
              <p className="mt-3 text-sm font-medium sm:text-base" style={{ color: "var(--sf-text-secondary)" }}>
                {restaurant.cuisines.join(" \u2022 ")}
              </p>
            )}

            {restaurant.description && (
              <p className="mt-4 max-w-lg text-sm leading-relaxed sm:text-base" style={{ color: "var(--sf-text-muted)" }}>
                {restaurant.description}
              </p>
            )}

            {/* CTA Buttons */}
            <div className="mt-6 flex flex-wrap justify-center gap-3 lg:justify-start">
              <a
                href="#menu"
                className="inline-flex items-center rounded-full px-7 py-3 text-sm font-extrabold text-white transition-transform active:scale-95"
                style={{ background: "var(--sf-primary)" }}
              >
                View menu
              </a>
              <button
                className="inline-flex items-center rounded-full border px-7 py-3 text-sm font-extrabold transition-transform active:scale-95"
                style={{
                  borderColor: "rgba(255,255,255,0.3)",
                  color: "var(--sf-text)",
                }}
              >
                Order now
              </button>
            </div>

            {/* Info strip */}
            <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs font-semibold sm:gap-6 lg:justify-start">
              <span className="inline-flex items-center gap-1.5" style={{ color: "var(--sf-text-secondary)" }}>
                <Clock3 className="h-3.5 w-3.5" />
                {restaurant.eta}
              </span>
              {restaurant.deliveryFee === 0 && (
                <span className="inline-flex items-center gap-1.5" style={{ color: "var(--sf-green)" }}>
                  Free delivery
                </span>
              )}
              {restaurant.minOrder > 0 && (
                <span className="inline-flex items-center gap-1.5" style={{ color: "var(--sf-text-secondary)" }}>
                  Min \u20B9{restaurant.minOrder}
                </span>
              )}
              {!restaurant.isOpen && (
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase"
                  style={{ background: "var(--sf-gold-soft)", color: "var(--sf-gold)" }}
                >
                  Closed now
                </span>
              )}
            </div>
          </div>

          {/* Right: Circular dish image */}
          {heroImage && (
            <div className="shrink-0">
              <div
                className="relative h-48 w-48 overflow-hidden rounded-full sm:h-64 sm:w-64 lg:h-80 lg:w-80"
                style={{ boxShadow: "0 0 60px rgba(230, 126, 34, 0.15)" }}
              >
                <img
                  src={heroImage}
                  alt={restaurant.name}
                  className="h-full w-full object-cover"
                  onError={() => setImgFailed(true)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
