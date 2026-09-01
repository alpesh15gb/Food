/** Cloud Kitchen data model: API-shaped restaurant configuration and menu types. */
export type Availability = "AVAILABLE" | "SOLD_OUT" | "SCHEDULED_UNAVAILABLE";
export type FoodKind = "veg" | "nonveg" | "egg";

export type MenuItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image?: string;
  kind: FoodKind;
  tag?: string;
  availability: Availability;
  availableNote?: string;
  customizable?: boolean;
  isBestseller?: boolean;
  isRecommended?: boolean;
  spiceLevel?: number;
};

export type Category = {
  id: string;
  name: string;
  emoji?: string;
  isOpen: boolean;
};

export type Collection = {
  name: string;
  items: MenuItem[];
};

export const formatINR = (value: number) =>
  `₹${Math.round(value).toLocaleString("en-IN")}`;
