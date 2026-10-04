/**
 * Packaging and stock aggregation.
 *
 * Two defects that made the quote disagree with what the kitchen could actually
 * fulfil:
 *
 *  1. Per-item packaging silently replaced the restaurant fee for the WHOLE cart.
 *     `menu_items.packaging_fee_paise` is nullable and defaults to NULL, and the
 *     old code summed only per-item fees, then used that sum for every line if it
 *     was non-zero. One dish carrying a ₹10 packaging fee therefore cancelled the
 *     restaurant's ₹25 fee on every other line in the basket.
 *
 *  2. Stock was checked per LINE while max-quantity was deliberately aggregated
 *     "to prevent splitting across lines to bypass max". Every customisation add
 *     mints a fresh cart line, so stock 5 + two lines of 3 quoted fine for 6 units
 *     and then failed at the atomic decrement during checkout.
 */
import { describe, it, expect } from "vitest";
import {
  calculateAuthoritativeQuote,
  CartValidationError,
  type CatalogItem,
  type CartLine,
} from "./orderPricing";

const RESTAURANT_PACKAGING = 2_500; // ₹25
const item = (over: Partial<CatalogItem> = {}): CatalogItem => ({
  id: "dish",
  name: "Paneer Tikka",
  pricePaise: 20_000,
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

const quote = (lines: CartLine[], catalog: CatalogItem[], packagingFeePaise = RESTAURANT_PACKAGING) =>
  calculateAuthoritativeQuote({
    lines,
    catalog,
    packagingFeePaise,
    deliveryFeePaise: 0,
    taxPercent: 0, // isolate packaging from tax arithmetic
  });

describe("packaging fee", () => {
  it("charges the flat restaurant fee when no dish has its own", () => {
    const r = quote([line()], [item()]);
    expect(r.packagingFeePaise).toBe(RESTAURANT_PACKAGING);
  });

  it("keeps the restaurant fee flat per ORDER, not per item", () => {
    // The restaurant fee is a per-order charge and must not scale with the
    // basket — that is the behaviour the original pricing tests pin.
    const r = quote([line({ quantity: 5 })], [item()]);
    expect(r.packagingFeePaise).toBe(RESTAURANT_PACKAGING);
  });

  it("adds per-dish packaging on top of the restaurant fee", () => {
    // THE REGRESSION: item A has its own ₹10 packaging. Previously the non-zero
    // per-item sum REPLACED the restaurant's ₹25 for the whole basket, so the
    // kitchen paid for the box and charged the customer nothing for it.
    const r = quote(
      [line({ menuItemId: "a", quantity: 1 }), line({ menuItemId: "b", quantity: 2 })],
      [
        item({ id: "a", packagingFeePaise: 1_000 }),
        item({ id: "b", packagingFeePaise: null }),
      ]
    );
    expect(r.packagingFeePaise).toBe(RESTAURANT_PACKAGING + 1_000);
  });

  it("multiplies only the per-dish part by quantity", () => {
    const r = quote([line({ quantity: 3 })], [item({ packagingFeePaise: 500 })]);
    expect(r.packagingFeePaise).toBe(RESTAURANT_PACKAGING + 1_500);
  });

  it("ignores a 0 per-dish fee (the column default is 0)", () => {
    const r = quote([line()], [item({ packagingFeePaise: 0 })]);
    expect(r.packagingFeePaise).toBe(RESTAURANT_PACKAGING);
  });

  it("charges only the restaurant fee when it is zero and no dish overrides", () => {
    const r = quote([line({ quantity: 2 })], [item()], 0);
    expect(r.packagingFeePaise).toBe(0);
  });

  it("charges only per-dish packaging when the restaurant fee is zero", () => {
    const r = quote([line({ quantity: 2 })], [item({ packagingFeePaise: 300 })], 0);
    expect(r.packagingFeePaise).toBe(600);
  });
});

describe("stock aggregation", () => {
  it("rejects a basket split across lines that exceeds stock", () => {
    // THE REGRESSION: stock 5, two lines of 3 -> 6 units.
    expect(() =>
      quote(
        [line({ quantity: 3 }), line({ quantity: 3 })],
        [item({ stock: 5 })]
      )
    ).toThrow(CartValidationError);
  });

  it("allows a split basket that stays within stock", () => {
    const r = quote(
      [line({ quantity: 3 }), line({ quantity: 2 })],
      [item({ stock: 5 })]
    );
    expect(r.itemTotalPaise).toBe(100_000);
  });

  it("still rejects a single line over stock", () => {
    expect(() => quote([line({ quantity: 6 })], [item({ stock: 5 })])).toThrow(
      CartValidationError
    );
  });

  it("tracks stock per item, not globally", () => {
    const r = quote(
      [line({ menuItemId: "a", quantity: 5 }), line({ menuItemId: "b", quantity: 5 })],
      [item({ id: "a", stock: 5 }), item({ id: "b", stock: 5 })]
    );
    expect(r.itemTotalPaise).toBe(200_000);
  });

  it("treats null stock as uncapped", () => {
    const r = quote([line({ quantity: 20 })], [item({ stock: null })]);
    expect(r.itemTotalPaise).toBe(400_000);
  });

  it("still aggregates max-quantity across lines", () => {
    expect(() =>
      quote(
        [line({ quantity: 6 }), line({ quantity: 6 })],
        [item({ maxQuantityPerOrder: 10 })]
      )
    ).toThrow(CartValidationError);
  });
});
