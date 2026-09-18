import type { FoodKind, MenuItem } from "@/lib/types";

export type { FoodKind } from "@/lib/types";

export type CartLine = {
  id: string;
  item: MenuItem;
  quantity: number;
  note?: string;
  modifiers?: string[];
  /** Real DB addon option IDs (server-validated) for this line. */
  modifierOptionIds?: string[];
  /** Real DB variant ID (server-validated upcharge) for this line. */
  selectedVariantId?: string;
  unitPrice: number;
};

export type Filter = "all" | FoodKind | "bestseller";

export const kindCopy: Record<FoodKind, string> = {
  veg: "Vegetarian",
  nonveg: "Non-vegetarian",
  egg: "Contains egg",
};

/**
 * Normalize an Indian mobile number identically for every OTP path.
 * Mirrors the server (phoneValidation.normalizePhone): strip non-digits,
 * drop a leading 91 country code (12 digits) or trunk 0 (11 digits).
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isValidPhoneInput(input: string): boolean {
  return normalizePhone(input).length >= 10;
}
