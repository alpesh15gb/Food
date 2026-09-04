/**
 * Order Pricing — server-side quote calculation.
 * Never trust client-submitted totals. All calculations use integer paise.
 */

export type CartLine = {
  menuItemId: string;
  quantity: number;
  modifiers?: Array<{ optionId: string; name: string; pricePaise: number }>;
  variantId?: string;
  variantPricePaise?: number;
};

export type CatalogItem = {
  id: string;
  name: string;
  pricePaise: number;
  offerPricePaise?: number | null;
  availability: string;
  taxPercent?: string | null;
  packagingFeePaise?: number | null;
  stock?: number | null;
  maxQuantityPerOrder?: number | null;
};

export type Quote = {
  itemTotalPaise: number;
  discountPaise: number;
  couponDiscountPaise: number;
  packagingFeePaise: number;
  deliveryFeePaise: number;
  taxPaise: number;
  totalPaise: number;
};

export class CartValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartValidationError";
  }
}

/**
 * Calculate the authoritative quote for a cart.
 * Uses only server-side catalog prices — never client-submitted amounts.
 */
export function calculateAuthoritativeQuote(args: {
  lines: CartLine[];
  catalog: CatalogItem[];
  packagingFeePaise: number;
  deliveryFeePaise: number;
  discountPaise?: number;
  couponDiscountPaise?: number;
  taxPercent?: number;
}): Quote {
  const { lines, catalog, packagingFeePaise, deliveryFeePaise } = args;
  const catalogMap = new Map(catalog.map(item => [item.id, item]));

  let itemTotalPaise = 0;
  let totalTaxablePaise = 0;
  let totalItemPackaging = 0;

  for (const line of lines) {
    const catalogItem = catalogMap.get(line.menuItemId);
    if (!catalogItem) {
      throw new CartValidationError(`Item "${line.menuItemId}" is not in the menu.`);
    }
    if (catalogItem.availability !== "AVAILABLE") {
      throw new CartValidationError(`"${catalogItem.name}" is currently unavailable.`);
    }
    if (line.quantity < 1 || line.quantity > (catalogItem.maxQuantityPerOrder ?? 20)) {
      throw new CartValidationError(`Invalid quantity for "${catalogItem.name}".`);
    }
    if (catalogItem.stock != null && catalogItem.stock !== undefined && line.quantity > catalogItem.stock) {
      throw new CartValidationError(`Insufficient stock for "${catalogItem.name}".`);
    }

    // Base price — use offer price if available
    const effectivePrice = catalogItem.offerPricePaise ?? catalogItem.pricePaise;
    const lineTotal = effectivePrice * line.quantity;

    // Variant upcharge
    const variantUpcharge = (line.variantPricePaise ?? 0) * line.quantity;

    // Modifier upcharges
    const modifierUpcharge = (line.modifiers ?? []).reduce(
      (sum, mod) => sum + (mod.pricePaise || 0), 0
    ) * line.quantity;

    const lineItemTotal = lineTotal + variantUpcharge + modifierUpcharge;
    itemTotalPaise += lineItemTotal;
    totalTaxablePaise += lineItemTotal;
    totalItemPackaging += (catalogItem.packagingFeePaise ?? 0) * line.quantity;
  }

  // Apply restaurant-level packaging if items don't have individual packaging
  const packagingFee = totalItemPackaging > 0 ? totalItemPackaging : packagingFeePaise;

  // Coupon discount (capped to item total) — computed before tax so tax applies net of coupon.
  const couponDiscountPaise = Math.min(args.couponDiscountPaise ?? 0, itemTotalPaise);
  const netTaxablePaise = Math.max(0, totalTaxablePaise - couponDiscountPaise);

  // Tax calculation on (itemTotal - coupon), before packaging/delivery.
  // Supports per-item taxPercent when present; otherwise falls back to restaurant rate.
  const hasPerItemTax = catalog.some(c => {
    const t = c.taxPercent == null ? NaN : parseFloat(String(c.taxPercent));
    return Number.isFinite(t) && t > 0;
  });
  let taxPaise = 0;
  if (hasPerItemTax) {
    // Allocate coupon discount proportionally across lines, then apply each item's rate.
    for (const line of lines) {
      const catalogItem = catalogMap.get(line.menuItemId)!;
      const effectivePrice = catalogItem.offerPricePaise ?? catalogItem.pricePaise;
      const lineTotal =
        effectivePrice * line.quantity +
        (line.variantPricePaise ?? 0) * line.quantity +
        (line.modifiers ?? []).reduce((sum, mod) => sum + (mod.pricePaise || 0), 0) * line.quantity;
      const couponShare = itemTotalPaise > 0 ? Math.round((lineTotal / itemTotalPaise) * couponDiscountPaise) : 0;
      const lineNet = Math.max(0, lineTotal - couponShare);
      const itemTax = parseFloat(String(catalogItem.taxPercent ?? ""));
      const rate = Number.isFinite(itemTax) && itemTax > 0 ? itemTax : (args.taxPercent ?? 5);
      taxPaise += Math.round((lineNet * rate) / 100);
    }
  } else {
    const taxPercent = args.taxPercent ?? 5; // default 5% GST
    taxPaise = Math.round((netTaxablePaise * taxPercent) / 100);
  }

  // Grand total
  const totalPaise = Math.max(0, itemTotalPaise - couponDiscountPaise + packagingFee + deliveryFeePaise + taxPaise);

  return {
    itemTotalPaise,
    discountPaise: 0, // general discount (future use)
    couponDiscountPaise,
    packagingFeePaise: packagingFee,
    deliveryFeePaise,
    taxPaise,
    totalPaise,
  };
}

