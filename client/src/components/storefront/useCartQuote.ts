import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { CartLine } from "./types";

/**
 * useCartQuote — server-authoritative cart pricing.
 *
 * The storefront used to compute its own totals: a hardcoded 5% GST applied to
 * (itemTotal + packaging). Checkout computes tax on (itemTotal − discounts) and
 * excludes packaging, so the number the customer saw was regularly different from
 * the number they were charged — a 12% or 18% GST restaurant was quoted a flat 5%.
 *
 * This hook asks the server (`storefront.quote`) for the same arithmetic checkout
 * runs. While the request is in flight it returns `null` so the caller can keep
 * showing its local estimate; the UI must therefore never *require* this hook's
 * answer, only prefer it.
 */
export type CartQuote = {
  itemTotalPaise: number;
  discountPaise: number;
  couponDiscountPaise: number;
  packagingFeePaise: number;
  deliveryFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  couponError?: string;
  couponApplied: boolean;
  taxPercent: number;
  minOrderPaise: number;
  belowMinimum: boolean;
  amountToMinOrderPaise: number;
};

const PAISE = 100;

function toRupees(paise: number): number {
  return paise / PAISE;
}

export function useCartQuote(args: {
  slug: string | undefined;
  cart: CartLine[];
  couponCode?: string;
  enabled?: boolean;
}): {
  quote: CartQuote | null;
  /** Server totals in rupees, or null while the first quote is still loading. */
  rupees: {
    itemTotal: number;
    packaging: number;
    delivery: number;
    taxes: number;
    grandTotal: number;
  } | null;
  isFetching: boolean;
  isError: boolean;
  errorMessage: string | undefined;
} {
  const { slug, cart, couponCode, enabled = true } = args;

  const lines = useMemo(
    () =>
      cart.map((line) => ({
        menuItemId: line.item.id,
        quantity: line.quantity,
        modifierOptionIds: line.modifierOptionIds?.length ? line.modifierOptionIds : undefined,
        selectedVariantId: line.selectedVariantId ?? undefined,
      })),
    [cart],
  );

  const normalizedCoupon = couponCode?.trim().toUpperCase() || undefined;

  const query = trpc.storefront.quote.useQuery(
    { slug: slug ?? "", lines, ...(normalizedCoupon ? { couponCode: normalizedCoupon } : {}) },
    {
      enabled: enabled && !!slug && lines.length > 0,
      staleTime: 30_000,
      retry: 1,
      // Keep the previous total on screen instead of flashing a zero while refetching.
      placeholderData: (previous) => previous,
    },
  );

  const quote = (query.data as CartQuote | undefined) ?? null;

  const rupees = useMemo(() => {
    if (!quote) return null;
    return {
      itemTotal: toRupees(quote.itemTotalPaise),
      packaging: toRupees(quote.packagingFeePaise),
      delivery: toRupees(quote.deliveryFeePaise),
      taxes: toRupees(quote.taxPaise),
      grandTotal: toRupees(quote.totalPaise),
    };
  }, [quote]);

  const errorMessage = query.error instanceof Error ? query.error.message : undefined;

  return { quote, rupees, isFetching: query.isFetching, isError: query.isError, errorMessage };
}

export { toRupees };