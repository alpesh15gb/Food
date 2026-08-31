/**
 * Order Pricing Tests — verify server-side calculations, coupon validation,
 * stock checks, and minimum order enforcement.
 */
import { describe, expect, it } from "vitest";
import {
  calculateAuthoritativeQuote,
  validateCoupon,
  CartValidationError,
} from "./orderPricing";

describe("calculateAuthoritativeQuote", () => {
  const catalog = [
    { id: "burger", name: "Paneer Burger", pricePaise: 24900, availability: "AVAILABLE", stock: null, maxQuantityPerOrder: 10 },
    { id: "fries", name: "Masala Fries", pricePaise: 14900, availability: "AVAILABLE", stock: null, maxQuantityPerOrder: 5 },
  ];

  it("calculates fees and tax from the authoritative menu price", () => {
    const quote = calculateAuthoritativeQuote({
      lines: [{ menuItemId: "burger", quantity: 2 }],
      catalog,
      packagingFeePaise: 2500,
      deliveryFeePaise: 3900,
      taxPercent: 5,
    });
    expect(quote.itemTotalPaise).toBe(49800);
    expect(quote.taxPaise).toBe(2490); // 5% of 49800
    expect(quote.totalPaise).toBe(49800 + 2500 + 3900 + 2490);
  });

  it("rejects unavailable items", () => {
    expect(() =>
      calculateAuthoritativeQuote({
        lines: [{ menuItemId: "burger", quantity: 1 }],
        catalog: [{ ...catalog[0], availability: "SOLD_OUT" }],
        packagingFeePaise: 0,
        deliveryFeePaise: 0,
      })
    ).toThrow(CartValidationError);
  });

  it("rejects items not in catalog", () => {
    expect(() =>
      calculateAuthoritativeQuote({
        lines: [{ menuItemId: "nonexistent", quantity: 1 }],
        catalog,
        packagingFeePaise: 0,
        deliveryFeePaise: 0,
      })
    ).toThrow(CartValidationError);
  });

  it("applies offer price when available", () => {
    const catalogWithOffer = [{ ...catalog[0], offerPricePaise: 19900 }];
    const quote = calculateAuthoritativeQuote({
      lines: [{ menuItemId: "burger", quantity: 1 }],
      catalog: catalogWithOffer,
      packagingFeePaise: 0,
      deliveryFeePaise: 0,
    });
    expect(quote.itemTotalPaise).toBe(19900);
  });

  it("applies coupon discount", () => {
    const quote = calculateAuthoritativeQuote({
      lines: [{ menuItemId: "burger", quantity: 2 }],
      catalog,
      packagingFeePaise: 2500,
      deliveryFeePaise: 3900,
      couponDiscountPaise: 10000,
    });
    expect(quote.couponDiscountPaise).toBe(10000);
    expect(quote.totalPaise).toBe(49800 - 10000 + 2500 + 3900 + 2490);
  });

  it("caps coupon discount at item total", () => {
    const quote = calculateAuthoritativeQuote({
      lines: [{ menuItemId: "burger", quantity: 1 }],
      catalog,
      packagingFeePaise: 0,
      deliveryFeePaise: 0,
      couponDiscountPaise: 999999,
    });
    expect(quote.couponDiscountPaise).toBe(24900);
  });

  it("rejects zero quantity", () => {
    expect(() =>
      calculateAuthoritativeQuote({
        lines: [{ menuItemId: "burger", quantity: 0 }],
        catalog,
        packagingFeePaise: 0,
        deliveryFeePaise: 0,
      })
    ).toThrow(CartValidationError);
  });

  it("rejects quantity exceeding max", () => {
    expect(() =>
      calculateAuthoritativeQuote({
        lines: [{ menuItemId: "burger", quantity: 999 }],
        catalog,
        packagingFeePaise: 0,
        deliveryFeePaise: 0,
      })
    ).toThrow(CartValidationError);
  });

  it("includes modifier upcharges", () => {
    const quote = calculateAuthoritativeQuote({
      lines: [{
        menuItemId: "burger",
        quantity: 1,
        modifiers: [
          { optionId: "opt1", name: "Extra cheese", pricePaise: 7000 },
          { optionId: "opt2", name: "Jalapeño", pricePaise: 4000 },
        ],
      }],
      catalog,
      packagingFeePaise: 0,
      deliveryFeePaise: 0,
    });
    expect(quote.itemTotalPaise).toBe(24900 + 7000 + 4000);
  });

  it("never returns negative totals", () => {
    const quote = calculateAuthoritativeQuote({
      lines: [{ menuItemId: "burger", quantity: 1 }],
      catalog,
      packagingFeePaise: 0,
      deliveryFeePaise: 0,
      couponDiscountPaise: 999999,
    });
    expect(quote.totalPaise).toBeGreaterThanOrEqual(0);
  });
});

describe("validateCoupon", () => {
  const baseCoupon = {
    code: "TEST100",
    discountType: "flat" as const,
    discountValue: 10000,
    minOrderPaise: 20000,
    maxDiscountPaise: null as number | null,
    isActive: true,
    startsAt: null as Date | null,
    endsAt: null as Date | null,
    isNewCustomerOnly: false,
  };

  it("validates a flat coupon", () => {
    const result = validateCoupon({
      coupon: baseCoupon,
      cartTotalPaise: 30000,
      now: new Date(),
    });
    expect(result.valid).toBe(true);
    expect(result.discountPaise).toBe(10000);
  });

  it("validates a percentage coupon", () => {
    const result = validateCoupon({
      coupon: { ...baseCoupon, discountType: "percent", discountValue: 10 },
      cartTotalPaise: 30000,
      now: new Date(),
    });
    expect(result.valid).toBe(true);
    expect(result.discountPaise).toBe(3000);
  });

  it("rejects expired coupon", () => {
    const result = validateCoupon({
      coupon: { ...baseCoupon, endsAt: new Date("2020-01-01") },
      cartTotalPaise: 30000,
      now: new Date(),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("rejects coupon below minimum order", () => {
    const result = validateCoupon({
      coupon: { ...baseCoupon, minOrderPaise: 50000 },
      cartTotalPaise: 30000,
      now: new Date(),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Minimum order");
  });

  it("rejects inactive coupon", () => {
    const result = validateCoupon({
      coupon: { ...baseCoupon, isActive: false },
      cartTotalPaise: 30000,
      now: new Date(),
    });
    expect(result.valid).toBe(false);
  });

  it("applies max discount cap", () => {
    const result = validateCoupon({
      coupon: { ...baseCoupon, discountType: "percent", discountValue: 50, maxDiscountPaise: 20000 },
      cartTotalPaise: 100000,
      now: new Date(),
    });
    expect(result.valid).toBe(true);
    expect(result.discountPaise).toBe(20000);
  });

  it("rejects new-customer-only coupon for returning customer", () => {
    const result = validateCoupon({
      coupon: { ...baseCoupon, isNewCustomerOnly: true },
      cartTotalPaise: 30000,
      now: new Date(),
      customerOrderCount: 3,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("new customers");
  });
});
