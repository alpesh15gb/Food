/**
 * Storefront cart interaction regressions.
 *
 * These render for real (react-dom/server) rather than asserting on source
 * text, because the bugs guarded here were all "the control looks right but
 * does nothing" — asserting on the emitted markup is the only way to catch them.
 *
 * The headline regression is the cart stepper, which clamped at 1
 * (`Math.max(1, value - 1)`) and had no removal path, so the cart slide-over
 * could not remove a dish at all.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Quantity from "@/components/storefront/Quantity";
import CartSidebar from "@/components/storefront/CartSidebar";
import type { CartLine } from "@/components/storefront/types";
import type { MenuItem } from "@/lib/types";

const item = (over: Partial<MenuItem> = {}): MenuItem =>
  ({
    id: "biryani",
    name: "Hyderabadi Biryani",
    description: "Spiced rice",
    price: 249,
    kind: "nonveg",
    category: "Mains",
    availability: "AVAILABLE",
    ...over,
  }) as MenuItem;

const line = (over: Partial<CartLine> = {}): CartLine => ({
  id: "biryani-default",
  item: item(),
  quantity: 1,
  unitPrice: 249,
  ...over,
});

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(node);

/** Mirrors Quantity's decrement arithmetic so the emitted value is asserted. */
const decrementEmits = (value: number, min = 1, removable = true): number => {
  const atFloor = value <= min;
  const canRemove = removable && min <= 1 && atFloor;
  return canRemove ? 0 : Math.max(min, value - 1);
};

/**
 * Attribute-accurate helpers.
 *
 * A naive `/aria-label="…"[^>]*disabled/` also matches the Tailwind class text
 * `disabled:cursor-not-allowed` that sits in the same tag, so the opening tag is
 * extracted first and only a standalone `disabled` attribute is counted.
 */
