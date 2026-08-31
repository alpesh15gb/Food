/** Cloud Kitchen adapter: server-backed restaurant data mapped to customer menu model. */
import type { MenuItem } from "@/lib/mockApi";

type StorefrontPayload = {
  restaurant: {
    id: string;
    name: string;
    cuisineSummary: string;
    logoUrl: string | null;
    bannerImageUrl: string | null;
    deliveryFeePaise: number;
    packagingFeePaise: number;
    minOrderPaise: number;
    isOpen: boolean;
    opensAt: string;
    description: string | null;
    contactPhone: string | null;
    address: string | null;
    preparationMinutes: number;
    tempClosureMessage: string | null;
    primaryColor: string;
    accentColor: string | null;
    fontFamily: string | null;
    bodyFontFamily: string | null;
    faviconUrl: string | null;
  };
  outlet: {
    id: string;
    name: string;
    preparationMinutes: number;
    address: string;
    city: string;
  } | null;
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    sortOrder: number;
    isVisible: boolean;
    isOpen: boolean;
    iconEmoji: string | null;
  }>;
  items: Array<{
    id: string;
    categoryId: string;
    name: string;
    description: string | null;
    pricePaise: number;
    offerPricePaise: number | null;
    imageUrl: string | null;
    dietaryType: "veg" | "nonveg" | "egg";
    tag: string | null;
    availability: "AVAILABLE" | "SOLD_OUT" | "SCHEDULED_UNAVAILABLE" | "OUT_OF_STOCK" | "DISABLED";
    availableNote: string | null;
    isCustomizable: boolean;
    isBestseller: boolean;
    isFeatured: boolean;
    isRecommended: boolean;
    spiceLevel: number | null;
    preparationMinutes: number | null;
    isOpen: boolean;
    tags: string[] | null;
  }>;
  offers: Array<{
    id: string;
    code: string;
    description: string;
    discountType: "flat" | "percent";
    discountValue: number;
    minOrderPaise: number;
  }>;
};

export function adaptStorefront(data: StorefrontPayload) {
  const categoryName = new Map(data.categories.map(c => [c.id, c.name]));
  const categoryEmoji = new Map(data.categories.map(c => [c.id, c.iconEmoji]));

  const menu: MenuItem[] = data.items
    .filter(item => item.isOpen && item.availability !== "DISABLED")
    .map(item => ({
      id: item.id,
      category: categoryName.get(item.categoryId) ?? "Menu",
      name: item.name,
      description: item.description ?? "Prepared fresh by the kitchen.",
      price: item.offerPricePaise ? item.offerPricePaise / 100 : item.pricePaise / 100,
      originalPrice: item.offerPricePaise ? item.pricePaise / 100 : undefined,
      image: item.imageUrl ?? undefined,
      kind: item.dietaryType,
      tag: item.isBestseller ? "Bestseller" : item.tag ?? undefined,
      availability: item.availability === "AVAILABLE" ? "AVAILABLE"
        : item.availability === "SCHEDULED_UNAVAILABLE" ? "SCHEDULED_UNAVAILABLE"
        : "SOLD_OUT",
      availableNote: item.availableNote ?? undefined,
      customizable: item.isCustomizable,
      isBestseller: item.isBestseller,
      isRecommended: item.isRecommended,
      spiceLevel: item.spiceLevel ?? undefined,
    }));

  const eta = data.outlet?.preparationMinutes
    ? `${data.outlet.preparationMinutes}–${data.outlet.preparationMinutes + 15} min`
    : "Time to be confirmed";

  // Build collections
  const collections = [
    { name: "Bestsellers", items: menu.filter(i => i.isBestseller) },
    { name: "Recommended", items: menu.filter(i => i.isRecommended || i.tag === "Recommended") },
    { name: "Veg Only", items: menu.filter(i => i.kind === "veg") },
  ].filter(c => c.items.length > 0);

  return {
    restaurant: {
      id: data.restaurant.id,
      name: data.restaurant.name,
      logo: data.restaurant.logoUrl ?? "",
      bannerImage: data.restaurant.bannerImageUrl ?? "",
      cuisines: data.restaurant.cuisineSummary.split("•").map(v => v.trim()).filter(Boolean),
      eta,
      deliveryFee: data.restaurant.deliveryFeePaise / 100,
      packagingFee: data.restaurant.packagingFeePaise / 100,
      minOrder: data.restaurant.minOrderPaise / 100,
      isOpen: data.restaurant.isOpen,
      description: data.restaurant.description,
      contactPhone: data.restaurant.contactPhone,
      address: data.outlet
        ? data.outlet.city === "To be configured"
          ? data.outlet.address
          : `${data.outlet.address}, ${data.outlet.city}`
        : "Service area to be configured",
      opensAt: data.restaurant.opensAt,
      tempClosureMessage: data.restaurant.tempClosureMessage,
    },
    categories: data.categories
      .filter(c => c.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(c => ({
        id: c.id,
        name: c.name,
        emoji: c.iconEmoji,
        isOpen: c.isOpen,
      })),
    menu,
    collections,
    offers: data.offers.map(o => ({
      code: o.code,
      description: o.description,
      discountType: o.discountType,
      discountValue: o.discountValue,
      minOrderPaise: o.minOrderPaise,
    })),
    theme: {
      primaryColor: data.restaurant.primaryColor ?? "#38271F",
      accentColor: data.restaurant.accentColor ?? data.restaurant.primaryColor ?? "#38271F",
      fontFamily: data.restaurant.fontFamily ? `'${data.restaurant.fontFamily}', serif` : "'Playfair Display', serif",
      bodyFontFamily: data.restaurant.bodyFontFamily ? `'${data.restaurant.bodyFontFamily}', sans-serif` : "'Inter', sans-serif",
      logoUrl: data.restaurant.logoUrl ?? "",
      faviconUrl: data.restaurant.faviconUrl ?? null,
    },
  };
}
