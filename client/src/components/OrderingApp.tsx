/**
 * Cloud Kitchen Storefront — responsive food ordering app.
 * Mobile-first, inspired by leading Indian food delivery UX patterns.
 * Original premium design, not a copy of any existing brand.
 */
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Bike, Check, ChevronRight, Clock3, Copy,
  Flame, MapPin, Minus, PackageCheck,
  Plus, Search, ShoppingBag, Sparkles, Store,
  TicketPercent, UserRound, Utensils, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SmartImage from "@/components/SmartImage";
import { useNetworkQuality } from "@/lib/network";
import DeliveryLocationDrawer, { type DeliveryLocation } from "@/components/DeliveryLocationDrawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { formatINR, type FoodKind } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { usePlatformHost } from "@/lib/platform";

const PlatformLanding = lazy(() => import("@/pages/PlatformLanding"));
import {
  adaptStorefront,
  type StorefrontAddonGroup,
  type StorefrontMenuItem,
  type StorefrontVariant,
} from "@/lib/storefrontAdapter";

type CartLine = {
  id: string;
  item: StorefrontMenuItem;
  quantity: number;
  note?: string;
  /** Display names for the chosen variant + options. */
  modifiers?: string[];
  /** Real modifier option IDs sent to the server (DB-resolved pricing). */
  modifierOptionIds?: string[];
  /** Real variant ID sent to the server (DB-resolved pricing). */
  selectedVariantId?: string;
  unitPrice: number;
};

type Filter = "all" | FoodKind | "bestseller";

/** Normalize to the 10-digit national number; shared by send + verify. */
function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "").slice(-10);
}

/** Fail fast on non-Indian numbers (server enforces 6–9 start authoritatively). */
function isPlausibleIndianPhone(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizePhone(raw));
}

/** Server caps a line at 20 units — the client clamps to match, never submits over. */
const MAX_LINE_QTY = 20;

