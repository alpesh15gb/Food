/**
 * Per-restaurant head tags: title, description, canonical, OpenGraph/Twitter
 * and Restaurant JSON-LD. The static index.html ships platform-neutral
 * defaults (right for the platform host, wrong for tenants), so the
 * storefront overwrites them once its data loads and restores on unmount.
 */
import { useEffect } from "react";
import {
  setCanonical,
  setJsonLd,
  setMetaName,
  setMetaProperty,
} from "@/lib/seo";

export default function StorefrontSeo({
  slug,
  name,
  description,
  cuisines,
  city,
  address,
  phone,
  image,
}: {
  slug: string;
  name: string | null;
  description?: string | null;
  cuisines: string[];
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  image?: string | null;
}) {
  useEffect(() => {
    if (!name) return;
    const cleanups: Array<() => void> = [];
    const prevTitle = document.title;

    const place = city ? ` in ${city}` : "";
    const title = `${name} | Order Food Online${place}`;
    const desc =
      description?.trim() ||
      `Order from ${name}${place}${cuisines.length ? ` — ${cuisines.slice(0, 4).join(", ")}` : ""}. Live menu, honest pricing, direct ordering.`;
    const canonical = `${window.location.origin}/${slug}`;
    const imageUrl =
      image && /^https?:\/\//.test(image)
        ? image
        : `${window.location.origin}/assets/food/hero-thali.jpg`;

    document.title = title;
    cleanups.push(setMetaName("description", desc));
    cleanups.push(setCanonical(canonical));
    cleanups.push(setMetaProperty("og:type", "restaurant"));
    cleanups.push(setMetaProperty("og:site_name", name));
    cleanups.push(setMetaProperty("og:title", title));
    cleanups.push(setMetaProperty("og:description", desc));
    cleanups.push(setMetaProperty("og:url", canonical));
    cleanups.push(setMetaProperty("og:image", imageUrl));
    cleanups.push(setMetaProperty("twitter:card", "summary_large_image"));
    cleanups.push(setMetaProperty("twitter:title", title));
    cleanups.push(setMetaProperty("twitter:description", desc));
    cleanups.push(setMetaProperty("twitter:image", imageUrl));
    cleanups.push(
      setJsonLd("restaurant", {
        "@context": "https://schema.org",
        "@type": "Restaurant",
        name,
        description: desc,
        url: canonical,
        ...(phone ? { telephone: phone } : {}),
        ...(cuisines.length ? { servesCuisine: cuisines } : {}),
        ...(image && /^https?:\/\//.test(image) ? { image } : {}),
        address: {
          "@type": "PostalAddress",
          ...(address ? { streetAddress: address } : {}),
          ...(city ? { addressLocality: city } : {}),
          addressCountry: "IN",
        },
      })
    );

    return () => {
      document.title = prevTitle;
      for (const fn of cleanups) fn();
    };
  }, [slug, name, description, cuisines.join("|"), city, address, phone, image]);

  return null;
}
