/**
 * GST resolution.
 *
 * Regression: menu_items.tax_percent defaulted to "0" and createMenuItem
 * hardcoded "0", so every dish looked deliberately zero-rated. `hasPerItemTax`
 * was therefore true for essentially every cart, which forced the per-item
 * branch, where each line is taxed at ITS OWN rate — so taxPaise was 0 on every
 * order and the restaurant's configured gst_percentage was never collected. The
 * quote even returned `taxPercent: 5` next to `taxPaise: 0`.
 *
 * The contract these tests pin:
 *   taxPercent == null -> inherit the restaurant rate
 *   taxPercent == "0"  -> a genuinely zero-rated item, stays 0
 *   taxPercent == "12" -> use 12%
 */
import { describe, it, expect } from "vitest";
import {
  calculateAuthoritativeQuote,
  type CatalogItem,
  type CartLine,
} from "./orderPricing";

const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: "dish",
  name: "Paneer Tikka",
  pricePaise: 20_000, // ₹200
  availability: "AVAILABLE",
  taxPercent: null,
  packagingFeePaise: null,
  stock: null,
  maxQuantityPerOrder: 20,
  ...over,
});

const line = (over: Partial<CartLine> = {}): CartLine => ({
  menuItemId: "dish",
  quantity: 1,
  ...over,
});

const quote = (args: {
  catalog: CatalogItem[];
  lines?: CartLine[];
  taxPercent?: number;
  couponDiscountPaise?: number;
  packagingFeePaise?: number;
  deliveryFeePaise?: number;
}) =>
  calculateAuthoritativeQuote({
    lines: args.lines ?? [line()],
    catalog: args.catalog,
    packagingFeePaise: args.packagingFeePaise ?? 0,
    deliveryFeePaise: args.deliveryFeePaise ?? 0,
    couponDiscountPaise: args.couponDiscountPaise ?? 0,
    taxPercent: args.taxPercent ?? 5,
  });

describe("GST resolution", () => {
  it("inherits the restaurant rate when an item has no per-item rate", () => {
    // THE REGRESSION. taxPercent: null must NOT be read as 0%.
    const r = quote({ catalog: [item({ taxPercent: null })], taxPercent: 5 });
    expect(r.taxPaise).toBe(1_000); // 5% of ₹200
    expect(r.totalPaise).toBe(21_000);
  });

  it("collects a 12% and an 18% restaurant rate", () => {
    expect(quote({ catalog: [item()], taxPercent: 12 }).taxPaise).toBe(2_400);
    expect(quote({ catalog: [item()], taxPercent: 18 }).taxPaise).toBe(3_600);
  });

  it("treats an explicit 0 as a genuinely zero-rated item", () => {
    // Preserved on purpose: a zero-rated dish must not silently inherit 5%.
    const r = quote({ catalog: [item({ taxPercent: "0" })], taxPercent: 5 });
    expect(r.taxPaise).toBe(0);
    expect(r.totalPaise).toBe(20_000);
  });

  it("keeps a zero-rated item at 0 while its siblings pay the restaurant rate", () => {
    const r = quote({
      catalog: [
        item({ id: "plain", taxPercent: null }),
        item({ id: "zero", taxPercent: "0" }),
      ],
      lines: [line({ menuItemId: "plain" }), line({ menuItemId: "zero" })],
      taxPercent: 5,
    });
    // Only the plain dish is taxed: 5% of ₹200 = ₹10.
    expect(r.itemTotalPaise).toBe(40_000);
    expect(r.taxPaise).toBe(1_000);
  });

  it("honours an explicit per-item rate above the restaurant rate", () => {
    const r = quote({
      catalog: [item({ taxPercent: "18" })],
      taxPercent: 5,
    });
    expect(r.taxPaise).toBe(3_600);
  });

  it("excludes packaging from tax", () => {
    const r = quote({
      catalog: [item()],
      taxPercent: 5,
      packagingFeePaise: 1_500,
      deliveryFeePaise: 2_500,
    });
    expect(r.taxPaise).toBe(1_000);
    expect(r.totalPaise).toBe(20_000 + 1_500 + 2_500 + 1_000);
  });

  it("applies a coupon before tax", () => {
    const withCoupon = quote({
      catalog: [item()],
      taxPercent: 5,
      couponDiscountPaise: 5_000,
    });
    // Tax on (200 - 50) = 5% of 150.
    expect(withCoupon.couponDiscountPaise).toBe(5_000);
    expect(withCoupon.taxPaise).toBe(750);
    expect(withCoupon.totalPaise).toBe(15_000 + 750);
  });

  it("falls back to 5% for a malformed stored rate rather than trusting it", () => {
    expect(quote({ catalog: [item({ taxPercent: "abc" })], taxPercent: 5 }).taxPaise).toBe(1_000);
    expect(quote({ catalog: [item({ taxPercent: "250" })], taxPercent: 5 }).taxPaise).toBe(1_000);
  });

  it("never produces a negative or fractional-paise tax", () => {
    const r = quote({ catalog: [item()], taxPercent: 5, couponDiscountPaise: 20_000 });
    expect(Number.isInteger(r.taxPaise)).toBe(true);
    expect(r.taxPaise).toBeGreaterThanOrEqual(0);
    expect(r.totalPaise).toBeGreaterThanOrEqual(0);
  });
});
