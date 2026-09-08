import { Bike, Clock3, ShoppingBag } from "lucide-react";

type HeroBannerProps = {
  restaurant: {
    name: string;
    bannerImage?: string;
    cuisines: string[];
    description?: string | null;
    eta: string;
    deliveryFee: number;
    minOrder: number;
  };
};

function InfoBadge({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
      style={{
        background: "var(--sf-bg-subtle)",
        color: "var(--sf-text-secondary)",
      }}
    >
      {icon}
      {text}
    </span>
  );
}

export default function HeroBanner({ restaurant }: HeroBannerProps) {
  return (
    <section>
      {/* Banner image */}
      {restaurant.bannerImage && (
        <div className="relative overflow-hidden">
          <img
            src={restaurant.bannerImage}
            alt={`${restaurant.name} kitchen`}
            className="h-[200px] w-full object-cover object-center"
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" />
        </div>
      )}

      {/* Restaurant info */}
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className={`${restaurant.bannerImage ? "-mt-6" : "mt-4"} pb-4`}>
          <h1
            className="sf-heading text-[22px] leading-tight sm:text-2xl"
            style={{ color: "var(--sf-text)" }}
          >
            {restaurant.name}
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--sf-text-secondary)" }}
          >
            {restaurant.cuisines.join(" \u2022 ")}
          </p>
          {restaurant.description && (
            <p
              className="mt-1.5 max-w-lg text-xs leading-relaxed"
              style={{ color: "var(--sf-text-muted)" }}
            >
              {restaurant.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <InfoBadge
              icon={<Clock3 className="h-3.5 w-3.5" />}
              text={restaurant.eta}
            />
            {restaurant.deliveryFee > 0 && (
              <InfoBadge
                icon={<Bike className="h-3.5 w-3.5" />}
                text={`Delivery \u20B9${restaurant.deliveryFee}`}
              />
            )}
            {restaurant.minOrder > 0 && (
              <InfoBadge
                icon={<ShoppingBag className="h-3.5 w-3.5" />}
                text={`Min \u20B9${restaurant.minOrder}`}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
