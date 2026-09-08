import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Leaf } from "lucide-react";

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
  thumbs?: string[];
  menuCount?: number;
};

const WORD_MS = 2800;
const STRIKE_HOLD_MS = 800;

export default function HeroBanner({ restaurant, firstItemImage, thumbs = [], menuCount = 0 }: HeroBannerProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const heroImage =
    ([restaurant.bannerImage, firstItemImage].filter(Boolean) as string[]).find(
      src => src !== failedSrc
    ) ?? "";
  const words = restaurant.cuisines.length ? restaurant.cuisines : [restaurant.name];
  const reduceMotion = useReducedMotion();
  const cycling = words.length > 1 && !reduceMotion;
  const [wordIndex, setWordIndex] = useState(0);
  const [struck, setStruck] = useState(false);
  const swapTimer = useRef<number | undefined>(undefined);
  const eyebrow = restaurant.cuisines.length
    ? restaurant.cuisines.slice(0, 3).join(" • ")
    : "Family kitchen";

  useEffect(() => {
    if (!cycling) return;
    const id = window.setInterval(() => {
      setStruck(true);
      swapTimer.current = window.setTimeout(() => {
        setWordIndex(i => (i + 1) % words.length);
        setStruck(false);
      }, STRIKE_HOLD_MS);
    }, WORD_MS);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(swapTimer.current);
    };
  }, [cycling, words.length]);

  return (
    <section className="sf-hero-bg relative overflow-hidden">
      <div className="relative mx-auto max-w-[1440px] px-4 pb-14 pt-10 sm:px-6 lg:px-10 lg:pb-20 lg:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          {/* Left: copy */}
          <div className="text-center lg:text-left">
            <p
              className="text-[11px] font-extrabold uppercase tracking-[0.22em]"
              style={{ color: "var(--sf-primary)" }}
            >
              {eyebrow}
            </p>

            <h1
              className="sf-serif mt-4 text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-[3.6rem]"
              style={{ color: "var(--sf-text)" }}
            >
              The original taste
              <br />
              of{" "}
              <span className="relative inline-block" style={{ color: "var(--sf-primary)" }}>
                <motion.span
                  key={wordIndex}
                  className="inline-block"
                  initial={cycling ? { opacity: 0, y: 14 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                >
                  {words[wordIndex]}
                </motion.span>
                .
                {cycling && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-[3px] w-full origin-left -translate-y-1/2 rounded-full sm:h-[4px]"
                    style={{ background: "var(--sf-text)" }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: struck ? 1 : 0 }}
                    transition={{ duration: 0.4, ease: [0.65, 0, 0.35, 1] }}
                  />
                )}
              </span>
            </h1>

            <p
              className="mx-auto mt-5 max-w-md text-sm leading-relaxed sm:text-base lg:mx-0"
              style={{ color: "var(--sf-text-secondary)" }}
            >
              {restaurant.description ||
                "Traditional favourites, warm hospitality and the comfort of a family kitchen."}
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <a
                href="#menu"
                className="inline-flex items-center rounded-full px-7 py-3 text-sm font-extrabold text-white shadow-[var(--sf-shadow-fab)] transition-transform active:scale-95"
                style={{ background: "var(--sf-primary)" }}
              >
                View menu
              </a>
              <a
                href="#popular"
                className="inline-flex items-center rounded-full px-7 py-3 text-sm font-extrabold transition-transform active:scale-95"
                style={{ background: "var(--sf-text)", color: "var(--sf-bg)" }}
              >
                Order in now
              </a>
            </div>

            <div className="mt-8 lg:text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--sf-text-muted)" }}>
                {restaurant.isOpen === false ? "Currently closed" : "Open every day"}
              </p>
              <div className="mt-2 flex items-center justify-center gap-3 lg:justify-start">
                {thumbs.filter(Boolean).length > 0 && (
                  <div className="flex">
                    {thumbs.filter(Boolean).slice(0, 2).map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover ring-2"
                        style={{
                          borderColor: "var(--sf-bg)",
                          marginLeft: i ? -10 : 0,
                          ["--tw-ring-color" as string]: "var(--sf-bg)",
                        } as React.CSSProperties}
                      />
                    ))}
                  </div>
                )}
                <span className="text-sm font-extrabold" style={{ color: "var(--sf-gold)" }}>
                  {restaurant.isOpen === false ? "Opens soon" : restaurant.eta}
                </span>
                <span className="text-xs font-medium" style={{ color: "var(--sf-text-muted)" }}>
                  Delivery &amp; takeout
                </span>
              </div>
            </div>
          </div>

          {/* Right: circular dish on plate */}
          <div className="relative mx-auto w-fit">
            <Leaf
              className="absolute -left-8 top-8 h-4 w-4 rotate-12 opacity-80"
              style={{ color: "var(--sf-green)" }}
            />
            <Leaf
              className="absolute -right-4 bottom-16 h-3.5 w-3.5 -rotate-12 opacity-70"
              style={{ color: "var(--sf-green)" }}
            />

            <div
              className="relative h-64 w-64 rounded-full p-5 sm:h-80 sm:w-80 lg:h-[24rem] lg:w-[24rem]"
              style={{ background: "rgba(255,255,255,0.06)", boxShadow: "var(--sf-shadow-float)" }}
            >
              {heroImage ? (
                <img
                  src={heroImage}
                  alt={restaurant.name}
                  className="h-full w-full rounded-full object-cover"
                  onError={() => setFailedSrc(heroImage)}
                />
              ) : (
                <div
                  className="sf-serif grid h-full w-full place-items-center rounded-full text-6xl font-bold"
                  style={{ background: "var(--sf-bg-subtle)", color: "var(--sf-primary)" }}
                >
                  {restaurant.name.charAt(0)}
                </div>
              )}
            </div>

            <div
              className="absolute -right-3 top-1/2 flex -translate-y-1/2 items-center gap-2.5 rounded-xl px-3.5 py-2.5 shadow-[var(--sf-shadow-elevated)] sm:-right-8"
              style={{ background: "var(--sf-surface)", border: "1px solid var(--sf-border-subtle)" }}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "var(--sf-green-soft)" }}>
                <Check className="h-4 w-4" style={{ color: "var(--sf-green)" }} />
              </span>
              <span className="text-left">
                <span className="block text-[11px] font-extrabold" style={{ color: "var(--sf-text)" }}>
                  Family recipes
                </span>
                <span className="block text-[10px] font-medium" style={{ color: "var(--sf-text-muted)" }}>
                  {menuCount > 0 ? `${menuCount} dishes on menu` : "Served fresh daily"}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