function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the random fallback below
  }
  return `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function useIsDesktop(breakpoint = "(min-width: 640px)"): boolean {
  const [desktop, setDesktop] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(breakpoint).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(breakpoint);
    const onChange = (event: MediaQueryListEvent) => setDesktop(event.matches);
    query.addEventListener("change", onChange);
    setDesktop(query.matches);
    return () => query.removeEventListener("change", onChange);
  }, [breakpoint]);
  return desktop;
}

const kindCopy: Record<FoodKind, string> = {
  veg: "Vegetarian",
  nonveg: "Non-vegetarian",
  egg: "Contains egg",
};

function FoodDot({ kind }: { kind: FoodKind }) {
  const colour =
    kind === "veg"
      ? "border-emerald-600 before:bg-emerald-600"
      : kind === "egg"
      ? "border-amber-500 before:bg-amber-500"
      : "border-red-600 before:bg-red-600";
  const shortLabel = kind === "veg" ? "V" : kind === "egg" ? "E" : "NV";
  return (
    <span
      role="img"
      aria-label={kindCopy[kind]}
      title={kindCopy[kind]}
      className={`relative inline-grid h-4 w-4 place-items-center border ${colour} before:h-1.5 before:w-1.5 before:rounded-full`}
    >
      <span className="sr-only">
        {shortLabel} — {kindCopy[kind]}
      </span>
    </span>
  );
}

function BrandMark() {
  return (
    <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#c84630] to-[#e06040] text-white font-display text-lg font-bold">
      SG
    </div>
  );
}

function Quantity({
  value,
  onChange,
  compact = false,
  allowZero = false,
}: {
  value: number;
  onChange: (next: number) => void;
  compact?: boolean;
  /** When true, decrementing at 1 removes the line (qty → 0 delete). */
  allowZero?: boolean;
}) {
  const atMinimum = value <= 1;
  return (
    <div
      className={`inline-flex min-h-[44px] items-center rounded-full border border-[#e7d2bf] bg-[#fffdf8] ${
        compact ? "h-11" : "h-11"
      }`}
    >
      <button
        type="button"
        aria-label={atMinimum && allowZero ? "Remove item" : "Decrease quantity"}
        onClick={() => onChange(atMinimum ? (allowZero ? 0 : 1) : value - 1)}
        className="grid h-full min-h-[44px] w-11 place-items-center rounded-l-full text-[#7f5a45] hover:text-[#c84630] focus-visible:outline-2 focus-visible:outline-[#c84630]"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span aria-live="polite" aria-atomic="true" className="w-5 text-center text-sm font-extrabold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(value + 1)}
        className="grid h-full min-h-[44px] w-11 place-items-center rounded-r-full text-[#7f5a45] hover:text-[#c84630] focus-visible:outline-2 focus-visible:outline-[#c84630]"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function OrderingApp({ slug, trackingNumber }: { slug?: string; trackingNumber?: string }) {
  const [location, navigate] = useLocation();
  const pathSlug = slug || "";
  const hasPathSlug = pathSlug.length >= 2;
  // Restaurant custom-domain roots (9housekitchen.in/) carry no path slug:
  // resolve it from the Host header so the storefront loads directly.
  const hostSlugQuery = trpc.storefront.defaultSlug.useQuery(undefined, {
    enabled: !hasPathSlug,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const hostSlug = !hasPathSlug ? (hostSlugQuery.data?.slug ?? "") : "";
  const storefrontSlug = hasPathSlug ? pathSlug : hostSlug;
  const hasSlug = storefrontSlug.length >= 2;
  const storefrontQuery = trpc.storefront.get.useQuery(
    { slug: storefrontSlug },
    { enabled: hasSlug },
  );
  const paymentConfig = trpc.storefront.paymentConfig.useQuery();
  const initiatePayment = trpc.storefront.initiatePayment.useMutation();
  const verifyPayment = trpc.storefront.verifyPayment.useMutation();
  // Memoized: adaptStorefront builds fresh menu objects, and memoizing keeps
  // the memoized menu rows + category index stable across unrelated renders.
  const storefrontPayload = storefrontQuery.data;
  const storefront = useMemo(
    () => (storefrontPayload ? adaptStorefront(storefrontPayload) : null),
    [storefrontPayload],
  );
  const restaurant = storefront?.restaurant;
  const categories = storefront?.categories ?? [];
  const liveMenu = storefront?.menu ?? [];
  const collections = storefront?.collections ?? [];
  const offers = storefront?.offers ?? [];

  useEffect(() => {
    if (!restaurant?.name) return;
    const prev = document.title;
    document.title = `${restaurant.name} | Direct Ordering`;
    return () => {
      document.title = prev;
    };
  }, [restaurant?.name]);

  useEffect(() => {
    if (!storefront?.theme) return;
    const root = document.documentElement;
    const t = storefront.theme;
    root.style.setProperty("--theme-primary", t.primaryColor);
    root.style.setProperty("--theme-accent", t.accentColor);
    root.style.setProperty("--font-display", t.fontFamily);
    root.style.setProperty("--font-body", t.bodyFontFamily);
    if (t.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.href = t.faviconUrl;
    }
    return () => {
      root.style.removeProperty("--theme-primary");
      root.style.removeProperty("--theme-accent");
      root.style.removeProperty("--font-display");
      root.style.removeProperty("--font-body");
    };
  }, [storefront?.theme]);

  // Route from wouter's location (pathname only) — never window.location.pathname,
  // so in-app navigation updates the screen without a full reload.
  const path = location;
  const searchString = useSearch();
  const segments = path.split("/").filter(Boolean);
  const tail = segments.length > 1 ? segments[segments.length - 1] : "";
  const screen =
    tail === "cart"
      ? "cart"
      : tail === "checkout"
      ? "checkout"
      : tail === "confirmation"
      ? "confirmation"
      : segments[0] === "order"
      ? "tracking"
      : "menu";
  const pathOrderNumber = screen === "tracking" ? segments[1] ?? "" : "";
  const activeOrderNumber = trackingNumber || pathOrderNumber;
  const queryParams = useMemo(
    () => new URLSearchParams(searchString),
    // Subscribe to the search string itself: confirmation/tracking carry
    // ?order=&token=, and the query can change while the pathname stays put.
    [searchString],
  );

  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  // Restaurant logo fallback: show the monogram when no logo or it fails.
  const [logoBroken, setLogoBroken] = useState(false);
  const logoSrc = restaurant?.logo ?? "";
  useEffect(() => setLogoBroken(false), [logoSrc]);
  // Debounced search: the input stays instant, filtering follows ~200ms later.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const clearSearch = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);
  // Low-data mode: skip decorative imagery, show one dismissible notice.
  const { lowData } = useNetworkQuality();
  const [lowDataDismissed, setLowDataDismissed] = useState(false);
  // Active category pill auto-scrolls into view on the mobile rail.
  const activeChipRef = useRef<HTMLButtonElement | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [activeCategory, setActiveCategory] = useState("Menu");
  const [selected, setSelected] = useState<StorefrontMenuItem | null>(null);
  const [customQty, setCustomQty] = useState(1);
  // Real modifier state — variant + option IDs resolved against DB prices.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [cutlery, setCutlery] = useState(false);
  const [processing, setProcessing] = useState(false);
  // Sync guard for double-tap: state lags a render, the ref does not, so a
  // second tap while the first request is in flight is dropped, not reordered.
  const processingRef = useRef(false);
  const stopProcessing = useCallback(() => {
    processingRef.current = false;
    setProcessing(false);
  }, []);
  // Stable idempotency key per checkout attempt: retries reuse it (no dupes),
  // any cart/detail change rotates it (no stale idempotent replays).
  const idempotencyKeyRef = useRef<string | null>(null);
  // Issue 4: Delivery address and phone for checkout
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryLocation | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState(() => localStorage.getItem("ck_phone_prefill") ?? "");
  // Customer auth state — server-side session via HttpOnly cookie
  const [authOpen, setAuthOpen] = useState(false);
  const [otpStep, setOtpStep] = useState<"phone" | "verify">("phone");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const isDesktop = useIsDesktop();
  const sendOtp = trpc.storefront.sendOtp.useMutation();
  const verifyOtp = trpc.storefront.verifyOtp.useMutation();
  const customerLogout = trpc.storefront.customerLogout.useMutation();
  // Fix 2: customerMe reads identity from session cookie, NOT localStorage
  const customerMe = trpc.storefront.customerMe.useQuery();
  const loggedInPhone = customerMe.data?.phone ?? null;

  // Default to the first live category once the menu loads.
  useEffect(() => {
    if (categories.length > 0 && !categories.some((c) => c.name === activeCategory)) {
      setActiveCategory(categories[0].name);
    }
  }, [categories, activeCategory]);

  // Checkout phone: prefill from the device default, plus any unmasked
  // identity the session exposes (the masked display value is never reused).
  useEffect(() => {
    const prefill = localStorage.getItem("ck_phone_prefill");
    if (prefill && !customerPhone) setCustomerPhone(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const sessionPhone = customerMe.data?.phone;
    if (sessionPhone && !sessionPhone.includes("*")) setCustomerPhone(sessionPhone);
  }, [customerMe.data?.phone]);

  // A new checkout attempt whenever the cart or its details change.
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [cart, deliveryAddress, customerPhone, couponCode, deliveryNotes, cutlery]);

  // Resend-cooldown countdown (driven by the server's retryAfterSeconds).
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Coordinate-based serviceability (server-authoritative) — gates checkout.
  const serviceability = trpc.storefront.checkServiceability.useQuery(
    {
      slug: storefrontSlug,
      latitude: deliveryAddress?.latitude ?? 0,
      longitude: deliveryAddress?.longitude ?? 0,
    },
    { enabled: hasSlug && !!deliveryAddress?.confirmed },
  );
  const serviceBlocked = serviceability.data?.serviceable === false;
  const serviceReason = !serviceability.data || serviceability.data.serviceable
    ? null
    : (serviceability.data as { reason?: string }).reason ?? null;

  // Pricing (server-side will validate on checkout)
  const itemTotal = cart.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );
  const packaging = cart.length ? (restaurant?.packagingFee ?? 15) : 0;
  const delivery = cart.length ? (restaurant?.deliveryFee ?? 30) : 0;
  const taxes = Math.round((itemTotal + packaging) * 0.05);
  const grandTotal = Math.max(0, itemTotal + packaging + delivery + taxes);
  const totalQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);

  // Search and filtering (filtering follows the debounced query)
  const results = useMemo(
    () =>
      liveMenu.filter((item) => {
        const needle = debouncedQuery.toLowerCase();
        const matchesSearch =
          !needle ||
          [item.name, item.description, item.category, item.tag, ...(item.tags ?? [])]
            .join(" ")
            .toLowerCase()
            .includes(needle);
        const matchesFilter =
          filter === "all" ||
          filter === item.kind ||
          (filter === "bestseller" && item.isBestseller);
        return matchesSearch && matchesFilter;
      }),
    [liveMenu, debouncedQuery, filter]
  );

  // Quantity of simple (non-customized) lines per menu item — drives the
  // Swiggy-style steppers on menu rows. Customized lines stay unique.
  const cartQtyByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) {
      if (line.id.endsWith("-default")) {
        map.set(line.item.id, (map.get(line.item.id) ?? 0) + line.quantity);
      }
    }
    return map;
  }, [cart]);
  // Ref mirror so the stable simpleAdd callback can enforce the per-line cap
  // without depending on cart (which would bust memoization of every row).
  const cartQtyRef = useRef(cartQtyByItem);
  cartQtyRef.current = cartQtyByItem;

  // Dish counts per category for the desktop index.
  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of liveMenu) {
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [liveMenu]);

  const restaurantOpen = restaurant?.isOpen !== false;
  const closureMessage =
    restaurant?.tempClosureMessage ||
    (restaurant?.opensAt ? `Closed right now · opens ${restaurant.opensAt}` : "Closed right now");

  const changeQty = (id: string, quantity: number) =>
    setCart((current) =>
      quantity < 1
        ? current.filter((line) => line.id !== id)
        : current.map((line) =>
            line.id === id ? { ...line, quantity: Math.min(quantity, MAX_LINE_QTY) } : line
          )
    );

  // Stable reference: passed straight into memoized menu rows.
  const simpleAdd = useCallback(
    (item: StorefrontMenuItem, opts?: { silent?: boolean }) => {
    if (!restaurantOpen) {
      toast.error("The kitchen is closed right now.", { description: closureMessage });
      return;
    }
    if (item.availability !== "AVAILABLE") return;
    const lineId = `${item.id}-default`;
    const currentQty = cartQtyRef.current.get(item.id) ?? 0;
    if (currentQty >= MAX_LINE_QTY) {
      toast.error(`You can add up to ${MAX_LINE_QTY} of an item per order.`);
      return;
    }
    setCart((current) => {
      const found = current.find(
        (line) => line.id === lineId
      );
      return found
        ? current.map((line) =>
            line.id === found.id
              ? { ...line, quantity: Math.min(line.quantity + 1, MAX_LINE_QTY) }
              : line
          )
        : [
            ...current,
            {
              id: lineId,
              item,
              quantity: 1,
              unitPrice: item.price,
            },
          ];
    });
    if (!opts?.silent) toast.success(`${item.name} added to your order`);
    },
    [restaurantOpen, closureMessage],
  );

  // Decrement a simple line from a menu-row stepper (qty → 0 removes it).
  const decrementSimple = useCallback((item: StorefrontMenuItem) => {
    const id = `${item.id}-default`;
    setCart((current) => {
      const found = current.find((line) => line.id === id);
      if (!found) return current;
      return found.quantity <= 1
        ? current.filter((line) => line.id !== id)
        : current.map((line) =>
            line.id === id ? { ...line, quantity: line.quantity - 1 } : line
          );
    });
  }, []);

  // Stepper taps already show the new count inline — no success toast per tap.
  const incrementSilent = useCallback(
    (item: StorefrontMenuItem) => simpleAdd(item, { silent: true }),
    [simpleAdd],
  );

  const openItem = useCallback(
    (item: StorefrontMenuItem) => {
    if (!restaurantOpen) {
      toast.error("The kitchen is closed right now.", { description: closureMessage });
      return;
    }
    if (item.customizable) {
      setSelected(item);
      setCustomQty(1);
      setSelectedVariantId(null);
      setSelectedOptionIds([]);
      setNote("");
    } else {
      simpleAdd(item);
    }
    },
    [restaurantOpen, closureMessage, simpleAdd],
  );

  // Tap-to-apply from the offer strip: fills the checkout coupon field.
  const applyCoupon = useCallback((code: string) => {
    setCouponCode(code);
    toast.success(`Code ${code} added — it will be applied at checkout.`);
  }, []);

  // Category rail: highlight + scroll the section into view below the
  // sticky header/rail (scroll-margin handled by .section-anchor CSS).
  // Also exits search mode — sections don't exist in the flat result list,
  // so scrolling without clearing would silently do nothing.
  const scrollToCategory = useCallback((categoryId: string, categoryName: string) => {
    setQuery("");
    setDebouncedQuery("");
    setActiveCategory(categoryName);
    requestAnimationFrame(() => {
      const el = document.getElementById(`menu-section-${categoryId}`);
      if (!el) return;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  }, []);

  // Keep the active pill visible on the mobile rail (no smooth scrolling —
  // it would fight the user's own scroll position).
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeCategory]);

  const toggleOption = (group: StorefrontAddonGroup, optionId: string) => {
    setSelectedOptionIds((current) => {
      if (current.includes(optionId)) {
        return current.filter((id) => id !== optionId);
      }
      if (group.selectionType === "single") {
        const inGroup = new Set(group.options.map((option) => option.id));
        return [...current.filter((id) => !inGroup.has(id)), optionId];
      }
      const chosenInGroup = group.options.filter((option) => current.includes(option.id)).length;
      if (chosenInGroup >= group.maxSelections) {
        toast.error(`You can pick up to ${group.maxSelections} in ${group.name}.`);
        return current;
      }
      return [...current, optionId];
    });
  };

  const addCustomItem = () => {
    if (!selected) return;
    if (!restaurantOpen) {
      toast.error("The kitchen is closed right now.", { description: closureMessage });
      return;
    }
    const variant = selected.variants?.find((v) => v.id === selectedVariantId) ?? null;
    if (variant && !variant.isAvailable) {
      toast.error(`"${variant.name}" is currently unavailable.`);
      return;
    }
    for (const group of selected.addonGroups ?? []) {
      const chosen = group.options.filter((option) => selectedOptionIds.includes(option.id));
      if (chosen.some((option) => !option.isAvailable)) {
        toast.error("One of the selected add-ons is unavailable.");
        return;
      }
      if (group.isRequired && chosen.length === 0) {
        toast.error(`Please choose an option for "${group.name}".`);
        return;
      }
    }
    const chosenOptions = (selected.addonGroups ?? [])
      .flatMap((group) => group.options)
      .filter((option) => selectedOptionIds.includes(option.id));
    // Display estimate only — the server reprices from DB (paise) authoritatively.
    const unitPrice =
      selected.price +
      (variant ? variant.pricePaise / 100 : 0) +
      chosenOptions.reduce((sum, option) => sum + option.pricePaise / 100, 0);
    const displayNames = [
      ...(variant ? [variant.name] : []),
      ...chosenOptions.map((option) => option.name),
    ];
    setCart((current) => [
      ...current,
      {
        id: `${selected.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        item: selected,
        quantity: Math.min(Math.max(1, customQty), MAX_LINE_QTY),
        unitPrice,
        note,
        modifiers: displayNames,
        modifierOptionIds: chosenOptions.map((option) => option.id),
        selectedVariantId: variant ? variant.id : undefined,
      },
    ]);
    toast.success(`${selected.name} added to your order`);
    setSelected(null);
  };

  // --- Customer Auth Handlers ---
  const cooldownFromError = (err: unknown): string => {
    const message = err instanceof Error ? err.message : "Failed to send code.";
    const match = message.match(/(\d+)\s*seconds?/i);
    if (match) setResendCooldown(Number.parseInt(match[1], 10));
    return message;
  };

  const handleSendOtp = async () => {
    const phone = normalizePhone(otpPhone);
    if (phone.length !== 10) {
      setOtpError("Enter a valid 10-digit phone number.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      await sendOtp.mutateAsync({ phone });
      setOtpStep("verify");
      // Fresh code on its way — drop the stale one and pre-empt the next
      // resend so a double-tap can't SMS-bomb the user before the server
      // rate limit answers.
      setOtpCode("");
      setResendCooldown((current) => (current > 0 ? current : 30));
    } catch (err) {
      setOtpError(cooldownFromError(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      setOtpError("Enter the 6-digit code.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      // Server sets HttpOnly session cookie — no localStorage auth.
      // Same normalization as send: the server keys the OTP by normalized phone.
      const result = await verifyOtp.mutateAsync({ phone: normalizePhone(otpPhone), code: otpCode });
      // Only remember phone for convenience (pre-fill), NOT for auth
      localStorage.setItem("ck_phone_prefill", normalizePhone(otpPhone));
      setCustomerPhone(normalizePhone(otpPhone));
      setAuthOpen(false);
      setOtpStep("phone");
      setOtpPhone("");
      setOtpCode("");
      setResendCooldown(0);
      // Refetch customer session
      customerMe.refetch();
      toast.success(result.isNewUser ? "Welcome! Your account is ready." : "Welcome back!");
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : "Invalid code. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleLogout = async () => {
    // Server clears the HttpOnly session cookie
    try {
      await customerLogout.mutateAsync();
    } catch { /* ignore errors on logout */ }
    setAuthOpen(false);
    customerMe.refetch();
    toast.success("Logged out.");
  };

  // Closing the sheet drops the transient error so reopening never shows
  // a stale failure; the phone/code drafts are kept for convenience.
  const handleAuthOpenChange = (open: boolean) => {
    if (!open) setOtpError("");
    setAuthOpen(open);
  };

  const startSecurePayment = async () => {
    // Drop double-taps: the ref flips synchronously, state settles a render later.
    if (processingRef.current) return;
    if (paymentConfig.isLoading) {
      toast.info("Loading payment options — one moment…");
      return;
    }
    if (!paymentConfig.data?.enabled) {
      toast.error("Online payments are not configured yet.", {
        description:
          "The restaurant administrator can activate Razorpay from the integrations settings.",
      });
      return;
    }
    if (!restaurantOpen) {
      toast.error("The kitchen is closed right now.", { description: closureMessage });
      return;
    }
    if (cart.length === 0) return toast.error("Add items to your cart first.");
    if (grandTotal < (restaurant?.minOrder ?? 0)) {
      return toast.error(
        `Minimum order is ${formatINR(restaurant?.minOrder ?? 0)}`
      );
    }
    // Require confirmed delivery location with coordinates
    if (!deliveryAddress?.confirmed) {
      setLocationOpen(true);
      return toast.error("Please confirm your delivery location first.", {
        description: "Tap on the delivery address bar to set your location.",
      });
    }
    if (normalizePhone(customerPhone).length !== 10 || !isPlausibleIndianPhone(customerPhone)) {
      return toast.error("Please enter your 10-digit phone number.");
    }

    // Serviceability pre-check — server-authoritative, blocks out-of-area orders.
    processingRef.current = true;
    setProcessing(true);
    try {
      const svcResult = await serviceability.refetch();
      const service = svcResult.data;
      if (!service?.serviceable) {
        stopProcessing();
        const reason = (service as { reason?: string } | undefined)?.reason ?? "";
        toast.error("Sorry, we can't deliver to this location.", {
          description: reason === "OUTSIDE_DELIVERY_RADIUS"
            ? "Your location is outside our current delivery area."
            : "Please try a different address.",
        });
        return;
      }
    } catch {
      stopProcessing();
      toast.error("Could not verify delivery availability. Please try again.");
      return;
    }

    try {
      // Reused across retries of this attempt so a double-tap or a failed
      // Razorpay load can't mint a second order. Rotated by the effect above
      // whenever the cart or its details change.
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();
      const created = await initiatePayment.mutateAsync({
        slug: storefrontSlug,
        lines: cart.map((line) => ({
          menuItemId: line.item.id,
          quantity: line.quantity,
          // Real IDs only — the server resolves prices from the DB.
          modifierOptionIds: line.modifierOptionIds?.length ? line.modifierOptionIds : undefined,
          selectedVariantId: line.selectedVariantId ?? undefined,
          specialInstructions: line.note,
        })),
        // Issue 4: Address with precise coordinates — NO fallbacks
        address: {
          flatHouse: deliveryAddress.flatHouse,
          building: deliveryAddress.building,
          street: deliveryAddress.street,
          landmark: deliveryAddress.landmark,
          area: deliveryAddress.area,
          city: deliveryAddress.city,
          postalCode: deliveryAddress.postalCode,
          latitude: deliveryAddress.latitude,
          longitude: deliveryAddress.longitude,
          accuracyMeters: deliveryAddress.accuracyMeters,
          locationSource: deliveryAddress.locationSource,
        },
        customerPhone: normalizePhone(customerPhone),
        couponCode: couponCode.trim() ? couponCode.trim().toUpperCase() : undefined,
        deliveryNotes: deliveryNotes.trim() ? deliveryNotes.trim() : undefined,
        cutleryPreference: cutlery || undefined,
        idempotencyKey: idempotencyKeyRef.current,
      });

      if (created.alreadyExists) {
        // Order already exists for this attempt — hand over its real token so
        // confirmation/tracking authenticate, and park the cart to prevent
        // an accidental second order on Back.
        const existingToken = (created as { trackingToken?: string }).trackingToken;
        stopProcessing();
        setCart([]);
        idempotencyKeyRef.current = null;
        toast.success("This order was already placed — opening it now.");
        navigate(
          `/${storefrontSlug}/confirmation?order=${created.orderNumber}` +
          (existingToken ? `&token=${existingToken}` : "")
        );
        return;
      }

      // The client total is an estimate: the server repriced everything.
      // Never charge blindly on a mismatch — show the authoritative amount.
      const clientEstimatePaise = Math.round(grandTotal * 100);
      if (Math.abs(created.amountPaise - clientEstimatePaise) > 1) {
        toast.info("Total updated to match kitchen pricing.", {
          description: `Payable ${formatINR(created.amountPaise / 100)} (estimated ${formatINR(grandTotal)}).`,
        });
      }

      // Load Razorpay checkout (dedupe the tag across retries — appending a
      // second copy re-executes the vendor bundle and can double-fire load).
      if (!window.Razorpay) {
        let script = document.querySelector<HTMLScriptElement>(
          'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
        );
        if (!script) {
          script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          document.body.appendChild(script);
        }
        const pending = script;
        await new Promise<void>((resolve, reject) => {
          if (window.Razorpay) {
            resolve();
            return;
          }
          pending.addEventListener("load", () => resolve(), { once: true });
          pending.addEventListener("error", () => reject(new Error("Failed to load Razorpay")), { once: true });
        });
      }

      const RazorpayConstructor = window.Razorpay;
      if (!RazorpayConstructor) throw new Error("Razorpay not loaded");
      new RazorpayConstructor({
        key: created.keyId,
        amount: created.amountPaise,
        currency: created.currency,
        name: restaurant?.name ?? "Cloud Kitchen",
        description: `Order ${created.orderNumber}`,
        order_id: created.providerOrderId,
        handler: async (response: any) => {
          try {
            await verifyPayment.mutateAsync({
              orderId: created.orderId,
              providerOrderId: response.razorpay_order_id,
              providerPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            // Park the cart: the order is paid, and Back must not offer a
            // one-tap accidental reorder of the same items.
            setCart([]);
            idempotencyKeyRef.current = null;
            // Persist the tracking token so confirmation/tracking can authenticate.
            navigate(
              `/${storefrontSlug}/confirmation?order=${created.orderNumber}&token=${created.trackingToken}`
            );
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Payment verification failed."
            );
          } finally {
            stopProcessing();
          }
        },
        modal: {
          ondismiss: () => stopProcessing(),
        },
      }).open();
    } catch (error) {
      stopProcessing();
      toast.error(
        error instanceof Error ? error.message : "We couldn't start payment."
      );
    }
  };

  // Custom-domain roots (no path slug) stay on "/" — pushing /<slug> would
  // break the clean domain URL the restaurant advertises.
  // NOTE: hook order — this MUST stay above the early returns below.
  // A hook after an early return changes the hook count between renders
  // (loading skeleton first, full UI after data) and crashes React (#310).
  const goMenu = useCallback(
    () => navigate(hasPathSlug ? `/${storefrontSlug}` : "/"),
    [hasPathSlug, navigate, storefrontSlug],
  );

  if (hasSlug && storefrontQuery.isLoading) return <MenuSkeleton />;

  // Tracking / confirmation authenticate via ?order=&token= and don't need
  // the storefront to render; every other screen needs a live restaurant.
  // While a custom-domain root is resolving its slug, hold the skeleton so
  // the platform gate below doesn't flash first.
  if (!restaurant && screen !== "tracking" && screen !== "confirmation") {
    if (!hasPathSlug && hostSlugQuery.isLoading) return <MenuSkeleton />;
    return hasSlug ? (
      <StorefrontUnavailable onRetry={() => storefrontQuery.refetch()} />
    ) : (
      <PlatformGate />
    );
  }

  // (goMenu lives above the early returns to keep hook order stable.)

  if (["cart", "checkout", "confirmation", "tracking"].includes(screen)) {
    return (
      <>
        <ServiceSetupScreen
        onMenu={goMenu}
        screen={screen}
        cart={cart}
        total={grandTotal}
        itemTotal={itemTotal}
        packaging={packaging}
        delivery={delivery}
        taxes={taxes}
        onQuantity={changeQty}
        onCheckout={startSecurePayment}
        processing={processing}
        restaurant={restaurant}
        deliveryAddress={deliveryAddress}
        onEditLocation={() => setLocationOpen(true)}
        customerPhone={customerPhone}
        onCustomerPhone={setCustomerPhone}
        couponCode={couponCode}
        onCouponCode={setCouponCode}
        deliveryNotes={deliveryNotes}
        onDeliveryNotes={setDeliveryNotes}
        cutlery={cutlery}
        onCutlery={setCutlery}
        serviceBlocked={serviceBlocked}
        serviceChecking={serviceability.isFetching}
        serviceReason={serviceReason}
        restaurantOpen={restaurantOpen}
        closureMessage={closureMessage}
        slug={storefrontSlug}
        eta={restaurant?.eta}
        activeOrderNumber={activeOrderNumber}
        queryOrder={(queryParams.get("order") ?? "").trim()}
        queryToken={(queryParams.get("token") ?? "").trim()}
      />
        {/* Location picker must stay mounted on sub-screens: the checkout
            form's address buttons open it from here too. */}
        <DeliveryLocationDrawer
          open={locationOpen}
          onOpenChange={setLocationOpen}
          onConfirm={(loc) => setDeliveryAddress(loc)}
          existingLocation={deliveryAddress}
          initialCenter={
            storefront?.outlet?.latitude != null && storefront?.outlet?.longitude != null
              ? { lat: storefront.outlet.latitude, lng: storefront.outlet.longitude }
              : null
          }
          cityBias={storefront?.outlet?.city}
        />
      </>
    );
  }

  if (!restaurant) return <MenuSkeleton />;

  return (
    <>
      <main className="min-h-screen bg-[#fffaf3] pb-28 lg:pb-10">
        {/* Header */}
        <TopBar
          restaurantName={restaurant.name}
          itemCount={totalQuantity}
          onCart={() => navigate(`/${storefrontSlug}/cart`)}
          onAccount={() => setAuthOpen(true)}
          customerPhone={loggedInPhone ?? undefined}
          eta={restaurant.eta}
          offerCount={offers.length}
          deliveryFee={restaurant.deliveryFee}
          minOrder={restaurant.minOrder}
        />

        {lowData && !lowDataDismissed && (
          <div
            role="status"
            className="flex items-center justify-center gap-1 border-b border-[#ead8c6] bg-[#fff6ea] py-1 pl-4 pr-2 text-xs font-bold text-[#8a6b56]"
          >
            <span>Slow network — showing light mode.</span>
            <button
              type="button"
              onClick={() => setLowDataDismissed(true)}
              aria-label="Dismiss slow network notice"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:text-[#c84630]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Hero Banner */}
        <section className="relative overflow-hidden bg-[#2d1f17] text-white">
          {!lowData && restaurant.bannerImage ? (
            <SmartImage
              src={restaurant.bannerImage}
              alt={`${restaurant.name} kitchen`}
              ratio="16/9"
              eager
              critical
              className="absolute inset-0"
              imgClassName="opacity-60"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-r from-[#1a1210]/95 via-[#2b1e16]/80 to-[#2b1e16]/30" />
          <div className="relative mx-auto flex min-h-[280px] max-w-[1440px] items-end px-4 pb-7 pt-16 sm:px-6 lg:min-h-[320px] lg:px-10 lg:pb-10">
            <div className="rise-in max-w-xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white/10 shadow-lg backdrop-blur">
                  {restaurant.logo && !logoBroken ? (
                    <img
                      src={restaurant.logo}
                      alt={`${restaurant.name} logo`}
                      loading="eager"
                      decoding="async"
                      className="h-full w-full object-cover"
                      onError={() => setLogoBroken(true)}
                    />
                  ) : (
                    <BrandMark />
                  )}
                </div>
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold tracking-wide backdrop-blur">
                  Direct from the kitchen
                </span>
              </div>
              <h1 className="font-display text-4xl leading-none sm:text-5xl">
                {restaurant.name}
              </h1>
              <p className="mt-3 text-sm text-white/75">
                {restaurant.cuisines.join(" • ")}
              </p>
              {restaurant.description && (
                <p className="mt-2 max-w-md text-xs text-white/55 leading-relaxed">
                  {restaurant.description}
                </p>
              )}
              <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
                <MetaPill
                  icon={<Clock3 className="h-3.5 w-3.5" />}
                  text={restaurant.eta}
                />
                {restaurant.deliveryFee > 0 && (
                  <MetaPill
                    icon={<Bike className="h-3.5 w-3.5" />}
                    text={`Delivery ₹${restaurant.deliveryFee}`}
                  />
                )}
                {restaurant.minOrder > 0 && (
                  <MetaPill
                    icon={<ShoppingBag className="h-3.5 w-3.5" />}
                    text={`Min ₹${restaurant.minOrder}`}
                  />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Delivery Address Bar */}
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
          {!restaurantOpen && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"
            >
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                The kitchen is closed right now — {closureMessage}. Browse the
                menu, and ordering will unlock when we're back.
              </span>
            </div>
          )}
          <section className="relative -mt-1 border-x border-b border-[#eadac9] bg-[#fffdf9] px-4 py-3 shadow-sm sm:px-5 lg:rounded-b-2xl">
            <button
              onClick={() => setLocationOpen(true)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#faede0] text-[#c84630]">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#9a7660]">
                    {deliveryAddress?.confirmed ? "Delivering to" : "Set delivery location"}
                  </p>
                  {deliveryAddress?.confirmed ? (
                    <p className="truncate text-sm font-bold text-[#382719]">
                      {deliveryAddress.flatHouse}, {deliveryAddress.area}, {deliveryAddress.city} {deliveryAddress.postalCode}
                    </p>
                  ) : (
                    <p className="truncate text-sm font-bold text-[#C84630]">
                      Tap to set your delivery location
                    </p>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[#9a7660]" />
            </button>
          </section>

          {/* Offers strip — hidden when there are no offers */}
          <OfferStrip offers={offers} onApplyCoupon={applyCoupon} />

          {/* Main Content Grid */}
          <div className="mt-5 lg:grid lg:grid-cols-[170px_minmax(0,1fr)_350px] lg:gap-8">
            {/* Desktop Category Sidebar */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.16em] text-[#9a7660]">
                  On the menu
                </p>
                <nav aria-label="Menu categories" className="space-y-1">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => scrollToCategory(category.id, category.name)}
                      aria-pressed={activeCategory === category.name}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                        activeCategory === category.name
                          ? "bg-[#f5e4d4] text-[#b63d2d]"
                          : "text-[#6f5140] hover:bg-[#faefe5]"
                      }`}
                    >
                      <span className="truncate">{category.name}</span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-[#a37960]">
                        {countByCategory.get(category.name) ?? 0}
                      </span>
                    </button>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Main Menu Content */}
            <section className="min-w-0">
              {/* Search + category rail (sticky on mobile, static on desktop) */}
              <div className="sticky top-[76px] z-20 -mx-4 bg-[#fffaf3]/95 px-4 pb-2 pt-4 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a37d64]" />
                    <label htmlFor="dish-search" className="sr-only">
                      Search dishes, cuisines, or categories
                    </label>
                    <Input
                      id="dish-search"
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search dishes, cuisines, or categories"
                      className="h-12 rounded-2xl border-[#e8d6c5] bg-white pl-11 pr-12 text-sm shadow-sm placeholder:text-[#ac8b73]"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={clearSearch}
                        aria-label="Clear search"
                        className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-[#a37d64] hover:text-[#c84630]"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile Category Rail — scroll-spy chips */}
                <div role="group" aria-label="Menu categories" className="scrollbar-hide mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                  {categories.map((category) => {
                    const isActive = activeCategory === category.name;
                    return (
                      <button
                        key={category.id}
                        ref={isActive ? activeChipRef : undefined}
                        onClick={() => scrollToCategory(category.id, category.name)}
                        aria-pressed={isActive}
                        className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-extrabold ${
                          isActive
                            ? "bg-[#382719] text-white"
                            : "border border-[#ead8c7] bg-white text-[#76523e]"
                        }`}
                      >
                        {category.name}
                      </button>
                    );
                  })}
                </div>
              </div>

                {/* Filter Chips */}
                <div className="scrollbar-hide mt-3 flex gap-2 overflow-x-auto pb-1">
                  {(
                    [
                      ["all", "All"],
                      ["veg", "Veg"],
                      ["nonveg", "Non-Veg"],
                      ["bestseller", "Bestseller"],
                    ] as [Filter, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setFilter(value)}
                      aria-pressed={filter === value}
                      className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold ${
                        filter === value
                          ? "bg-[#c84630] text-white"
                          : "border border-[#ead8c7] bg-[#fffdf9] text-[#76523e]"
                      }`}
                    >
                      {value === "veg" && <FoodDot kind="veg" />}
                      {value === "nonveg" && <FoodDot kind="nonveg" />}
                      {label}
                    </button>
                  ))}
                </div>

              {/* Search Results */}
              {debouncedQuery && (
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p role="status" aria-live="polite" className="text-sm font-bold text-[#5b4233]">
                    {results.length} result{results.length !== 1 ? "s" : ""} for{" "}
                    <span className="text-[#c84630]">"{debouncedQuery}"</span>
                  </p>
                  <button
                    onClick={clearSearch}
                    className="min-h-[44px] shrink-0 px-2 text-xs font-bold text-[#9b6a52] hover:text-[#c84630]"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Collections (when no search active) */}
              {!debouncedQuery && collections.length > 0 && (
                <div className="mb-6 space-y-6">
                  {collections.map((collection) => (
                    <div key={collection.name}>
                      <div className="mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-[#c84630]" aria-hidden="true" />
                        <h3 className="text-sm font-extrabold text-[#382719]">
                          {collection.name}
                        </h3>
                      </div>
                      <div className="scrollbar-hide -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
                        {collection.items.slice(0, 6).map((item) => (
                          <CollectionCard
                            key={item.id}
                            item={item}
                            onAdd={openItem}
                            disabled={!restaurantOpen}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Menu Stream */}
              <MenuStream
                items={results}
                categories={categories}
                activeCategory={activeCategory}
                query={debouncedQuery}
                onAdd={openItem}
                orderingDisabled={!restaurantOpen}
                cartQtyByItem={cartQtyByItem}
                onIncrement={incrementSilent}
                onDecrement={decrementSimple}
                onSpyCategory={setActiveCategory}
              />
            </section>

            {/* Desktop Cart Sidebar */}
            <aside className="hidden lg:block">
              <CartTicket
                cart={cart}
                total={grandTotal}
                itemTotal={itemTotal}
                packaging={packaging}
                delivery={delivery}
                taxes={taxes}
                onQuantity={changeQty}
                onCheckout={startSecurePayment}
                processing={processing}
                restaurant={restaurant}
                estimated
                checkoutBlocked={!restaurantOpen || serviceBlocked}
                checkoutHint={
                  !restaurantOpen
                    ? closureMessage
                    : serviceBlocked
                    ? "This address is outside our delivery area."
                    : undefined
                }
              />
            </aside>
          </div>
        </div>
      </main>

      {/* Mobile Cart CTA */}
      {totalQuantity > 0 && (
        <MobileCartBar
          quantity={totalQuantity}
          total={grandTotal}
          onCart={() => navigate(`/${storefrontSlug}/cart`)}
        />
      )}

      {/* Customization Drawer */}
      <CustomizationDrawer
        item={selected}
        quantity={customQty}
        note={note}
        selectedVariantId={selectedVariantId}
        selectedOptionIds={selectedOptionIds}
        onClose={() => setSelected(null)}
        onQuantity={setCustomQty}
        onVariantChange={setSelectedVariantId}
        onToggleOption={toggleOption}
        onNote={setNote}
        onAdd={addCustomItem}
      />

      {/* Delivery Location Drawer */}
      <DeliveryLocationDrawer
        open={locationOpen}
        onOpenChange={setLocationOpen}
        onConfirm={(loc) => setDeliveryAddress(loc)}
        existingLocation={deliveryAddress}
        initialCenter={
          storefront?.outlet?.latitude != null && storefront?.outlet?.longitude != null
            ? { lat: storefront.outlet.latitude, lng: storefront.outlet.longitude }
            : null
        }
        cityBias={storefront?.outlet?.city}
      />

      {/* Customer Auth — Dialog on sm+ screens, Drawer on mobile */}
      {isDesktop ? (
        <Dialog open={authOpen} onOpenChange={handleAuthOpenChange}>
          <DialogContent className="border-[#dfcbb9] bg-[#fffaf3] sm:max-w-md">
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-2xl text-[#382719]">
                {loggedInPhone ? "Your Account" : "Sign in to order"}
              </DialogTitle>
              <DialogDescription className="text-[#91725e]">
                {loggedInPhone
                  ? `Logged in as ${loggedInPhone}`
                  : "Enter your phone number to get started"}
              </DialogDescription>
            </DialogHeader>
            <AuthBody
              loggedInPhone={loggedInPhone}
              totalOrders={customerMe.data?.totalOrders}
              otpStep={otpStep}
              otpPhone={otpPhone}
              otpCode={otpCode}
              otpError={otpError}
              otpLoading={otpLoading}
              resendCooldown={resendCooldown}
              onOtpPhone={setOtpPhone}
              onOtpCode={setOtpCode}
              onClearError={() => setOtpError("")}
              onSendOtp={handleSendOtp}
              onVerifyOtp={handleVerifyOtp}
              onBackToPhone={() => { setOtpStep("phone"); setOtpCode(""); setOtpError(""); }}
              onLogout={handleLogout}
            />
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={authOpen} onOpenChange={handleAuthOpenChange}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="px-6 pb-2 text-left">
              <DrawerTitle className="font-display text-2xl text-[#382719]">
                {loggedInPhone ? "Your Account" : "Sign in to order"}
              </DrawerTitle>
              <DrawerDescription className="text-[#91725e]">
                {loggedInPhone
                  ? `Logged in as ${loggedInPhone}`
                  : "Enter your phone number to get started"}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-6 pb-6">
              <AuthBody
                loggedInPhone={loggedInPhone}
                totalOrders={customerMe.data?.totalOrders}
                otpStep={otpStep}
                otpPhone={otpPhone}
                otpCode={otpCode}
                otpError={otpError}
                otpLoading={otpLoading}
                resendCooldown={resendCooldown}
                onOtpPhone={setOtpPhone}
                onOtpCode={setOtpCode}
                onClearError={() => setOtpError("")}
                onSendOtp={handleSendOtp}
                onVerifyOtp={handleVerifyOtp}
                onBackToPhone={() => { setOtpStep("phone"); setOtpCode(""); setOtpError(""); }}
                onLogout={handleLogout}
              />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function AuthBody({
  loggedInPhone,
  totalOrders,
  otpStep,
  otpPhone,
  otpCode,
  otpError,
  otpLoading,
  resendCooldown,
  onOtpPhone,
  onOtpCode,
  onClearError,
  onSendOtp,
  onVerifyOtp,
  onBackToPhone,
  onLogout,
}: {
  loggedInPhone: string | null;
  totalOrders?: number;
  otpStep: "phone" | "verify";
  otpPhone: string;
  otpCode: string;
  otpError: string;
  otpLoading: boolean;
  resendCooldown: number;
  onOtpPhone: (value: string) => void;
  onOtpCode: (value: string) => void;
  onClearError: () => void;
  onSendOtp: () => void;
  onVerifyOtp: () => void;
  onBackToPhone: () => void;
  onLogout: () => void;
}) {
  if (loggedInPhone) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[#eadccf] bg-[#fff9f3] p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-[#a77d63]">Phone</p>
              <p className="mt-1 font-bold text-[#382719]">{loggedInPhone}</p>
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-[#a77d63]">Total Orders</p>
              <p className="mt-1 font-bold text-[#382719]">{totalOrders ?? 0}</p>
            </div>
          </div>
        </div>
        <Button
          onClick={onLogout}
          variant="outline"
          className="min-h-[44px] w-full rounded-xl border-[#ddc6b5] text-[#c84630] font-extrabold"
        >
          Sign out
        </Button>
      </div>
    );
  }

  if (otpStep === "phone") {
    return (
      <div className="space-y-4">
        <label htmlFor="auth-phone" className="sr-only">
          10-digit phone number
        </label>
        <Input
          id="auth-phone"
          value={otpPhone}
          onChange={(e) => { onOtpPhone(e.target.value); onClearError(); }}
          placeholder="10-digit phone number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={15}
          className="h-12 rounded-xl border-[#ddc6b5] text-base"
        />
        {otpError && (
          <p role="alert" className="text-sm font-bold text-[#c84630]">{otpError}</p>
        )}
        <Button
          onClick={onSendOtp}
          disabled={otpLoading || normalizePhone(otpPhone).length !== 10}
          className="h-12 min-h-[44px] w-full rounded-xl bg-[#c84630] font-extrabold text-base hover:bg-[#ad3627]"
        >
          {otpLoading ? "Sending..." : "Send verification code"}
        </Button>
        <p className="text-center text-xs text-[#a77d63]">
          We'll send a 6-digit code to verify your number.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#76523e]">
        Enter the 6-digit code sent to {otpPhone}
      </p>
      <label htmlFor="auth-otp" className="sr-only">
        6-digit verification code
      </label>
      <Input
        id="auth-otp"
        value={otpCode}
        onChange={(e) => { onOtpCode(e.target.value.replace(/[^\d]/g, "")); onClearError(); }}
        placeholder="000000"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="h-12 rounded-xl border-[#ddc6b5] text-center text-2xl font-mono tracking-[0.3em]"
      />
      {otpError && (
        <p role="alert" className="text-sm font-bold text-[#c84630]">{otpError}</p>
      )}
      <Button
        onClick={onVerifyOtp}
        disabled={otpLoading || otpCode.length !== 6}
        className="h-12 min-h-[44px] w-full rounded-xl bg-[#c84630] font-extrabold text-base hover:bg-[#ad3627]"
      >
        {otpLoading ? "Verifying..." : "Verify & continue"}
      </Button>
      {resendCooldown > 0 ? (
        <p aria-live="polite" className="text-center text-xs font-bold text-[#a77d63]">
          Resend code in {resendCooldown}s
        </p>
      ) : (
        <button
          onClick={onSendOtp}
          disabled={otpLoading}
          className="min-h-[44px] w-full text-center text-xs font-bold text-[#a77d63] underline disabled:opacity-50"
        >
          Resend code
        </button>
      )}
      <button
        onClick={onBackToPhone}
        className="min-h-[44px] w-full text-center text-xs font-bold text-[#a77d63] underline"
      >
        Change phone number
      </button>
    </div>
  );
}

function TopBar({
  restaurantName,
  itemCount,
  onCart,
  onAccount,
  customerPhone,
  eta,
  offerCount,
  deliveryFee,
  minOrder,
}: {
  restaurantName: string;
  itemCount: number;
  onCart: () => void;
  onAccount: () => void;
  customerPhone?: string;
  eta?: string;
  offerCount?: number;
  deliveryFee?: number;
  minOrder?: number;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#eadbce] bg-[#fffaf3]/95 backdrop-blur">
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between gap-2 px-4 sm:px-6 lg:px-10">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label={`${restaurantName} — back to top`}
          title={restaurantName}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <BrandMark />
          <span className="min-w-0">
            <span className="font-display block truncate text-xl leading-tight text-[#382719]">
              {restaurantName}
            </span>
            {/* Single compact meta row — fixed height so it never shifts layout */}
            <span className="flex h-5 items-center gap-2 overflow-hidden whitespace-nowrap text-[11px] font-bold text-[#9a7660]">
              {eta ? (
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {eta}
                </span>
              ) : null}
              {deliveryFee != null && deliveryFee > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Bike className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {formatINR(deliveryFee)} delivery
                </span>
              ) : null}
              {minOrder != null && minOrder > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <ShoppingBag className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Min {formatINR(minOrder)}
                </span>
              ) : null}
              {offerCount != null && offerCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-[#c84630]">
                  <TicketPercent className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {offerCount} offer{offerCount !== 1 ? "s" : ""}
                </span>
              ) : null}
            </span>
          </span>
        </button>
        <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            onClick={onAccount}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#ddc6b5] bg-white px-3 py-2 text-xs font-extrabold text-[#553d2c] hover:bg-[#f9e6d9]"
            aria-label="Account"
          >
            <UserRound className="h-4 w-4" />
            <span className="hidden max-w-28 truncate sm:inline">{customerPhone ?? "Login"}</span>
          </button>
          <button
            onClick={onCart}
            className="relative grid h-11 w-11 place-items-center rounded-xl bg-[#382719] text-white hover:bg-[#c84630]"
            aria-label={itemCount > 0 ? `Open cart, ${itemCount} items` : "Open cart"}
          >
            <ShoppingBag className="h-4 w-4" />
            {itemCount > 0 && (
              <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#c84630] px-1 text-xs font-extrabold tabular-nums">
                {itemCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}

function MetaPill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-2 backdrop-blur">
      {icon}
      {text}
    </span>
  );
}

function OfferStrip({
  offers,
  onApplyCoupon,
}: {
  offers: Array<{ code: string; description: string }>;
  onApplyCoupon: (code: string) => void;
}) {
  // Hidden when empty — no dead section on the page.
  if (offers.length === 0) return null;
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Code ${code} copied to clipboard`);
    } catch {
      toast.info(`Use code ${code} at checkout`);
    }
  };
  return (
    <section aria-label="Available offers" className="mt-4">
      <div className="scrollbar-hide -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
        {offers.slice(0, 6).map((offer) => (
          <article
            key={offer.code}
            className="w-[260px] shrink-0 snap-start rounded-2xl border border-[#e8d6c5] bg-gradient-to-r from-[#fff9f0] to-[#fff3e5] p-3"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#c84630]/10 text-[#c84630]">
                <TicketPercent className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => void copyCode(offer.code)}
                  aria-label={`Copy offer code ${offer.code}`}
                  title="Tap to copy"
                  className="flex min-h-[44px] items-center gap-1.5 text-left text-sm font-extrabold tracking-wide text-[#c84630]"
                >
                  <span className="truncate">{offer.code}</span>
                  <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
                <p className="truncate text-xs text-[#8d6b55]">{offer.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onApplyCoupon(offer.code)}
                className="min-h-[44px] shrink-0 rounded-lg px-3 text-xs font-extrabold text-[#c84630] hover:bg-[#c84630]/10"
              >
                Apply
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type MenuRowCallbacks = {
  onAdd: (item: StorefrontMenuItem) => void;
  disabled?: boolean;
};

const CollectionCard = memo(function CollectionCard({
  item,
  onAdd,
  disabled,
}: MenuRowCallbacks & {
  item: StorefrontMenuItem;
}) {
  return (
    <div className="menu-cv flex w-[220px] shrink-0 snap-start gap-3 rounded-2xl border border-[#ead8c6] bg-[#fffdf9] p-3 shadow-sm">
      <SmartImage
        src={item.image}
        alt={item.name}
        ratio="1/1"
        fallbackLabel={item.name}
        className="h-20 w-20 shrink-0 rounded-xl"
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="min-w-0">
          <p className="truncate text-xs font-extrabold text-[#382719]">
            {item.name}
          </p>
          <p className="mt-0.5 text-xs font-bold tabular-nums text-[#c84630]">
            {formatINR(item.price)}
          </p>
        </div>
        <button
          onClick={() => onAdd(item)}
          disabled={disabled}
          className="mt-1 min-h-[44px] w-full rounded-lg border border-[#c84630] bg-white px-2 py-1 text-xs font-extrabold text-[#c84630] hover:bg-[#c84630] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {disabled ? "Closed" : "ADD"}
        </button>
      </div>
    </div>
  );
});

const MenuStream = memo(function MenuStream({
  items,
  categories,
  activeCategory,
  query,
  onAdd,
  orderingDisabled,
  cartQtyByItem,
  onIncrement,
  onDecrement,
  onSpyCategory,
}: {
  items: StorefrontMenuItem[];
  categories: Array<{ id: string; name: string }>;
  activeCategory: string;
  query: string;
  onAdd: (item: StorefrontMenuItem) => void;
  orderingDisabled?: boolean;
  cartQtyByItem: Map<string, number>;
  onIncrement: (item: StorefrontMenuItem) => void;
  onDecrement: (item: StorefrontMenuItem) => void;
  onSpyCategory: (name: string) => void;
}) {
  const searching = query.trim().length > 0;

  // Scroll-spy: the section most visible under the sticky rail becomes the
  // active category. Callbacks are rAF-throttled so fast flings settle once.
  useEffect(() => {
    if (searching) return;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-menu-section]"),
    );
    if (sections.length === 0) return;
    let ticking = false;
    let pending: string | null = null;
    const flush = () => {
      ticking = false;
      if (pending) onSpyCategory(pending);
      pending = null;
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        pending = (visible[0].target as HTMLElement).dataset.menuSection ?? null;
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(flush);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [searching, items, categories, onSpyCategory]);

  const renderRow = (item: StorefrontMenuItem) => (
    <MenuCard
      key={item.id}
      item={item}
      onAdd={onAdd}
      disabled={orderingDisabled}
      cartQty={cartQtyByItem.get(item.id) ?? 0}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
    />
  );

  // Search mode: one flat result list with a live count.
  if (searching) {
    if (items.length === 0)
      return (
        <div className="ticket-edge mt-5 bg-[#fffdf8] p-9 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#faede0] text-[#c84630]">
            <Utensils className="h-6 w-6" />
          </div>
          <h2 className="font-display mt-4 text-2xl">
            No dishes found
          </h2>
          <p className="mt-2 text-sm text-[#856855]">
            Try a different search, or browse the categories below.
          </p>
        </div>
      );

    return (
      <div className="space-y-3 pb-3">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#a37960]">
              Fresh from the kitchen
            </p>
            <h2 className="font-display mt-1 text-3xl text-[#382719]">
              What we found
            </h2>
          </div>
          <span role="status" aria-live="polite" className="text-xs font-bold tabular-nums text-[#94715c]">
            {items.length} dish{items.length !== 1 ? "es" : ""}
          </span>
        </div>
        {items.map(renderRow)}
      </div>
    );
  }

  // Browse mode: every category is a section; the rail scroll-spies them.
  // No visible categories at all (fresh kitchen) gets an explicit empty
  // state — otherwise the page below the rail is silently blank.
  if (!searching && categories.length === 0) {
    return (
      <div className="ticket-edge mt-5 bg-[#fffdf8] p-9 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#faede0] text-[#c84630]">
          <Utensils className="h-6 w-6" />
        </div>
        <h2 className="font-display mt-4 text-2xl">
          Menu coming soon
        </h2>
        <p className="mt-2 text-sm text-[#856855]">
          The kitchen is setting up its menu — please check back shortly.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-8 pb-3">
      {categories.map((category) => {
        const catItems = items.filter((item) => item.category === category.name);
        return (
          <section
            key={category.id}
            id={`menu-section-${category.id}`}
            data-menu-section={category.name}
            aria-label={category.name}
            className="section-anchor"
          >
            <div className="mb-3 flex items-end justify-between">
              <h2 className="font-display text-2xl text-[#382719]">
                {category.name}
              </h2>
              <span className="text-xs font-bold tabular-nums text-[#94715c]">
                {catItems.length} dish{catItems.length !== 1 ? "es" : ""}
              </span>
            </div>
            {catItems.length > 0 ? (
              <div className="space-y-3">{catItems.map(renderRow)}</div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#e5d0bd] bg-[#fffdf9] p-5 text-center">
                <p className="text-sm font-extrabold text-[#5b4233]">
                  Nothing in {category.name} yet
                </p>
                <p className="mt-1 text-xs text-[#856855]">
                  The kitchen team will publish dishes here shortly.
                </p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
});

const MenuCard = memo(function MenuCard({
  item,
  onAdd,
  disabled,
  cartQty,
  onIncrement,
  onDecrement,
}: MenuRowCallbacks & {
  item: StorefrontMenuItem;
  cartQty?: number;
  onIncrement?: (item: StorefrontMenuItem) => void;
  onDecrement?: (item: StorefrontMenuItem) => void;
}) {
  const unavailable = item.availability !== "AVAILABLE" || disabled;
  const hasDiscount = item.originalPrice && item.originalPrice > item.price;
  // Steppers only for simple items already in the cart — customized lines
  // stay unique, so they always go through the customization sheet.
  const showStepper = !item.customizable && !unavailable && (cartQty ?? 0) > 0;

  return (
    <article
      className={`menu-cv flex gap-3 rounded-2xl border border-[#ead8c6] bg-[#fffdf9] p-3 shadow-[0_6px_18px_rgba(89,55,31,0.05)] sm:p-4 ${
        unavailable ? "opacity-70" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <FoodDot kind={item.kind} />
          {item.isBestseller && (
            <span className="rounded-full bg-[#f7e6ca] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#9c5a21]">
              Bestseller
            </span>
          )}
          {item.tag && item.tag !== "Bestseller" && (
            <span className="max-w-28 truncate rounded-full bg-[#e8f5e9] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#2e7d32]">
              {item.tag}
            </span>
          )}
          {item.spiceLevel != null && item.spiceLevel > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[#c84630]"
              role="img"
              aria-label={`Spice level ${Math.min(item.spiceLevel, 5)} of 5`}
              title={`Spice level: ${Math.min(item.spiceLevel, 5)}/5`}
            >
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </div>
        <h3 className="font-display mt-1.5 text-[17px] leading-snug text-[#382719]">
          {item.name}
        </h3>
        <p className="mt-0.5 flex items-baseline gap-2 text-sm font-extrabold tabular-nums text-[#382719]">
          {formatINR(item.price)}
          {hasDiscount && (
            <span className="text-xs font-bold text-[#999] line-through">
              {formatINR(item.originalPrice!)}
            </span>
          )}
        </p>
        <p className="clamp-2 mt-1 line-clamp-2 text-xs leading-relaxed text-[#886a57]">
          {item.description}
        </p>
        <p className="mt-1.5 text-[11px] font-bold text-[#9d7b64]">
          {unavailable
            ? (disabled ? "Kitchen closed" : item.availableNote || "Unavailable right now")
            : item.customizable
              ? "Customisable"
              : item.isBestseller
                ? "Loved by regulars"
                : "Prepared fresh"}
        </p>
      </div>
      <div className="w-[120px] shrink-0 sm:w-[144px]">
        <div className="relative">
          <SmartImage
            src={item.image}
            alt={item.name}
            ratio="1/1"
            fallbackLabel={item.name}
            className="rounded-xl"
          />
          {unavailable && (
            <div className="absolute inset-0 grid place-items-center rounded-xl bg-[#3a251b]/45 px-2 text-center text-xs font-extrabold text-white">
              {disabled
                ? "Kitchen closed"
                : item.availability === "SOLD_OUT"
                ? "Sold out"
                : "Unavailable"}
            </div>
          )}
        </div>
        <div className="relative z-10 -mt-5 flex justify-center px-2">
          {showStepper ? (
            <div className="flex h-11 min-h-[44px] items-center rounded-xl border border-[#f0d9cd] bg-white text-[#c84630] shadow-[0_8px_20px_rgba(200,70,48,0.28)]">
              <button
                type="button"
                aria-label={`Remove one ${item.name} from your order`}
                onClick={() => onDecrement?.(item)}
                className="grid h-full w-11 place-items-center rounded-l-xl hover:bg-[#fff0e9]"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span aria-live="polite" aria-atomic="true" className="min-w-5 text-center text-sm font-extrabold tabular-nums">
                {cartQty}
              </span>
              <button
                type="button"
                aria-label={`Add one more ${item.name} to your order`}
                onClick={() => onIncrement?.(item)}
                className="grid h-full w-11 place-items-center rounded-r-xl hover:bg-[#fff0e9]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={unavailable}
              onClick={() => onAdd(item)}
              aria-label={
                unavailable ? `${item.name} unavailable` : `Add ${item.name} to your order`
              }
              className="h-11 min-h-[44px] min-w-[104px] rounded-xl border border-[#e8c9b8] bg-white px-6 text-[13px] font-extrabold tracking-wide text-[#c84630] shadow-[0_8px_20px_rgba(200,70,48,0.28)] hover:bg-[#c84630] hover:text-white disabled:cursor-not-allowed disabled:border-[#bfae9f] disabled:text-[#9d8d80] disabled:shadow-none"
            >
              {item.availability !== "AVAILABLE"
                ? "Sold out"
                : disabled
                  ? "Closed"
                  : "ADD"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
});

function MobileCartBar({
  quantity,
  total,
  onCart,
}: {
  quantity: number;
  total: number;
  onCart: () => void;
}) {
  return (
    <button
      onClick={onCart}
      aria-label={`View cart, ${quantity} item${quantity !== 1 ? "s" : ""}, total ${formatINR(total)}`}
      className="ticket-edge safe-bottom fixed left-4 right-4 z-40 flex min-h-[44px] items-center justify-between px-5 py-3.5 text-left text-white shadow-[0_18px_45px_rgba(54,35,24,0.25)] lg:hidden bg-[#382719]"
    >
      <span aria-live="polite" aria-atomic="true">
        <span className="block text-xs font-semibold text-white/70">
          {quantity} item{quantity !== 1 ? "s" : ""} in your order
        </span>
        <span className="text-base font-extrabold tabular-nums">{formatINR(total)}</span>
      </span>
      <span className="flex items-center gap-2 text-sm font-extrabold">
        View cart <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
  );
}

function CartTicket({
  cart,
  total,
  itemTotal,
  packaging,
  delivery,
  taxes,
  onQuantity,
  onCheckout,
  processing,
  restaurant,
  checkoutBlocked,
  checkoutHint,
  estimated,
}: {
  cart: CartLine[];
  total: number;
  itemTotal: number;
  packaging: number;
  delivery: number;
  taxes: number;
  onQuantity: (id: string, qty: number) => void;
  onCheckout: () => void;
  processing: boolean;
  restaurant: any;
  checkoutBlocked?: boolean;
  checkoutHint?: string;
  /** Label the client-computed total as an estimate (server reprices). */
  estimated?: boolean;
}) {
  const belowMinimum = (restaurant?.minOrder ?? 0) > 0 && total < restaurant.minOrder;
  const checkoutDisabled = processing || belowMinimum || checkoutBlocked;
  return (
    <div className="ticket-edge sticky top-24 overflow-hidden bg-[#fffdf8] shadow-[0_15px_35px_rgba(84,48,26,0.1)]">
      <div className="paper-grain border-b border-[#ead8c6] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#a37960]">
              Your order
            </p>
            <h2 className="font-display mt-1 text-2xl">
              {cart.length ? `${cart.length} tasty picks` : "Your cart is empty"}
            </h2>
          </div>
          <ShoppingBag className="h-5 w-5 text-[#c84630]" />
        </div>
      </div>
      <div className="space-y-4 p-5">
        {cart.length ? (
          <>
            {cart.map((line) => (
              <div key={line.id} className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-[#442f20]">
                    {line.item.name}
                  </p>
                  <p className="mt-0.5 text-xs text-[#967762]">
                    {line.modifiers?.join(" · ") || "As listed"}
                  </p>
                  <p className="mt-1 text-xs font-bold">
                    {formatINR(line.unitPrice * line.quantity)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onQuantity(line.id, 0)}
                    aria-label={`Remove ${line.item.name} from cart`}
                    className="mt-1 min-h-[44px] text-xs font-bold text-[#a26d50] hover:text-[#c84630]"
                  >
                    Remove
                  </button>
                </div>
                <Quantity
                  compact
                  allowZero
                  value={line.quantity}
                  onChange={(next) => onQuantity(line.id, next)}
                />
              </div>
            ))}
            <div className="dotted-rule pt-4 space-y-2">
              <div className="flex justify-between text-xs text-[#8a6b56]">
                <span>Item total</span>
                <span>{formatINR(itemTotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-[#8a6b56]">
                <span>Packaging</span>
                <span>{formatINR(packaging)}</span>
              </div>
              <div className="flex justify-between text-xs text-[#8a6b56]">
                <span>Delivery</span>
                <span>{formatINR(delivery)}</span>
              </div>
              <div className="flex justify-between text-xs text-[#8a6b56]">
                <span>Taxes</span>
                <span>{formatINR(taxes)}</span>
              </div>
              <div className="dotted-rule pt-3 flex justify-between text-base font-extrabold">
                <span>{estimated ? "Estimated total" : "To pay"}</span>
                <span>{formatINR(total)}</span>
              </div>
              {estimated && (
                <p className="text-xs text-[#94715c]">
                  Final amount is confirmed by the kitchen at payment.
                </p>
              )}
            </div>
            {belowMinimum && (
              <p role="alert" className="text-xs font-bold text-[#c84630]">
                Add {formatINR(restaurant.minOrder - total)} more for minimum order
              </p>
            )}
            {checkoutHint && (
              <p role="alert" className="text-xs font-bold text-[#c84630]">
                {checkoutHint}
              </p>
            )}
            <Button
              onClick={onCheckout}
              disabled={checkoutDisabled}
              className="h-12 min-h-[44px] w-full rounded-xl bg-[#c84630] text-sm font-extrabold hover:bg-[#ae3426]"
            >
              {processing ? "Processing..." : "Checkout"}
              {!processing && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </>
        ) : (
          <p className="text-sm font-bold text-[#9b7a66]">
            Browse the menu to add items
          </p>
        )}
      </div>
    </div>
  );
}

function CustomizationDrawer({
  item,
  quantity,
  note,
  selectedVariantId,
  selectedOptionIds,
  onClose,
  onQuantity,
  onVariantChange,
  onToggleOption,
  onNote,
  onAdd,
}: {
  item: StorefrontMenuItem | null;
  quantity: number;
  note: string;
  selectedVariantId: string | null;
  selectedOptionIds: string[];
  onClose: () => void;
  onQuantity: (value: number) => void;
  onVariantChange: (value: string | null) => void;
  onToggleOption: (group: StorefrontAddonGroup, optionId: string) => void;
  onNote: (value: string) => void;
  onAdd: () => void;
}) {
  if (!item) return null;

  const variant = item.variants?.find((v) => v.id === selectedVariantId) ?? null;
  const chosenOptions = (item.addonGroups ?? [])
    .flatMap((group) => group.options)
    .filter((option) => selectedOptionIds.includes(option.id));
  // Display estimate from DB prices only (paise → ₹). Server reprices authoritatively.
  const displayTotal =
    (item.price +
      (variant ? variant.pricePaise / 100 : 0) +
      chosenOptions.reduce((sum, option) => sum + option.pricePaise / 100, 0)) *
    quantity;

  const hasRealModifiers = (item.variants?.length ?? 0) > 0 || (item.addonGroups?.length ?? 0) > 0;

  return (
    <Drawer open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[92dvh] border-[#dfcbb9] bg-[#fffaf3]">
        <div className="mx-auto w-full max-w-xl overflow-y-auto px-5 pb-3">
          <DrawerHeader className="px-0 text-left">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FoodDot kind={item.kind} />
                  <span className="rounded-full bg-[#f7e6ca] px-2 py-0.5 text-xs font-extrabold text-[#97591f]">
                    CUSTOMIZE
                  </span>
                </div>
                <DrawerTitle className="font-display mt-2 text-3xl text-[#382719]">
                  {item.name}
                </DrawerTitle>
                <DrawerDescription className="mt-1 max-w-md text-sm leading-relaxed text-[#836552]">
                  {item.description}
                </DrawerDescription>
              </div>
              <button
                onClick={onClose}
                aria-label="Close customization"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f5e7da] text-[#805a43]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DrawerHeader>

          {item.variants && item.variants.length > 0 && (
            <VariantGroup
              variants={item.variants}
              selectedId={selectedVariantId}
              onSelect={(id) => onVariantChange(id === selectedVariantId ? null : id)}
            />
          )}

          {(item.addonGroups ?? []).map((group) => (
            <AddonGroupBlock
              key={group.id}
              group={group}
              selectedIds={selectedOptionIds}
              onToggle={(optionId) => onToggleOption(group, optionId)}
            />
          ))}

          {!hasRealModifiers && (
            <p className="mt-6 rounded-xl border border-dashed border-[#e5d0bd] bg-white p-3 text-xs leading-relaxed text-[#967762]">
              This dish has no extra options right now — add a note below if the
              kitchen should know something.
            </p>
          )}

          <div className="mt-6">
            <label
              className="text-sm font-extrabold text-[#382719]"
              htmlFor="special-note"
            >
              Special instructions
            </label>
            <textarea
              id="special-note"
              value={note}
              onChange={(event) => onNote(event.target.value)}
              placeholder="Less spicy, no onions..."
              maxLength={300}
              className="mt-2 min-h-20 w-full resize-none rounded-xl border border-[#e5d0bd] bg-white p-3 text-sm outline-none ring-[#c84630] focus:ring-2"
            />
          </div>

          <div className="mt-5">
            <Quantity value={quantity} onChange={(next) => onQuantity(Math.min(MAX_LINE_QTY, Math.max(1, next)))} />
          </div>
        </div>
        <DrawerFooter className="border-t border-[#ead8c6] bg-[#fffdf9] px-5 pb-5 pt-4">
          <Button
            onClick={onAdd}
            className="h-13 min-h-[44px] w-full rounded-xl bg-[#c84630] text-sm font-extrabold hover:bg-[#ad3627]"
          >
            Add item{" "}
            <span className="ml-auto">{formatINR(displayTotal)}</span>
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function VariantGroup({
  variants,
  selectedId,
  onSelect,
}: {
  variants: StorefrontVariant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-6" role="radiogroup" aria-label="Choose a variant">
      <p className="text-sm font-extrabold text-[#382719]">
        Choose a variant{" "}
        <span className="font-medium text-[#967762]">(optional)</span>
      </p>
      <div className="mt-3 grid gap-2">
        {variants.map((variant) => {
          const active = selectedId === variant.id;
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!variant.isAvailable}
              onClick={() => onSelect(variant.id)}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-[#c84630] bg-[#fff0e9] text-[#9f392a]"
                  : "border-[#ead7c5] bg-white text-[#5f4534]"
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full border ${
                    active ? "border-[#c84630]" : "border-[#d8c3b1]"
                  }`}
                >
                  {active && (
                    <span className="h-2.5 w-2.5 rounded-full bg-[#c84630]" />
                  )}
                </span>
                {variant.name}
                {!variant.isAvailable && (
                  <span className="text-xs font-bold text-[#9d8d80]">(Unavailable)</span>
                )}
              </span>
              <span className="text-xs">
                {variant.pricePaise > 0 ? `+${formatINR(variant.pricePaise / 100)}` : "Included"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddonGroupBlock({
  group,
  selectedIds,
  onToggle,
}: {
  group: StorefrontAddonGroup;
  selectedIds: string[];
  onToggle: (optionId: string) => void;
}) {
  const single = group.selectionType === "single";
  return (
    <div className="mt-6" role={single ? "radiogroup" : "group"} aria-label={group.name}>
      <p className="text-sm font-extrabold text-[#382719]">
        {group.name}{" "}
        {group.isRequired ? (
          <span className="font-medium text-[#c84630]">Required</span>
        ) : (
          <span className="font-medium text-[#967762]">(optional)</span>
        )}
      </p>
      {!single && group.maxSelections > 1 && (
        <p className="mt-1 text-xs text-[#967762]">Pick up to {group.maxSelections}</p>
      )}
      <div className="mt-3 grid gap-2">
        {group.options.map((option) => {
          const active = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role={single ? "radio" : "checkbox"}
              aria-checked={active}
              disabled={!option.isAvailable}
              onClick={() => onToggle(option.id)}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-[#c84630] bg-[#fff0e9] text-[#9f392a]"
                  : "border-[#ead7c5] bg-white text-[#5f4534]"
              }`}
            >
              <span className="flex items-center gap-3">
                <span
                  className={`grid h-5 w-5 place-items-center border ${
                    single ? "rounded-full" : "rounded-md"
                  } ${
                    active
                      ? "border-[#c84630] bg-[#c84630] text-white"
                      : "border-[#d8c3b1]"
                  }`}
                >
                  {active &&
                    (single ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-white" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    ))}
                </span>
                {option.name}
                {!option.isAvailable && (
                  <span className="text-xs font-bold text-[#9d8d80]">(Unavailable)</span>
                )}
              </span>
              <span className="text-xs">
                {option.pricePaise > 0 ? `+${formatINR(option.pricePaise / 100)}` : "Included"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ServiceSetupScreen({
  onMenu,
  screen,
  cart,
  total,
  itemTotal,
  packaging,
  delivery,
  taxes,
  onQuantity,
  onCheckout,
  processing,
  restaurant,
  deliveryAddress,
  onEditLocation,
  customerPhone,
  onCustomerPhone,
  couponCode,
  onCouponCode,
  deliveryNotes,
  onDeliveryNotes,
  cutlery,
  onCutlery,
  serviceBlocked,
  serviceChecking,
  serviceReason,
  restaurantOpen,
  closureMessage,
  slug,
  eta,
  activeOrderNumber,
  queryOrder,
  queryToken,
}: {
  onMenu: () => void;
  screen: string;
  cart: CartLine[];
  total: number;
  itemTotal: number;
  packaging: number;
  delivery: number;
  taxes: number;
  onQuantity: (id: string, qty: number) => void;
  onCheckout: () => void;
  processing: boolean;
  restaurant: any;
  deliveryAddress: DeliveryLocation | null;
  onEditLocation: () => void;
  customerPhone: string;
  onCustomerPhone: (value: string) => void;
  couponCode: string;
  onCouponCode: (value: string) => void;
  deliveryNotes: string;
  onDeliveryNotes: (value: string) => void;
  cutlery: boolean;
  onCutlery: (value: boolean) => void;
  serviceBlocked: boolean;
  serviceChecking: boolean;
  serviceReason: string | null;
  restaurantOpen: boolean;
  closureMessage: string;
  slug: string;
  eta?: string;
  activeOrderNumber: string;
  queryOrder: string;
  queryToken: string;
}) {
  if (screen === "cart") {
    return (
      <main className="min-h-screen bg-[#fffaf3]">
        <header className="paper-grain relative overflow-hidden border-b border-[#ead8c6] bg-[#fffdf9]">
          <div className="relative mx-auto flex min-h-20 max-w-5xl items-center gap-4 px-4 py-4 sm:px-6">
            <button
              onClick={onMenu}
              aria-label="Back to menu"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#e7d2c0] bg-[#fffdf9] text-[#684d3c] hover:bg-[#f8ecdf]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#a37960]">
                Your order
              </p>
              <h1 className="font-display mt-1 text-3xl leading-none text-[#382719]">
                Review & checkout
              </h1>
            </div>
          </div>
        </header>
        {!restaurantOpen && (
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              The kitchen is closed — {closureMessage}. Checkout is paused until we reopen.
            </div>
          </div>
        )}
        <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 md:grid-cols-[1fr_360px]">
          <section className="ticket-edge bg-[#fffdf9] p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm font-extrabold text-[#4c3424]">
                {cart.length} item{cart.length !== 1 ? "s" : ""} from your order
              </p>
              <button
                onClick={onMenu}
                className="min-h-[44px] text-xs font-extrabold text-[#c84630]"
              >
                + Add more items
              </button>
            </div>
            {cart.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm font-bold text-[#9b7a66]">
                  Your cart is empty — let's fix that.
                </p>
                <Button
                  onClick={onMenu}
                  className="mt-4 h-12 min-h-[44px] rounded-xl bg-[#c84630] px-6 font-extrabold hover:bg-[#ad3627]"
                >
                  Browse the menu
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                {cart.map((line) => (
                  <div
                    key={line.id}
                    className="flex gap-3 border-b border-dashed border-[#ead8c6] pb-5 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-[#382719]">
                        {line.item.name}
                      </p>
                      <p className="mt-1 text-xs text-[#8d705c]">
                        {line.modifiers?.join(" · ") || "No customizations"}
                      </p>
                      {line.note && (
                        <p className="mt-1 text-xs italic text-[#8d705c]">
                          "{line.note}"
                        </p>
                      )}
                      <button
                        onClick={() => onQuantity(line.id, 0)}
                        aria-label={`Remove ${line.item.name} from cart`}
                        className="mt-2 min-h-[44px] text-xs font-bold text-[#a26d50] hover:text-[#c84630]"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="mb-2 text-sm font-extrabold">
                        {formatINR(line.unitPrice * line.quantity)}
                      </p>
                      <Quantity
                        compact
                        allowZero
                        value={line.quantity}
                        onChange={(next) => onQuantity(line.id, next)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <aside className="space-y-4">
            <CheckoutDetailsForm
              deliveryAddress={deliveryAddress}
              onEditLocation={onEditLocation}
              customerPhone={customerPhone}
              onCustomerPhone={onCustomerPhone}
              couponCode={couponCode}
              onCouponCode={onCouponCode}
              deliveryNotes={deliveryNotes}
              onDeliveryNotes={onDeliveryNotes}
              cutlery={cutlery}
              onCutlery={onCutlery}
              serviceBlocked={serviceBlocked}
              serviceChecking={serviceChecking}
              serviceReason={serviceReason}
              disabled={processing}
            />
            <CartTicket
              cart={cart}
              total={total}
              itemTotal={itemTotal}
              packaging={packaging}
              delivery={delivery}
              taxes={taxes}
              onQuantity={onQuantity}
              onCheckout={onCheckout}
              processing={processing}
              restaurant={restaurant}
              estimated
              checkoutBlocked={!restaurantOpen || serviceBlocked}
              checkoutHint={
                !restaurantOpen
                  ? closureMessage
                  : serviceBlocked
                  ? "This address is outside our delivery area."
                  : undefined
              }
            />
          </aside>
        </div>
      </main>
    );
  }

  if (screen === "checkout") {
    return (
      <main className="min-h-screen bg-[#fffaf3]">
        <header className="paper-grain relative overflow-hidden border-b border-[#ead8c6] bg-[#fffdf9]">
          <div className="relative mx-auto flex min-h-20 max-w-5xl items-center gap-4 px-4 py-4 sm:px-6">
            <button
              onClick={onMenu}
              aria-label="Back to menu"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#e7d2c0] bg-[#fffdf9] text-[#684d3c] hover:bg-[#f8ecdf]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#a37960]">
                Almost there
              </p>
              <h1 className="font-display mt-1 text-3xl leading-none text-[#382719]">
                Checkout
              </h1>
            </div>
          </div>
        </header>
        {!restaurantOpen && (
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              The kitchen is closed — {closureMessage}. Checkout is paused until we reopen.
            </div>
          </div>
        )}
        <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 md:grid-cols-[1fr_360px]">
          <CheckoutDetailsForm
            deliveryAddress={deliveryAddress}
            onEditLocation={onEditLocation}
            customerPhone={customerPhone}
            onCustomerPhone={onCustomerPhone}
            couponCode={couponCode}
            onCouponCode={onCouponCode}
            deliveryNotes={deliveryNotes}
            onDeliveryNotes={onDeliveryNotes}
            cutlery={cutlery}
            onCutlery={onCutlery}
            serviceBlocked={serviceBlocked}
            serviceChecking={serviceChecking}
            serviceReason={serviceReason}
            disabled={processing}
          />
          <aside>
            <CartTicket
              cart={cart}
              total={total}
              itemTotal={itemTotal}
              packaging={packaging}
              delivery={delivery}
              taxes={taxes}
              onQuantity={onQuantity}
              onCheckout={onCheckout}
              processing={processing}
              restaurant={restaurant}
              estimated
              checkoutBlocked={!restaurantOpen || serviceBlocked}
              checkoutHint={
                !restaurantOpen
                  ? closureMessage
                  : serviceBlocked
                  ? "This address is outside our delivery area."
                  : undefined
              }
            />
          </aside>
        </div>
      </main>
    );
  }

  if (screen === "confirmation") {
    return (
      <OrderStatusView
        orderNumber={queryOrder}
        trackingToken={queryToken}
        restaurantName={restaurant?.name}
        etaFallback={restaurant?.eta ?? eta}
        onMenu={onMenu}
        variant="confirmation"
      />
    );
  }

  if (screen === "tracking") {
    return (
      <OrderStatusView
        orderNumber={activeOrderNumber}
        trackingToken={queryToken}
        restaurantName={restaurant?.name}
        etaFallback={restaurant?.eta ?? eta}
        // Guest tracking (/order/:number) carries no slug — goMenu falls back
        // to "/" there, so the error/success cards always offer a way out.
        onMenu={onMenu}
        variant="tracking"
      />
    );
  }

  // Safe fallback — never render ServiceSetupScreen from itself.
  return (
    <main className="grid min-h-screen place-items-center bg-[#fffaf3] px-4">
      <section className="w-full max-w-md rounded-2xl bg-[#fffdf9] p-8 text-center shadow-sm">
        <h1 className="font-display text-3xl text-[#382719]">Back to the menu</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#856653]">
          This page isn't part of ordering — let's get you back to the good stuff.
        </p>
        <Button
          onClick={onMenu}
          className="mt-6 h-12 min-h-[44px] rounded-xl bg-[#c84630] px-6 font-extrabold hover:bg-[#ad3627]"
        >
          Back to menu
        </Button>
      </section>
    </main>
  );
}

function CheckoutDetailsForm({
  deliveryAddress,
  onEditLocation,
  customerPhone,
  onCustomerPhone,
  couponCode,
  onCouponCode,
  deliveryNotes,
  onDeliveryNotes,
  cutlery,
  onCutlery,
  serviceBlocked,
  serviceChecking,
  serviceReason,
  disabled,
}: {
  deliveryAddress: DeliveryLocation | null;
  onEditLocation: () => void;
  customerPhone: string;
  onCustomerPhone: (value: string) => void;
  couponCode: string;
  onCouponCode: (value: string) => void;
  deliveryNotes: string;
  onDeliveryNotes: (value: string) => void;
  cutlery: boolean;
  onCutlery: (value: boolean) => void;
  serviceBlocked: boolean;
  serviceChecking: boolean;
  serviceReason: string | null;
  disabled?: boolean;
}) {
  return (
    <section aria-label="Checkout details" className="space-y-4 rounded-2xl border border-[#ead8c6] bg-[#fffdf9] p-5 shadow-sm">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#a37960]">
          Delivery address
        </p>
        {deliveryAddress?.confirmed ? (
          <div className="mt-2 flex items-start justify-between gap-3">
            <p className="text-sm font-bold leading-relaxed text-[#382719]">
              {deliveryAddress.flatHouse}, {deliveryAddress.area}, {deliveryAddress.city}{" "}
              {deliveryAddress.postalCode}
            </p>
            <button
              type="button"
              onClick={onEditLocation}
              disabled={disabled}
              className="min-h-[44px] shrink-0 text-xs font-extrabold text-[#c84630] disabled:opacity-50"
            >
              Change
            </button>
          </div>
        ) : (
          <Button
            type="button"
            onClick={onEditLocation}
            disabled={disabled}
            variant="outline"
            className="mt-2 h-11 min-h-[44px] w-full rounded-xl border-[#ddc6b5] font-extrabold text-[#c84630]"
          >
            <MapPin className="mr-2 h-4 w-4" />
            Set delivery location
          </Button>
        )}
        {serviceChecking && (
          <p aria-live="polite" className="mt-2 text-xs font-bold text-[#94715c]">
            Checking delivery availability…
          </p>
        )}
        {serviceBlocked && (
          <p role="alert" className="mt-2 text-xs font-bold text-[#c84630]">
            {serviceReason === "OUTSIDE_DELIVERY_RADIUS"
              ? "This address is outside our delivery area — try a closer address."
              : "We can't deliver to this address right now."}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="checkout-phone" className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#a37960]">
          Phone number
        </label>
        <Input
          id="checkout-phone"
          value={customerPhone}
          onChange={(event) => onCustomerPhone(event.target.value)}
          placeholder="10-digit mobile number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={15}
          disabled={disabled}
          className="mt-2 h-12 min-h-[44px] rounded-xl border-[#ddc6b5] text-base"
        />
        <p className="mt-1 text-xs text-[#94715c]">
          Order updates and the delivery partner reach you here.
        </p>
      </div>

      <div>
        <label htmlFor="checkout-coupon" className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#a37960]">
          Coupon code
        </label>
        <Input
          id="checkout-coupon"
          value={couponCode}
          onChange={(event) => onCouponCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="e.g. WELCOME10"
          type="text"
          autoComplete="off"
          maxLength={48}
          disabled={disabled}
          className="mt-2 h-12 min-h-[44px] rounded-xl border-[#ddc6b5] uppercase"
        />
      </div>

      <div>
        <label htmlFor="checkout-notes" className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#a37960]">
          Delivery notes
        </label>
        <textarea
          id="checkout-notes"
          value={deliveryNotes}
          onChange={(event) => onDeliveryNotes(event.target.value)}
          placeholder="Gate code, floor, ring the bell twice…"
          disabled={disabled}
          maxLength={1000}
          className="mt-2 min-h-20 w-full resize-none rounded-xl border border-[#ddc6b5] bg-white p-3 text-sm outline-none ring-[#c84630] focus:ring-2 disabled:opacity-50"
        />
      </div>

      <label htmlFor="checkout-cutlery" className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-bold text-[#553d2c]">
        <input
          id="checkout-cutlery"
          type="checkbox"
          checked={cutlery}
          onChange={(event) => onCutlery(event.target.checked)}
          disabled={disabled}
          className="h-5 w-5 accent-[#c84630]"
        />
        Include cutlery with my order
      </label>
    </section>
  );
}

function OrderStatusView({
  orderNumber,
  trackingToken,
  restaurantName,
  etaFallback,
  onMenu,
  variant,
}: {
  orderNumber: string;
  trackingToken: string;
  restaurantName?: string;
  etaFallback?: string;
  onMenu?: () => void;
  variant: "confirmation" | "tracking";
}) {
  const hasCredentials = orderNumber.length >= 5 && trackingToken.length >= 16;
  const tracking = trpc.storefront.orderTracking.useQuery(
    { orderNumber, trackingToken },
    { enabled: hasCredentials },
  );

  const eta = tracking.data?.estimatedMinutes
    ? `~${tracking.data.estimatedMinutes} min`
    : tracking.data?.delivery?.estimatedDelivery
    ? new Date(tracking.data.delivery.estimatedDelivery).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
      })
    : etaFallback;

  return (
    <main className="grid min-h-screen place-items-center bg-[#fffaf3] px-4 py-10">
      <section aria-live="polite" className="ticket-edge w-full max-w-lg bg-[#fffdf9] p-8 text-center shadow-sm">
        {!hasCredentials ? (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#faede0] text-[#c84630]">
              <PackageCheck className="h-7 w-7" />
            </div>
            <h1 className="font-display mt-5 text-4xl text-[#382719]">
              {variant === "confirmation" ? "Thank you!" : "Track your order"}
            </h1>
            <p role="alert" className="mt-3 text-sm leading-relaxed text-[#856653]">
              We couldn't find your secure order link. Please open tracking from
              your confirmation page or receipt.
            </p>
            {onMenu && (
              <Button
                onClick={onMenu}
                className="mt-6 h-12 min-h-[44px] rounded-xl bg-[#c84630] px-6 font-extrabold hover:bg-[#ad3627]"
              >
                Back to menu
              </Button>
            )}
          </>
        ) : tracking.isLoading ? (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#faede0] text-[#c84630]">
              <Clock3 className="h-7 w-7 animate-pulse" />
            </div>
            <h1 className="font-display mt-5 text-4xl text-[#382719]">Fetching your order…</h1>
            <p className="mt-3 text-sm text-[#856653]">One moment while we check the kitchen.</p>
          </>
        ) : tracking.isError || !tracking.data ? (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#fbe3dc] text-[#c84630]">
              <X className="h-7 w-7" />
            </div>
            <h1 className="font-display mt-5 text-4xl text-[#382719]">Couldn't load your order</h1>
            <p role="alert" className="mt-3 text-sm leading-relaxed text-[#856653]">
              {tracking.isError
                ? "Something went wrong while fetching your order. Please try again."
                : "We couldn't find this order — the link may be incomplete."}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button
                onClick={() => tracking.refetch()}
                variant="outline"
                className="h-12 min-h-[44px] rounded-xl border-[#ddc6b5] px-6 font-extrabold text-[#553d2c]"
              >
                Try again
              </Button>
              {onMenu && (
                <Button
                  onClick={onMenu}
                  className="h-12 min-h-[44px] rounded-xl bg-[#c84630] px-6 font-extrabold hover:bg-[#ad3627]"
                >
                  Back to menu
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e5f1e5] text-[#42774b]">
              <Check className="h-7 w-7" />
            </div>
            <h1 className="font-display mt-5 text-4xl text-[#382719]">
              {variant === "confirmation" ? "Thank you — order confirmed!" : "Your order"}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#856653]">
              {variant === "confirmation"
                ? `The kitchen ${restaurantName ? `at ${restaurantName} ` : ""}has your order and the burners are already warming up. Sit back — we'll take it from here.`
                : `Here's the latest from the kitchen${restaurantName ? ` at ${restaurantName}` : ""}.`}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs font-extrabold">
              <span className="rounded-full bg-[#382719] px-3 py-1.5 text-white">
                Order {tracking.data.orderNumber}
              </span>
              <span className="rounded-full bg-[#f7e6ca] px-3 py-1.5 uppercase tracking-wide text-[#9c5a21]">
                {String(tracking.data.status).replace(/_/g, " ")}
              </span>
              {eta && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#e5f1e5] px-3 py-1.5 text-[#42774b]">
                  <Clock3 className="h-3.5 w-3.5" />
                  ETA {eta}
                </span>
              )}
            </div>
            <div className="mt-5 space-y-2 border-t border-dashed border-[#ead8c6] pt-4 text-left">
              {tracking.data.items.map((item: { id: string; itemNameSnapshot: string; quantity: number; unitPricePaise: number }) => (
                <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold text-[#442f20]">
                    {item.quantity} × {item.itemNameSnapshot}
                  </span>
                  <span className="font-bold text-[#94715c]">
                    {formatINR((item.unitPricePaise / 100) * item.quantity)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-dashed border-[#ead8c6] pt-3 text-base font-extrabold text-[#382719]">
                <span>Paid total</span>
                <span>{formatINR(tracking.data.totalPaise / 100)}</span>
              </div>
              {(tracking.data.deliveryArea || tracking.data.deliveryCity) && (
                <p className="flex items-center gap-1.5 text-xs text-[#94715c]">
                  <MapPin className="h-3.5 w-3.5" />
                  Delivering to {[tracking.data.deliveryArea, tracking.data.deliveryCity].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            {tracking.data.history.length > 0 && (
              <ol className="mt-5 space-y-2 border-t border-dashed border-[#ead8c6] pt-4 text-left">
                {tracking.data.history.map((entry: { status: string; note: string | null; createdAt: Date | string }, index: number) => (
                  <li key={`${entry.status}-${index}`} className="flex items-start gap-2 text-xs text-[#856653]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#42774b]" />
                    <span>
                      <span className="font-extrabold text-[#553d2c]">
                        {String(entry.status).replace(/_/g, " ")}
                      </span>
                      {entry.note ? ` — ${entry.note}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {onMenu && (
              <Button
                onClick={onMenu}
                className="mt-6 h-12 min-h-[44px] rounded-xl bg-[#c84630] px-6 font-extrabold hover:bg-[#ad3627]"
              >
                Back to menu
              </Button>
            )}
          </>
        )}
      </section>
    </main>
  );
}

/** No slug in path: platform landing on the platform domain, helper otherwise. */
function PlatformGate() {
  const { isPlatform, isLoading, featuredName, featuredUrl } = usePlatformHost();
  if (isLoading) return <MenuSkeleton />;
  if (isPlatform) {
    return (
      <Suspense fallback={<MenuSkeleton />}>
        <PlatformLanding featuredName={featuredName} featuredUrl={featuredUrl} />
      </Suspense>
    );
  }
  return <NoSlugScreen />;
}

function NoSlugScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#fffaf3] px-4">
      <section className="w-full max-w-md rounded-2xl bg-[#fffdf9] p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#faede0] text-[#c84630]">
          <Store className="h-6 w-6" />
        </div>
        <h1 className="font-display mt-4 text-3xl text-[#382719]">Pick a kitchen to start</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#856653]">
          This link doesn't point at a restaurant. Ask the restaurant for their
          direct ordering link.
        </p>
      </section>
    </main>
  );
}

function StorefrontUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#fffaf3] px-4">
      <section className="w-full max-w-md rounded-2xl bg-[#fffdf9] p-8 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#faede0] text-[#c84630]">
          <Utensils className="h-6 w-6" />
        </div>
        <h1 className="font-display mt-4 text-3xl text-[#382719]">This kitchen isn't available</h1>
        <p role="alert" className="mt-3 text-sm leading-relaxed text-[#856653]">
          We couldn't load this storefront. It may have moved or be offline.
        </p>
        <Button
          onClick={onRetry}
          className="mt-6 h-12 min-h-[44px] rounded-xl bg-[#c84630] px-6 font-extrabold hover:bg-[#ad3627]"
        >
          Try again
        </Button>
      </section>
    </main>
  );
}

function MenuSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading menu" className="min-h-screen bg-[#fffaf3] pb-28">
      <div className="mx-auto max-w-[1440px] animate-pulse px-4 sm:px-6 lg:px-10">
        {/* Slim header */}
        <div className="flex h-[76px] items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-[#eadfd4]" />
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-[#eadfd4]" />
            <div className="h-3 w-56 rounded bg-[#eadfd4]" />
          </div>
        </div>
        {/* Hero */}
        <div className="h-[220px] rounded-2xl bg-[#eadfd4] lg:h-[260px]" />
        {/* Search + rail */}
        <div className="mt-4 h-12 rounded-2xl bg-[#eadfd4]" />
        <div className="mt-3 flex gap-2">
          {[96, 120, 88, 110].map((width) => (
            <div key={width} style={{ width }} className="h-11 shrink-0 rounded-full bg-[#eadfd4]" />
          ))}
        </div>
        {/* Menu rows shaped like the dish cards */}
        <div className="mt-5 space-y-3">
          {[1, 2, 3, 4].map((key) => (
            <div key={key} className="flex gap-3 rounded-2xl border border-[#ead8c6] bg-[#fffdf9] p-3">
              <div className="min-w-0 flex-1 space-y-2 py-1">
                <div className="h-3 w-16 rounded bg-[#eadfd4]" />
                <div className="h-5 w-3/4 rounded bg-[#eadfd4]" />
                <div className="h-4 w-1/4 rounded bg-[#eadfd4]" />
                <div className="h-3 w-full rounded bg-[#eadfd4]" />
                <div className="h-3 w-2/3 rounded bg-[#eadfd4]" />
              </div>
              <div className="w-[120px] shrink-0">
                <div className="aspect-square w-full rounded-xl bg-[#eadfd4]" />
                <div className="mx-auto -mt-5 h-11 w-[104px] rounded-xl bg-[#eadfd4]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
