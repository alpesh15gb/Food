/**
 * CLS-safe, lazy, low-data-aware image.
 * - Reserves space via aspect-ratio (no layout shift when it loads)
 * - loading="lazy" + decoding="async" below the fold
 * - Shimmer placeholder while loading; styled fallback on error/empty
 * - On low-data connections, non-critical images render the fallback
 *   (dish initial) instead of fetching bytes.
 */
import { useState } from "react";
import { isLowDataConnection } from "@/lib/network";
import { cn } from "@/lib/utils";

export default function SmartImage({
  src,
  alt,
  className,
  imgClassName,
  ratio = "4/3",
  eager = false,
  critical = false,
  fallbackLabel,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  /** CSS aspect-ratio for the reserved box, e.g. "1/1", "4/3", "16/9". */
  ratio?: string;
  /** Above-the-fold hero: eager fetch + never skipped on low data. */
  eager?: boolean;
  /** When true, always fetch even on low-data connections. */
  critical?: boolean;
  /** Initial shown in the fallback box (e.g. dish initial). */
  fallbackLabel?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const skipFetch = !src || (!critical && !eager && isLowDataConnection());

  if (skipFetch || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        style={{ aspectRatio: ratio }}
        className={cn(
          "grid w-full place-items-center overflow-hidden bg-[#f3e7d8] text-[#a37960]",
          className
        )}
      >
        <span aria-hidden="true" className="font-display text-2xl font-bold">
          {fallbackLabel ?? alt.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{ aspectRatio: ratio }}
      className={cn("relative w-full overflow-hidden bg-[#f3e7d8]", className)}
    >
      {!loaded && (
        <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-[#eadfd4]" />
      )}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "auto"}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
          imgClassName
        )}
      />
    </div>
  );
}