const buttonTag = (html: string, label: string): string => {
  const match = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`));
  return match ? match[0] : "";
};
const isDisabled = (html: string, label: string): boolean =>
  /(^|\s)disabled(=|\s|>|$)/.test(buttonTag(html, label));
const plusDisabled = (html: string) => isDisabled(html, "Increase quantity");

describe("Quantity stepper", () => {
  it("emits 0 from a single-quantity line so it can actually be removed", () => {
    // The regression: `Math.max(1, value - 1)` made this emit 1 forever.
    expect(decrementEmits(1)).toBe(0);
    expect(decrementEmits(3)).toBe(2);
    expect(decrementEmits(2)).toBe(1);
  });

  it("never reports 0 when removal is not allowed", () => {
    // The customisation drawer adds a new line; a 0 there would put a
    // zero-quantity line in the cart.
    expect(decrementEmits(1, 1, false)).toBe(1);
  });

  it("offers an explicit remove affordance at the floor", () => {
    const atFloor = render(<Quantity value={1} onChange={() => {}} />);
    expect(atFloor).toContain('aria-label="Remove item"');
    expect(atFloor).toContain('aria-label="Increase quantity"');
    expect(plusDisabled(atFloor)).toBe(false);

    const aboveFloor = render(<Quantity value={2} onChange={() => {}} />);
    expect(aboveFloor).toContain('aria-label="Decrease quantity"');
    expect(aboveFloor).not.toContain('aria-label="Remove item"');
  });

  it("disables the decrement instead of removing when removable is false", () => {
    const html = render(<Quantity value={1} onChange={() => {}} removable={false} />);
    expect(html).not.toContain('aria-label="Remove item"');
    expect(isDisabled(html, "Decrease quantity")).toBe(true);
  });

  it("keeps removal live but freezes plus when the dish cannot be increased", () => {
    const html = render(<Quantity value={1} onChange={() => {}} canIncrease={false} />);
    // A sold-out line must still be removable, so minus is never disabled.
    expect(html).toContain('aria-label="Remove item"');
    expect(isDisabled(html, "Remove item")).toBe(false);
    expect(plusDisabled(html)).toBe(true);
  });

  it("honours a custom remove label for screen readers", () => {
    const html = render(
      <Quantity value={1} onChange={() => {}} removeLabel="Remove Paneer Tikka" />
    );
    expect(html).toContain('aria-label="Remove Paneer Tikka"');
  });

  it("grows the number well for three-digit quantities", () => {
    // A fixed w-6 well clipped "100".
    const html = render(<Quantity value={100} onChange={() => {}} />);
    expect(html).toContain("min-w-6");
    expect(html).not.toMatch(/class="w-6 /);
  });

  it("freezes plus at the ceiling so the server never rejects the whole quote", () => {
    // Tapping "+" past maxQuantityPerOrder made the server THROW, which failed
    // the cart quote entirely and left a permanent "We could not price your cart".
    const atCeiling = render(<Quantity value={20} onChange={() => {}} max={20} />);
    expect(isDisabled(atCeiling, "Increase quantity")).toBe(true);
    expect(atCeiling).toContain("Maximum 20 per order");

    const belowCeiling = render(<Quantity value={19} onChange={() => {}} max={20} />);
    expect(isDisabled(belowCeiling, "Increase quantity")).toBe(false);
  });

  it("keeps minus live at the ceiling so a line is never stuck", () => {
    const html = render(<Quantity value={20} onChange={() => {}} max={20} />);
    expect(isDisabled(html, "Decrease quantity")).toBe(false);
  });

  it("treats no max as unbounded", () => {
    const html = render(<Quantity value={99} onChange={() => {}} />);
    expect(isDisabled(html, "Increase quantity")).toBe(false);
  });

  it("combines a sold-out freeze with a ceiling without disabling removal", () => {
    const html = render(
      <Quantity value={1} onChange={() => {}} canIncrease={false} max={20} />
    );
    expect(isDisabled(html, "Increase quantity")).toBe(true);
    expect(isDisabled(html, "Remove item")).toBe(false);
  });
});

describe("CartSidebar", () => {
  const base = {
    total: 289,
    itemTotal: 249,
    packaging: 15,
    delivery: 25,
    taxes: 0,
    onQuantity: () => {},
    onCheckout: () => {},
    processing: false,
    customerPhone: "9876543210",
    onCustomerPhone: () => {},
  };

  it("counts total quantity, not the number of cart lines", () => {
    // 3 x biryani in ONE line must read "3 items", not "1 items".
    const html = render(
      <CartSidebar {...base} cart={[line({ quantity: 3 })]} totalQuantity={3} />
    );
    expect(html).toContain("3 items");
    expect(html).not.toContain("1 item<");
  });

  it("uses the singular for a single item", () => {
    const html = render(<CartSidebar {...base} cart={[line()]} totalQuantity={1} />);
    expect(html).toContain("1 item<");
  });

  it("exposes a working remove control for every cart line", () => {
    const html = render(<CartSidebar {...base} cart={[line()]} totalQuantity={1} />);
    expect(html).toContain('aria-label="Remove Hyderabadi Biryani"');
  });

  it("gates the CTA on the minimum-order gap, not the grand total", () => {
    // itemTotal 249 is under the 300 minimum while `total` (249 + fees) is not.
    // The server compares the ITEM total, so the CTA must stay disabled and the
    // gap must be shown, or the customer is walked into a hard failure.
    const html = render(
      <CartSidebar
        {...base}
        total={400}
        cart={[line()]}
        totalQuantity={1}
        amountToMinOrder={51}
      />
    );
    expect(html).toContain("Add ₹51 more for minimum order");
    expect(html).toMatch(/<button[^>]*\sdisabled=""/);
    expect(html).toContain("Checkout");
  });

  it("enables the CTA once the minimum-order gap is closed", () => {
    const html = render(
      <CartSidebar
        {...base}
        cart={[line({ quantity: 2 })]}
        totalQuantity={2}
        itemTotal={498}
        total={538}
        amountToMinOrder={0}
      />
    );
    expect(html).not.toContain("more for minimum order");
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("hides the coupon verdict while the server is still repricing", () => {
    // Validating on every keystroke used to flash `Coupon "S" is not valid`
    // under the field while the customer was still typing.
    const pending = render(
      <CartSidebar
        {...base}
        cart={[line()]}
        totalQuantity={1}
        couponCode="S"
        onCouponCodeChange={() => {}}
        couponError={'Coupon "S" is not valid for this restaurant.'}
        pricingPending
      />
    );
    expect(pending).not.toContain("is not valid for this restaurant");
    expect(pending).toContain("Updating total");

    const settled = render(
      <CartSidebar
        {...base}
        cart={[line()]}
        totalQuantity={1}
        couponCode="SAVE20"
        onCouponCodeChange={() => {}}
        couponError={'Coupon "SAVE20" is not valid for this restaurant.'}
        pricingPending={false}
      />
    );
    expect(settled).toContain("is not valid for this restaurant");
  });

  it("itemises the coupon so the reduced total is explainable", () => {
    const html = render(
      <CartSidebar
        {...base}
        cart={[line()]}
        totalQuantity={1}
        couponCode="save20"
        onCouponCodeChange={() => {}}
        couponApplied
        couponDiscount={20}
        total={269}
      />
    );
    expect(html).toContain("SAVE20");
    expect(html).toContain("you saved");
  });

  it("marks sold-out lines and still offers a way to remove them", () => {
    const soldOut = line({
      id: "biryani-1",
      item: item({ availability: "SOLD_OUT" }),
    });
    const html = render(
      <CartSidebar
        {...base}
        cart={[soldOut]}
        totalQuantity={1}
        soldOutLineIds={new Set([soldOut.id])}
      />
    );
    expect(html).toContain("Sold out");
    expect(html).toContain('aria-label="Remove Hyderabadi Biryani"');
    expect(plusDisabled(html)).toBe(true);
  });

  it("freezes a line's plus at the per-item ceiling", () => {
    const html = render(
      <CartSidebar
        {...base}
        cart={[line({ quantity: 20 })]}
        totalQuantity={20}
        maxQuantityFor={() => 20}
      />
    );
    expect(plusDisabled(html)).toBe(true);
  });

  it("keeps plus live below the ceiling", () => {
    const html = render(
      <CartSidebar
        {...base}
        cart={[line({ quantity: 2 })]}
        totalQuantity={2}
        maxQuantityFor={() => 20}
      />
    );
    expect(plusDisabled(html)).toBe(false);
  });
});