/**
 * Validate a coupon against order and customer state.
 */
export function validateCoupon(args: {
  coupon: {
    code: string;
    discountType: "flat" | "percent";
    discountValue: number;
    minOrderPaise: number;
    maxDiscountPaise?: number | null;
    isActive: boolean;
    startsAt?: Date | null;
    endsAt?: Date | null;
    isNewCustomerOnly: boolean;
    totalUsageLimit?: number | null;
    perCustomerLimit?: number | null;
  };
  cartTotalPaise: number;
  now: Date;
  customerOrderCount?: number;
  customerCouponUsageCount?: number;
  totalCouponUsageCount?: number;
}): { valid: boolean; discountPaise: number; error?: string } {
  const { coupon, cartTotalPaise, now } = args;

  if (!coupon.isActive) {
    return { valid: false, discountPaise: 0, error: "This coupon is no longer active." };
  }

  if (coupon.startsAt && now < coupon.startsAt) {
    return { valid: false, discountPaise: 0, error: "This coupon is not yet active." };
  }

  if (coupon.endsAt && now > coupon.endsAt) {
    return { valid: false, discountPaise: 0, error: "This coupon has expired." };
  }

  if (cartTotalPaise < coupon.minOrderPaise) {
    return {
      valid: false,
      discountPaise: 0,
      error: `Minimum order of ₹${Math.ceil(coupon.minOrderPaise / 100)} required.`,
    };
  }

  if (coupon.isNewCustomerOnly && (args.customerOrderCount ?? 0) > 0) {
    return { valid: false, discountPaise: 0, error: "This coupon is for new customers only." };
  }

  if (coupon.totalUsageLimit != null && (args.totalCouponUsageCount ?? 0) >= coupon.totalUsageLimit) {
    return { valid: false, discountPaise: 0, error: "This coupon has reached its usage limit." };
  }

  if (coupon.perCustomerLimit != null && (args.customerCouponUsageCount ?? 0) >= coupon.perCustomerLimit) {
    return { valid: false, discountPaise: 0, error: "You've already used this coupon." };
  }

  // Calculate discount
  let discountPaise: number;
  if (coupon.discountType === "flat") {
    discountPaise = Math.min(coupon.discountValue, cartTotalPaise);
  } else {
    discountPaise = Math.round(cartTotalPaise * coupon.discountValue / 100);
  }

  // Cap at max discount
  if (coupon.maxDiscountPaise != null) {
    discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise);
  }

  return { valid: true, discountPaise };
}
