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
const PG_INT_MAX = 2147483647;
const MAX_LINES = 50;

function assertPaiseInt(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new CartValidationError(`Invalid ${label}.`);
  }
  if (value < 0 || value > PG_INT_MAX) {
    throw new CartValidationError(`Invalid ${label}.`);
  }
  return value;
}

function parseTaxRate(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return n;
}

function effectiveUnitPrice(item: CatalogItem): number {
  assertPaiseInt(item.pricePaise, `price for "${item.name}"`);
  if (item.pricePaise <= 0) {
    throw new CartValidationError(`Invalid price for "${item.name}".`);
  }
  const offer = item.offerPricePaise;
  // Offer must be a positive integer strictly below list price; otherwise ignore
  // (prevents free-item via 0 offer and overcharge via inflated offer).
  if (
    offer != null &&
    typeof offer === "number" &&
    Number.isInteger(offer) &&
    offer > 0 &&
    offer < item.pricePaise
  ) {
    return offer;
  }
  return item.pricePaise;
}

export function calculateAuthoritativeQuote(args: {
  lines: CartLine[];
  catalog: CatalogItem[];
  packagingFeePaise: number;
  deliveryFeePaise: number;
  discountPaise?: number;
  couponDiscountPaise?: number;
  taxPercent?: number;
}): Quote {
  const { lines, catalog } = args;
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new CartValidationError("Cart must contain at least one item.");
  }
  if (lines.length > MAX_LINES) {
    throw new CartValidationError("Cart contains too many items.");
  }
  const packagingFeePaise = assertPaiseInt(args.packagingFeePaise, "packaging fee");
  const deliveryFeePaise = assertPaiseInt(args.deliveryFeePaise, "delivery fee");
  const rawDiscount = args.discountPaise ?? 0;
  const rawCoupon = args.couponDiscountPaise ?? 0;
  if (
    typeof rawDiscount !== "number" || !Number.isFinite(rawDiscount) ||
    typeof rawCoupon !== "number" || !Number.isFinite(rawCoupon)
  ) {
    throw new CartValidationError("Invalid discount.");
  }
  if (!Number.isInteger(Math.round(rawDiscount)) || !Number.isInteger(Math.round(rawCoupon))) {
    throw new CartValidationError("Invalid discount.");
  }
  if (rawDiscount < 0 || rawCoupon < 0) {
    throw new CartValidationError("Invalid discount.");
  }
  const fallbackTax = parseTaxRate(args.taxPercent, 5);
  const catalogMap = new Map(catalog.map(item => [item.id, item]));

  let itemTotalPaise = 0;
  let totalTaxablePaise = 0;
  let totalItemPackaging = 0;
  const lineTotals: number[] = [];
  // Aggregate quantity per item to prevent splitting across lines to bypass max.
  const qtyByItem = new Map<string, number>();

  for (const line of lines) {
    const catalogItem = catalogMap.get(line.menuItemId);
    if (!catalogItem) {
      throw new CartValidationError(`Item "${line.menuItemId}" is not in the menu.`);
    }
    if (catalogItem.availability !== "AVAILABLE") {
      throw new CartValidationError(`"${catalogItem.name}" is currently unavailable.`);
    }
    if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity)) {
      throw new CartValidationError(`Invalid quantity for "${catalogItem.name}".`);
    }
    const maxQty = catalogItem.maxQuantityPerOrder ?? 20;
    if (!Number.isInteger(maxQty) || maxQty < 1) {
      throw new CartValidationError(`Invalid quantity for "${catalogItem.name}".`);
    }
    if (line.quantity < 1 || line.quantity > maxQty) {
      throw new CartValidationError(`Invalid quantity for "${catalogItem.name}".`);
    }
    qtyByItem.set(line.menuItemId, (qtyByItem.get(line.menuItemId) ?? 0) + line.quantity);
    if ((qtyByItem.get(line.menuItemId) ?? 0) > maxQty) {
      throw new CartValidationError(`Invalid quantity for "${catalogItem.name}".`);
    }
    if (catalogItem.stock != null && line.quantity > catalogItem.stock) {
      throw new CartValidationError(`Insufficient stock for "${catalogItem.name}".`);
    }

    // Base price — use validated offer price when beneficial, else list price.
    const effectivePrice = effectiveUnitPrice(catalogItem);
    // Variant upcharge must be a non-negative integer (DB-verified upstream).
    const variantPrice = line.variantPricePaise ?? 0;
    if (typeof variantPrice !== "number" || !Number.isFinite(variantPrice) || !Number.isInteger(variantPrice) || variantPrice < 0 || variantPrice > PG_INT_MAX) {
      throw new CartValidationError(`Invalid variant price for "${catalogItem.name}".`);
    }
    // Modifier upcharges must be non-negative integers; reject duplicates.
    const mods = line.modifiers ?? [];
    const seenOptions = new Set<string>();
    let modSum = 0;
    for (const mod of mods) {
      if (!mod || typeof mod.optionId !== "string" || !mod.optionId) {
        throw new CartValidationError(`Invalid modifier for "${catalogItem.name}".`);
      }
      if (seenOptions.has(mod.optionId)) {
        throw new CartValidationError(`Duplicate modifier for "${catalogItem.name}".`);
      }
      seenOptions.add(mod.optionId);
      if (typeof mod.pricePaise !== "number" || !Number.isFinite(mod.pricePaise) || !Number.isInteger(mod.pricePaise) || mod.pricePaise < 0 || mod.pricePaise > PG_INT_MAX) {
        throw new CartValidationError(`Invalid modifier price for "${catalogItem.name}".`);
      }
      modSum += mod.pricePaise;
      if (!Number.isSafeInteger(modSum)) {
        throw new CartValidationError(`Invalid modifier price for "${catalogItem.name}".`);
      }
    }
    const lineTotal = effectivePrice * line.quantity;
    const variantUpcharge = variantPrice * line.quantity;
    const modifierUpcharge = modSum * line.quantity;
    for (const v of [lineTotal, variantUpcharge, modifierUpcharge]) {
      if (!Number.isSafeInteger(v) || v < 0 || v > PG_INT_MAX) {
        throw new CartValidationError(`Invalid quantity for "${catalogItem.name}".`);
      }
    }

    const lineItemTotal = lineTotal + variantUpcharge + modifierUpcharge;
    if (!Number.isSafeInteger(lineItemTotal) || lineItemTotal > PG_INT_MAX) {
      throw new CartValidationError(`Invalid quantity for "${catalogItem.name}".`);
    }
    lineTotals.push(lineItemTotal);
    itemTotalPaise += lineItemTotal;
    if (!Number.isSafeInteger(itemTotalPaise) || itemTotalPaise > PG_INT_MAX) {
      throw new CartValidationError("Cart total exceeds maximum allowed value.");
    }
    totalTaxablePaise += lineItemTotal;
    const itemPack = catalogItem.packagingFeePaise ?? 0;
    if (typeof itemPack !== "number" || !Number.isFinite(itemPack) || !Number.isInteger(itemPack) || itemPack < 0 || itemPack > PG_INT_MAX) {
      throw new CartValidationError(`Invalid packaging fee for "${catalogItem.name}".`);
    }
    totalItemPackaging += itemPack * line.quantity;
    if (!Number.isSafeInteger(totalItemPackaging) || totalItemPackaging > PG_INT_MAX) {
      throw new CartValidationError("Cart total exceeds maximum allowed value.");
    }
  }

  // Apply restaurant-level packaging if items don't have individual packaging
  const packagingFee = totalItemPackaging > 0 ? totalItemPackaging : packagingFeePaise;

  // Combined discounts (general + coupon), capped to item total. Tax applies net of discounts.
  const discountPaise = Math.min(Math.round(rawDiscount), itemTotalPaise);
  const couponDiscountPaise = Math.min(Math.round(rawCoupon), Math.max(0, itemTotalPaise - discountPaise));
  const totalDiscountPaise = discountPaise + couponDiscountPaise;
  const netTaxablePaise = Math.max(0, totalTaxablePaise - totalDiscountPaise);

  // Tax calculation on (itemTotal - discounts), before packaging/delivery.
  // Per-item rates are used only when an ORDERED line carries a valid rate;
  // a 0% item stays 0% (never falls back to the restaurant rate).
  const orderedItems = lines.map(l => catalogMap.get(l.menuItemId)!);
  // Enter per-item path when any ORDERED line carries an explicit valid rate
  // (including 0% zero-rated items — they must stay 0, not inherit the fallback).
  const hasPerItemTax = orderedItems.some(c => {
    if (c.taxPercent == null) return false;
    const t = parseFloat(String(c.taxPercent));
    return Number.isFinite(t) && t >= 0 && t <= 100;
  });
  let taxPaise = 0;
  if (hasPerItemTax) {
    // Allocate total discount proportionally; last line takes the remainder
    // so rounded shares always sum exactly to totalDiscountPaise.
    const shares: number[] = [];
    let allocated = 0;
    for (let i = 0; i < lines.length; i++) {
      if (i < lines.length - 1) {
        const share = itemTotalPaise > 0 ? Math.round((lineTotals[i] / itemTotalPaise) * totalDiscountPaise) : 0;
        shares.push(share);
        allocated += share;
      } else {
        shares.push(Math.max(0, totalDiscountPaise - allocated));
      }
    }
    for (let i = 0; i < lines.length; i++) {
      const catalogItem = catalogMap.get(lines[i].menuItemId)!;
      const lineNet = Math.max(0, lineTotals[i] - shares[i]);
      const rawRate = parseFloat(String(catalogItem.taxPercent ?? ""));
      const rate = Number.isFinite(rawRate) && rawRate >= 0 && rawRate <= 100
        ? rawRate
        : fallbackTax;
      taxPaise += Math.round((lineNet * rate) / 100);
    }
  } else {
    taxPaise = Math.round((netTaxablePaise * fallbackTax) / 100);
  }

  // Grand total
  const totalPaise = Math.max(0, itemTotalPaise - totalDiscountPaise + packagingFee + deliveryFeePaise + taxPaise);
  for (const v of [itemTotalPaise, discountPaise, couponDiscountPaise, packagingFee, deliveryFeePaise, taxPaise, totalPaise]) {
    if (!Number.isSafeInteger(v) || v < 0 || v > PG_INT_MAX) {
      throw new CartValidationError("Cart total exceeds maximum allowed value.");
    }
  }

  return {
    itemTotalPaise,
    discountPaise,
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

  if (typeof cartTotalPaise !== "number" || !Number.isFinite(cartTotalPaise) || !Number.isInteger(cartTotalPaise) || cartTotalPaise < 0) {
    return { valid: false, discountPaise: 0, error: "Invalid cart total." };
  }
  if (typeof coupon.minOrderPaise !== "number" || !Number.isFinite(coupon.minOrderPaise) || coupon.minOrderPaise < 0) {
    return { valid: false, discountPaise: 0, error: "This coupon is not valid." };
  }
  if (typeof coupon.discountValue !== "number" || !Number.isFinite(coupon.discountValue) || coupon.discountValue < 0) {
    return { valid: false, discountPaise: 0, error: "This coupon is not valid." };
  }
  if (coupon.discountType === "percent" && coupon.discountValue > 100) {
    return { valid: false, discountPaise: 0, error: "This coupon is not valid." };
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

  // Calculate discount (integer paise, never negative, never exceeds cart).
  let discountPaise: number;
  if (coupon.discountType === "flat") {
    discountPaise = Math.min(Math.round(coupon.discountValue), cartTotalPaise);
  } else {
    discountPaise = Math.round(cartTotalPaise * coupon.discountValue / 100);
  }
  if (!Number.isFinite(discountPaise) || discountPaise < 0) {
    return { valid: false, discountPaise: 0, error: "This coupon is not valid." };
  }
  discountPaise = Math.min(discountPaise, cartTotalPaise);

  // Cap at max discount (ignore malformed negative/NaN caps).
  if (coupon.maxDiscountPaise != null) {
    const cap = coupon.maxDiscountPaise;
    if (typeof cap === "number" && Number.isFinite(cap) && cap >= 0) {
      discountPaise = Math.min(discountPaise, Math.round(cap), cartTotalPaise);
    }
  }

  return { valid: true, discountPaise };
}
