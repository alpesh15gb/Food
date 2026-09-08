import type { FoodKind, MenuItem } from "@/lib/types";

export type { FoodKind } from "@/lib/types";

export type CartLine = {
  id: string;
  item: MenuItem;
  quantity: number;
  note?: string;
  modifiers?: string[];
  unitPrice: number;
};

export type Filter = "all" | FoodKind | "bestseller";

export const kindCopy: Record<FoodKind, string> = {
  veg: "Vegetarian",
  nonveg: "Non-vegetarian",
  egg: "Contains egg",
};
