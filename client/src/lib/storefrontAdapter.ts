/** Cloud Kitchen adapter: server-backed restaurant data mapped to customer menu model. */
import type { MenuItem } from "@/lib/types";

export type StorefrontAddonOption = {
  id: string;
  name: string;
  pricePaise: number;
  isAvailable: boolean;
};

export type StorefrontAddonGroup = {
  id: string;
  name: string;
  selectionType: "single" | "multiple";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: StorefrontAddonOption[];
};

export type StorefrontVariant = {
  id: string;
  name: string;
  /** Upcharge over the base price, in paise (server-authoritative). */
  pricePaise: number;
  isAvailable: boolean;
};

/** MenuItem plus real modifier data resolved from the storefront payload. */
export type StorefrontMenuItem = MenuItem & {
  tags?: string[];
  addonGroups?: StorefrontAddonGroup[];
  variants?: StorefrontVariant[];
};

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
    latitude?: string | number | null;
    longitude?: string | number | null;
    latitudeNum?: string | number | null;
    longitudeNum?: string | number | null;
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
    /** Real modifier data when the API includes it (forward-compatible). */
    addonGroups?: Array<{
      id: string;
      name: string;
      selectionType?: "single" | "multiple" | string | null;
      isRequired?: boolean | null;
      minSelections?: number | null;
      maxSelections?: number | null;
      sortOrder?: number | null;
      options?: Array<{
        id: string;
        name: string;
        pricePaise: number;
        isAvailable?: boolean | null;
        sortOrder?: number | null;
      }>;
    }> | null;
    variants?: Array<{
      id: string;
      name: string;
      pricePaise: number;
      isAvailable?: boolean | null;
      sortOrder?: number | null;
    }> | null;
  }>;
  /** Top-level modifier tables (joined to items by menuItemId when present). */
  addonGroups?: Array<{
    id: string;
    menuItemId: string;
    name: string;
    selectionType?: "single" | "multiple" | string | null;
    isRequired?: boolean | null;
    minSelections?: number | null;
    maxSelections?: number | null;
    sortOrder?: number | null;
  }>;
  addonOptions?: Array<{
    id: string;
    addonGroupId: string;
    name: string;
    pricePaise: number;
    isAvailable?: boolean | null;
    sortOrder?: number | null;
  }>;
  productVariants?: Array<{
    id: string;
    menuItemId: string;
    name: string;
    pricePaise: number;
    isAvailable?: boolean | null;
    sortOrder?: number | null;
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

  const toNumber = (value: string | number | null | undefined): number | null => {
    if (value == null) return null;
    const parsed = typeof value === "number" ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  /** Paise → ₹ with a safe fallback so one bad row can never render ₹NaN. */
  const rupees = (paise: number | null | undefined, fallback = 0): number => {
    const parsed = typeof paise === "number" ? paise : parseFloat(String(paise));
    return Number.isFinite(parsed) ? (parsed as number) / 100 : fallback;
  };

  const normalizeGroup = (
    group: {
      id: string;
      name: string;
      selectionType?: "single" | "multiple" | string | null;
      isRequired?: boolean | null;
      minSelections?: number | null;
      maxSelections?: number | null;
    },
    options: StorefrontAddonOption[],
  ): StorefrontAddonGroup => ({
    id: group.id,
    name: group.name,
    selectionType: group.selectionType === "multiple" ? "multiple" : "single",
    isRequired: group.isRequired ?? false,
    minSelections: group.minSelections ?? (group.isRequired ? 1 : 0),
    maxSelections: group.maxSelections ?? (group.selectionType === "multiple" ? Math.max(options.length, 1) : 1),
    options,
  });

  // Index top-level modifier tables by menu item / group for the join.
  const topLevelOptionsByGroup = new Map<string, StorefrontAddonOption[]>();
  for (const opt of data.addonOptions ?? []) {
    const list = topLevelOptionsByGroup.get(opt.addonGroupId) ?? [];
    list.push({
      id: opt.id,
      name: opt.name,
      pricePaise: Number.isFinite(opt.pricePaise) ? opt.pricePaise : 0,
      isAvailable: opt.isAvailable ?? true,
    });
    topLevelOptionsByGroup.set(opt.addonGroupId, list);
  }
  const topLevelGroupsByItem = new Map<string, StorefrontAddonGroup[]>();
  for (const group of data.addonGroups ?? []) {
    // Preserve server order — never re-sort; the kitchen's sortOrder is canonical.
    const options = (topLevelOptionsByGroup.get(group.id) ?? []).slice();
    const list = topLevelGroupsByItem.get(group.menuItemId) ?? [];
    list.push(normalizeGroup(group, options));
    topLevelGroupsByItem.set(group.menuItemId, list);
  }
  const topLevelVariantsByItem = new Map<string, StorefrontVariant[]>();
  for (const variant of data.productVariants ?? []) {
    const list = topLevelVariantsByItem.get(variant.menuItemId) ?? [];
    list.push({
      id: variant.id,
      name: variant.name,
      pricePaise: Number.isFinite(variant.pricePaise) ? variant.pricePaise : 0,
      isAvailable: variant.isAvailable ?? true,
    });
    topLevelVariantsByItem.set(variant.menuItemId, list);
  }

  const outletLatitude = data.outlet
    ? toNumber(data.outlet.latitudeNum) ?? toNumber(data.outlet.latitude)
    : null;
  const outletLongitude = data.outlet
    ? toNumber(data.outlet.longitudeNum) ?? toNumber(data.outlet.longitude)
    : null;

  const menu: StorefrontMenuItem[] = data.items    .filter(item => item.isOpen && item.availability !== "DISABLED")
    .map(item => {
      const embeddedGroups = (item.addonGroups ?? []).map(group => {
        const options: StorefrontAddonOption[] = (group.options ?? []).map(opt => ({
          id: opt.id,
          name: opt.name,
          pricePaise: Number.isFinite(opt.pricePaise) ? opt.pricePaise : 0,
          isAvailable: opt.isAvailable ?? true,
        }));
        return { ...normalizeGroup(group, options), options };
      });
      const joinedGroups = topLevelGroupsByItem.get(item.id) ?? [];
      const embeddedVariants: StorefrontVariant[] = (item.variants ?? []).map(variant => ({
        id: variant.id,
        name: variant.name,
        pricePaise: Number.isFinite(variant.pricePaise) ? variant.pricePaise : 0,
        isAvailable: variant.isAvailable ?? true,
      }));
      const joinedVariants = topLevelVariantsByItem.get(item.id) ?? [];
      const price = item.offerPricePaise
        ? rupees(item.offerPricePaise, rupees(item.pricePaise))
        : rupees(item.pricePaise);
      return {
        id: item.id,
        category: categoryName.get(item.categoryId) ?? "Menu",
        name: item.name,
        description: item.description ?? "Prepared fresh by the kitchen.",
        price,
        originalPrice: item.offerPricePaise ? rupees(item.pricePaise) : undefined,
        image: item.imageUrl ?? undefined,
        kind: item.dietaryType,
        tag: item.isBestseller ? "Bestseller" : item.tag ?? undefined,
        tags: item.tags ?? undefined,
        addonGroups: [...embeddedGroups, ...joinedGroups],
        variants: [...embeddedVariants, ...joinedVariants],
        availability: item.availability === "AVAILABLE" ? "AVAILABLE"
          : item.availability === "SCHEDULED_UNAVAILABLE" ? "SCHEDULED_UNAVAILABLE"
          : "SOLD_OUT",
        availableNote: item.availableNote ?? undefined,
        customizable: item.isCustomizable || embeddedGroups.length + joinedGroups.length > 0 || embeddedVariants.length + joinedVariants.length > 0,
        isBestseller: item.isBestseller,
        isRecommended: item.isRecommended,
        spiceLevel: item.spiceLevel ?? undefined,
      };
    });

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
      cuisines: (data.restaurant.cuisineSummary ?? "").split("•").map(v => v.trim()).filter(Boolean),
      eta,
      deliveryFee: rupees(data.restaurant.deliveryFeePaise),
      packagingFee: rupees(data.restaurant.packagingFeePaise),
      minOrder: rupees(data.restaurant.minOrderPaise),
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
    outlet: data.outlet
      ? {
          id: data.outlet.id,
          name: data.outlet.name,
          city: data.outlet.city,
          address: data.outlet.address,
          // Prefer the numeric Num fields when present; fall back to strings.
          latitude: outletLatitude,
          longitude: outletLongitude,
        }
      : null,
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
