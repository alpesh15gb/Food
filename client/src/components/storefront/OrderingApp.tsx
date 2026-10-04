/**
 * Cloud Kitchen Storefront — root orchestrator.
 * Wraps all storefront components in a `.storefront` scoped container.
 * Holds ALL state, performs ALL data fetching, routes to screens.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { X } from "lucide-react";
import { formatINR, type MenuItem } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { adaptStorefront, type StorefrontMenuItem } from "@/lib/storefrontAdapter";
import DeliveryLocationDrawer, {
  type DeliveryLocation,
} from "@/components/DeliveryLocationDrawer";

import type { CartLine } from "./types";
import { normalizePhone } from "./types";
import { useCartQuote } from "./useCartQuote";
import MenuSkeleton from "./MenuSkeleton";
import TopBar from "./TopBar";
import HeroBanner from "./HeroBanner";
import DeliveryBar from "./DeliveryBar";
import OffersStrip from "./OffersStrip";
import SearchAndFilters from "./SearchAndFilters";
import PopularCarousel from "./PopularCarousel";
import MenuStream from "./MenuStream";
import StorefrontFooter from "./StorefrontFooter";
import CartSidebar from "./CartSidebar";
import MobileCartBar from "./MobileCartBar";
import CustomizationDrawer from "./CustomizationDrawer";
import AuthDrawer from "./AuthDrawer";
import CheckoutScreen from "./CheckoutScreen";
import TrackingScreen from "./TrackingScreen";
import StorefrontSeo from "./StorefrontSeo";

export default function OrderingApp({ slug, trackingNumber }: { slug?: string; trackingNumber?: string }) {
  const [, navigate] = useLocation();
  const pathSlug = slug || "";
  const hasPathSlug = pathSlug.length >= 2;

  // Resolve default slug for root domain visits (e.g. 9housekitchen.in/)
  const hostSlugQuery = trpc.storefront.defaultSlug.useQuery(undefined, {
    enabled: !hasPathSlug,
  });
  const hostSlug = !hasPathSlug ? (hostSlugQuery.data?.slug ?? "") : "";
  const storefrontSlug = hasPathSlug ? pathSlug : hostSlug;
  const hasSlug = storefrontSlug.length >= 2;

  // --- Data fetching ---
  const storefrontQuery = trpc.storefront.get.useQuery(
    { slug: storefrontSlug },
    { enabled: hasSlug }
  );
  // Slug-scoped: without it the server only checks env vars and misses the
  // per-restaurant vault keys, wrongly reporting payments as disabled.
  const paymentConfig = trpc.storefront.paymentConfig.useQuery(
    { slug: storefrontSlug },
    { enabled: hasSlug }
  );
  const initiatePayment = trpc.storefront.initiatePayment.useMutation();
  const verifyPayment = trpc.storefront.verifyPayment.useMutation();

  // Memoised on the raw payload. `adaptStorefront` builds fresh `restaurant`,
  // `menu` and `categories` arrays every call, so without this the returned
  // identities changed on every render and EVERY downstream useMemo (estimate,
  // search results, cartQuantities, soldOutLineIds, amountToMinOrder) missed —
  // re-filtering the whole menu and re-rendering every MenuCard on each keystroke.
  const storefront = useMemo(
    () => (storefrontQuery.data ? adaptStorefront(storefrontQuery.data) : null),
    [storefrontQuery.data]
  );
  const restaurant = storefront?.restaurant;
  const categories = storefront?.categories ?? [];
  const liveMenu = storefront?.menu ?? [];
  const offers = storefront?.offers ?? [];

  // --- Dynamic theming ---
  useEffect(() => {
    if (!storefront?.theme) return;
    const root = document.documentElement;
    const t = storefront.theme;
    root.style.setProperty("--color-primary", t.primaryColor);
    root.style.setProperty("--color-accent", t.accentColor);
    root.style.setProperty("--font-display", t.fontFamily);
    root.style.setProperty("--font-body", t.bodyFontFamily);
    if (t.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = t.faviconUrl;
    }
    return () => {
      root.style.removeProperty("--color-primary");
      root.style.removeProperty("--color-accent");
      root.style.removeProperty("--font-display");
      root.style.removeProperty("--font-body");
    };
  }, [storefront?.theme]);

  // --- Screen routing ---
  // Read the router's location rather than window.location directly: wouter is
  // already subscribed, and reading the raw path misses in-app navigation.
  const [wouterPath] = useLocation();
  const path = wouterPath;
  const screen = path.includes("/cart")
    ? "cart"
    : path.includes("/checkout")
    ? "checkout"
    : path.includes("/confirmation")
    ? "confirmation"
    : path.includes("/order/")
    ? "tracking"
    : "menu";

  // --- State ---
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selected, setSelected] = useState<StorefrontMenuItem | null>(null);
  const [customQty, setCustomQty] = useState(1);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);
  // Coupon the customer has typed/applied. Sent to `storefront.quote` so the
  // server validates it and prices the discount, and to `initiatePayment` so the
  // same code is actually redeemed.
  const [couponInput, setCouponInput] = useState("");
  // Re-entry guard: state alone lags a frame, so rapid double-clicks could
  // fire startSecurePayment twice before `processing` flips.
  const paymentInFlight = useRef(false);
  // Idempotency key for the CURRENT checkout attempt.
  //
  // It must be minted when an attempt begins, not derived from render-time state:
  // the previous version regenerated on `[cart, couponInput]`, and the coupon
  // field commits on every keystroke, so touching it between a failed attempt and
  // its retry produced a new key — missing the server's replay branch and creating
  // a second order, a second stock decrement and a second coupon burn.
  const paymentAttemptKeyRef = useRef("");
  const mintAttemptKey = useCallback(() => {
    paymentAttemptKeyRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `ck-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    return paymentAttemptKeyRef.current;
  }, []);
  // Seed once so the very first attempt has a key; a completed or abandoned
  // payment mints a fresh one for the next genuine attempt.
  useEffect(() => {
    mintAttemptKey();
  }, [mintAttemptKey]);
  const [deliveryAddress, setDeliveryAddress] =
    useState<DeliveryLocation | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState(
    // Guarded: `window.localStorage` THROWS when storage is blocked (Safari
    // private mode, third-party-cookie block). An unguarded read here happened
    // during render, so the storefront never mounted at all.
    () => {
      try {
        return localStorage.getItem("ck_phone_prefill") ?? "";
      } catch {
        return "";
      }
    }
  );
  const persistPhone = (v: string) => {
    setCustomerPhone(v);
    try {
      localStorage.setItem("ck_phone_prefill", v);
    } catch {
      /* private mode — prefill skipped */
    }
  };

  // Auth state
  const [authOpen, setAuthOpen] = useState(false);
  const [otpStep, setOtpStep] = useState<"phone" | "verify">("phone");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const sendOtp = trpc.storefront.sendOtp.useMutation();
  const verifyOtp = trpc.storefront.verifyOtp.useMutation();
  const customerLogout = trpc.storefront.customerLogout.useMutation();
  const customerMe = trpc.storefront.customerMe.useQuery();
  const loggedInPhone = customerMe.data?.phone ?? null;

  // --- Pricing ---
  //
  // `estimate` is the local fallback shown while the server quote is in flight (and
  // if it fails). It mirrors the restaurant's configured GST on itemTotal + packaging
  // and is deliberately never treated as the price owed — `serverTotals` wins as soon
  // as the server answers, so the number displayed is the number checkout charges.
  const estimate = useMemo(() => {
    const itemTotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const packaging = cart.length ? (restaurant?.packagingFee ?? 15) : 0;
    const delivery = cart.length ? (restaurant?.deliveryFee ?? 30) : 0;
    const gstRate = parseFloat(String(restaurant?.gstPercentage ?? "5"));
    const rate = Number.isFinite(gstRate) ? gstRate : 5;
    const taxes = Math.round((itemTotal + packaging) * (rate / 100));
    return {
      itemTotal,
      packaging,
      delivery,
      taxes,
      grandTotal: Math.max(0, itemTotal + packaging + delivery + taxes),
    };
  }, [cart, restaurant]);

  // Hard ceiling on a single line's quantity. The server rejects anything above
  // `maxQuantityPerOrder` by THROWING, which fails the whole quote and leaves the
  // customer with a permanent "We could not price your cart" and no way to recover
  // from inside the cart. Matching the server's own default keeps the two in step.
  const MAX_LINE_QTY = 20;

  // Per-item ceiling, keyed by menu item id. `maxQuantityPerOrder` is optional
  // server metadata; when it is absent we fall back to MAX_LINE_QTY.
  const maxForItem = useCallback(
    (itemId: string): number => {
      const menuItem = liveMenu.find((m) => m.id === itemId);
      const configured = (menuItem as { maxQuantityPerOrder?: number | null })
        ?.maxQuantityPerOrder;
      return typeof configured === "number" && configured >= 1
        ? Math.min(configured, MAX_LINE_QTY)
        : MAX_LINE_QTY;
    },
    [liveMenu]
  );

  const { quote, rupees: serverTotals, isFetching: quoteFetching, errorMessage: quoteError } =
    useCartQuote({
      slug: storefrontSlug,
      cart,
      couponCode: couponInput,
      // Lets the server apply per-customer coupon limits in the preview, so a
      // coupon the customer has already spent is refused in the cart rather than
      // priced here and then rejected at checkout.
      phone: customerPhone,
    });

  const itemTotal = serverTotals?.itemTotal ?? estimate.itemTotal;
  const packaging = serverTotals?.packaging ?? estimate.packaging;
  const delivery = serverTotals?.delivery ?? estimate.delivery;
  const taxes = serverTotals?.taxes ?? estimate.taxes;
  const grandTotal = serverTotals?.grandTotal ?? estimate.grandTotal;
  const totalQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);

  // Minimum-order gap. `useCartQuote` keeps the previous quote on screen while
  // repricing, so a stale `belowMinimum` would gate the CTA against a cart the
  // customer has already changed. While a fetch is in flight (or before the
  // first answer) fall back to the local estimate — paired with the local
  // `minOrder`, because mixing a stale server item total with a local minimum
  // would drift just as badly.
  const minOrder = restaurant?.minOrder ?? 0;
  const amountToMinOrder = useMemo(
    () =>
      quoteFetching || !quote
        ? Math.max(0, minOrder - estimate.itemTotal)
        : Math.max(0, quote.amountToMinOrderPaise / 100),
    [quote, quoteFetching, minOrder, estimate.itemTotal]
  );

  // --- Cart persistence: survive reloads, clear after successful payment ---
  const cartKey = storefrontSlug ? `ck_cart:${storefrontSlug}` : null;
  const restoredKeyRef = useRef<string | null>(null);
  // The lines `restoredKeyRef` just adopted for this key. Non-null means "the
  // cart state has not caught up with the restore yet" — see the persist effect.
  const pendingRestoreRef = useRef<CartLine[] | null>(null);

  useEffect(() => {
    if (!cartKey || restoredKeyRef.current === cartKey) return;
    restoredKeyRef.current = cartKey;
    let clean: CartLine[] = [];
    try {
      const raw = localStorage.getItem(cartKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          clean = parsed.filter(
            (line): line is CartLine =>
              !!line &&
              typeof line.id === "string" &&
              !!line.item &&
              typeof line.item.id === "string" &&
              typeof line.quantity === "number" &&
              Number.isInteger(line.quantity) &&
              line.quantity >= 1 &&
              typeof line.unitPrice === "number" &&
              Number.isFinite(line.unitPrice)
          );
        }
      }
    } catch {
      /* corrupt snapshot — start fresh */
    }
    pendingRestoreRef.current = clean;
    // Always assign: on a slug swap the previous restaurant's lines must be
    // dropped even when the new slug has no snapshot of its own.
    setCart(clean);
  }, [cartKey]);

  useEffect(() => {
    if (!cartKey || restoredKeyRef.current !== cartKey) return;
    // This effect is declared after the restore, so it runs in the same commit —
    // at which point `cart` can still hold the PREVIOUS slug's lines. Writing
    // then would persist one restaurant's dishes under another restaurant's key,
    // which checkout rejects with "Item ... is not in the menu". Wait until the
    // restored value is actually the live cart before touching storage.
    if (pendingRestoreRef.current !== null) {
      if (cart !== pendingRestoreRef.current) return;
      // Restored value is live and storage already matches it; nothing to write.
      pendingRestoreRef.current = null;
      return;
    }
    try {
      if (cart.length === 0) localStorage.removeItem(cartKey);
      else localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      /* private mode — persistence skipped */
    }
  }, [cart, cartKey]);

  const clearCart = () => {
    setCart([]);
    try {
      if (cartKey) localStorage.removeItem(cartKey);
    } catch {
      /* private mode — nothing to clear */
    }
  };

  // A coupon belongs to the restaurant that issued it. Carrying it across a slug
  // change made the next restaurant's checkout die on "Coupon X is not valid for
  // this restaurant" while the cart itself correctly reset.
  useEffect(() => {
    setCouponInput("");
  }, [storefrontSlug]);

  // --- Cart quantity map (for MenuCard inline steppers) ---
  const cartQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const line of cart) {
      // Sum every line that carries this base item id, including customised
      // ones — the menu card shows what the customer perceives as "in cart".
      map[line.item.id] = (map[line.item.id] ?? 0) + line.quantity;
    }
    return map;
  }, [cart]);

  /**
   * Which cart line a menu card's stepper drives, and how much headroom is left.
   *
   * The stepper displays the SUM of all lines for an item, but must never assign
   * that sum to a single line: two customised lines at qty 1 render "2", so "+"
   * used to set line 0 to 3 (a cart of 4 after one press) and "-" set it to 1
   * (no-op, button dead). Instead the stepper mutates ONE line at a time and the
   * ceiling is the remaining headroom across all lines, so repeated presses walk
   * the lines down and then remove them.
   */
  const itemStepTarget = useCallback(
    (itemId: string): { lineId: string | null; headroom: number } => {
      const defaultId = `${itemId}-default`;
      const lines = cart.filter((line) => line.item.id === itemId);
      const target =
        lines.find((l) => l.id === defaultId) ?? lines[0] ?? null;
      const total = lines.reduce((sum, l) => sum + l.quantity, 0);
      return { lineId: target?.id ?? null, headroom: Math.max(0, maxForItem(itemId) - total) };
    },
    [cart, maxForItem]
  );

  /**
   * Cart lines whose dish is no longer available — their "+" is frozen.
   *
   * Availability must come from the LIVE menu, not from the snapshot frozen into
   * `line.item` when the dish was added and round-tripped through localStorage.
   * Reading the snapshot meant a dish that sold out since the last visit still
   * looked available (so the customer built an order the server refuses), while a
   * dish that came back stayed frozen forever.
   */
  const availabilityByItemId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of liveMenu) map.set(item.id, item.availability);
    return map;
  }, [liveMenu]);

  const isLineAvailable = useCallback(
    (line: CartLine): boolean => {
      const live = availabilityByItemId.get(line.item.id);
      // A dish that is no longer on the menu at all cannot be ordered.
      if (live === undefined) return false;
      return live === "AVAILABLE";
    },
    [availabilityByItemId]
  );

  const soldOutLineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const line of cart) {
      if (!isLineAvailable(line)) ids.add(line.id);
    }
    return ids;
  }, [cart, isLineAvailable]);

  // --- Search & filter ---
  const results = useMemo(
    () =>
      liveMenu.filter((item) => {
        const needle = query.toLowerCase().trim();
        return (
          !needle ||
          [item.name, item.description, item.category, item.tag]
            .join(" ")
            .toLowerCase()
            .includes(needle)
        );
      }),
    [liveMenu, query]
  );

  const popularItems = useMemo(() => {
    const bestsellers = liveMenu.filter((item) => item.isBestseller);
    return (bestsellers.length ? bestsellers : liveMenu).slice(0, 8);
  }, [liveMenu]);

  // --- Cart handlers ---
  const changeQty = (id: string, quantity: number) =>
    setCart((current) =>
      quantity < 1
        ? current.filter((line) => line.id !== id)
        : current.map((line) =>
            line.id === id
              ? {
                  ...line,
                  // A dish can sell out while it sits in the cart. Allow the
                  // line to be reduced or removed but never increased, or the
                  // stepper builds an order the server rejects at checkout.
                  quantity: soldOutLineIds.has(id)
                    ? Math.min(line.quantity, quantity)
                    : quantity,
                }
              : line
          )
    );

  // For MenuCard inline quantity: mutate ONE line at a time. See itemStepTarget
  // for why the displayed sum must never be assigned to a single line.
  const changeItemQty = (itemId: string, delta: number) => {
    setCart((current) => {
      const lines = current.filter((line) => line.item.id === itemId);
      if (!lines.length) return current;
      const target =
        lines.find((l) => l.id === `${itemId}-default`) ?? lines[0];
      const index = current.findIndex((l) => l.id === target.id);
      if (index === -1) return current;

      const ceiling = maxForItem(itemId);
      const total = lines.reduce((sum, l) => sum + l.quantity, 0);

      if (delta < 0) {
        // Prefer draining this line; only remove it once it is already at 1 so a
        // single press never deletes a customised line outright.
        if (target.quantity > 1) {
          return current.map((line, i) =>
            i === index ? { ...line, quantity: line.quantity - 1 } : line
          );
        }
        return current.filter((_, i) => i !== index);
      }

      // Never exceed the ceiling across all lines for this item.
      if (total >= ceiling) {
        toast.error(`Maximum ${ceiling} per order.`);
        return current;
      }
      return current.map((line, i) =>
        i === index ? { ...line, quantity: line.quantity + 1 } : line
      );
    });
  };

  const simpleAdd = (item: MenuItem) => {
    if (item.availability !== "AVAILABLE") {
      toast.error(`${item.name} is not available right now.`);
      return;
    }
    const ceiling = maxForItem(item.id);
    const inCart = cart
      .filter((line) => line.item.id === item.id)
      .reduce((sum, line) => sum + line.quantity, 0);
    if (inCart >= ceiling) {
      toast.error(`Maximum ${ceiling} per order.`);
      return;
    }
    setCart((current) => {
      const found = current.find(
        (line) => line.id === `${item.id}-default`
      );
      return found
        ? current.map((line) =>
            line.id === found.id
              ? { ...line, quantity: line.quantity + 1 }
              : line
          )
        : [
            ...current,
            {
              id: `${item.id}-default`,
              item,
              quantity: 1,
              unitPrice: item.price,
            },
          ];
    });
    toast.success(`${item.name} added to your order`);
  };

  const openItem = (item: MenuItem) => {
    // Gate here, not just in `simpleAdd`: the popular carousel and the menu card
    // both route here, and a sold-out dish used to still open the customisation
    // drawer and land in the cart, only for checkout to reject it.
    if (item.availability !== "AVAILABLE") {
      toast.error(`${item.name} is not available right now.`);
      return;
    }
    const full = item as StorefrontMenuItem;
    const groups = full.addonGroups ?? [];
    const variants = full.variants ?? [];
    if (item.customizable || groups.length > 0 || variants.length > 0) {
      setSelected(full);
      setCustomQty(1);
      setVariantId(null);
      setOptionIds([]);
      setNote("");
    } else {
      simpleAdd(item);
    }
  };

  const addCustomItem = () => {
    if (!selected) return;
    const ceiling = maxForItem(selected.id);
    const inCart = cart
      .filter((line) => line.item.id === selected.id)
      .reduce((sum, line) => sum + line.quantity, 0);
    if (inCart + customQty > ceiling) {
      toast.error(`Maximum ${ceiling} per order.`);
      return;
    }
    if (customQty < 1) return;
    const groups = selected.addonGroups ?? [];
    const variants = selected.variants ?? [];
    const variant = variants.find((v) => v.id === variantId) ?? null;
    const variantUpcharge = variant ? variant.pricePaise / 100 : 0;
    const picked = groups.flatMap((group) =>
      group.options.filter((opt) => optionIds.includes(opt.id))
    );
    const optionsUpcharge = picked.reduce(
      (sum, opt) => sum + opt.pricePaise / 100,
      0
    );
    const unitPrice = selected.price + variantUpcharge + optionsUpcharge;
    const displayNames = [
      ...(variant ? [variant.name] : []),
      ...picked.map((opt) => opt.name),
    ];
    setCart((current) => [
      ...current,
      {
        id: `${selected.id}-${Date.now()}`,
        item: selected,
        quantity: customQty,
        unitPrice,
        note,
        modifiers: displayNames,
        modifierOptionIds: picked.map((opt) => opt.id),
        selectedVariantId: variant?.id,
      },
    ]);
    toast.success(`${selected.name} added to your order`);
    setSelected(null);
  };

  // --- Customer Auth Handlers ---
  const handleSendOtp = async () => {
    const phone = normalizePhone(otpPhone);
    if (phone.length < 10) {
      setOtpError("Enter a valid 10-digit phone number.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    try {
      await sendOtp.mutateAsync({ phone });
      setOtpStep("verify");
    } catch (err) {
      setOtpError(
        err instanceof Error ? err.message : "Failed to send code."
      );
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
      const result = await verifyOtp.mutateAsync({
        phone: normalizePhone(otpPhone),
        code: otpCode,
      });
      // Route through `persistPhone` so the checkout field updates too. Writing
      // localStorage directly left `customerPhone` holding the pre-login value,
      // so a customer who just verified their number still saw an empty (or
      // different) contact field and was asked for it again at checkout.
      persistPhone(normalizePhone(otpPhone));
      setAuthOpen(false);
      setOtpStep("phone");
      setOtpPhone("");
      setOtpCode("");
      customerMe.refetch();
      toast.success(
        result.isNewUser
          ? "Welcome! Your account is ready."
          : "Welcome back!"
      );
    } catch (err) {
      setOtpError(
        err instanceof Error
          ? err.message
          : "Invalid code. Please try again."
      );
    } finally {
      setOtpLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await customerLogout.mutateAsync();
    } catch {
      /* ignore errors on logout */
    }
    setAuthOpen(false);
    customerMe.refetch();
    toast.success("Logged out.");
  };

  // --- Payment ---
  const startSecurePayment = async () => {
    // Guard re-entry: rapid double-clicks must not open two Razorpay flows.
    if (paymentInFlight.current || processing) return;
    // Custom-domain race: storefrontSlug resolves async via defaultSlug.
    // Never start payment (or serviceability) with an unresolved slug.
    if (!storefrontSlug || storefrontSlug.length < 2) {
      toast.error("Restaurant is still loading. Please try again in a moment.");
      return;
    }
    // Closed kitchen fails FIRST: never walk the customer through address,
    // phone and payment before telling them. The menu screen also shows this
    // upfront (banner + disabled CTAs) — this guard is the backstop.
    if (restaurant && restaurant.orderingOpen === false) {
      toast.error("This kitchen is not taking orders right now.", {
        description:
          restaurant.orderingReason ??
          "Please try again during opening hours.",
      });
      return;
    }
    if (!paymentConfig.data?.enabled) {
      toast.error("Online payments are not configured yet.", {
        description:
          "The restaurant administrator can activate Razorpay from the integrations settings.",
      });
      return;
    }
    if (cart.length === 0) return toast.error("Add items to your cart first.");
    // A failed quote is reported first: falling through to the local min-order
    // comparison would blame the customer's basket for what is really a pricing
    // outage.
    if (quoteError && !quote) {
      return toast.error("We could not price your cart.", {
        description: "Please try again in a moment.",
      });
    }
    // A coupon the server has already refused must not be forwarded: it made
    // createOrderFromValidatedCart throw mid-checkout, leaving the cart
    // unorderable until the customer guessed to empty the field.
    const typedCoupon = couponInput.trim();
    if (typedCoupon && quote && !quote.couponApplied) {
      return toast.error(
        quote.couponError ?? `Coupon "${typedCoupon.toUpperCase()}" could not be applied.`,
        { description: "Clear the coupon field to continue without it." }
      );
    }
    // Prefer the server's own verdict; fall back to the local comparison only
    // while the quote is still loading. `quote.belowMinimum` mirrors checkout.
    if (quote?.belowMinimum) {
      return toast.error(
        `Minimum order is ${formatINR((quote.minOrderPaise || 0) / 100)}`,
        {
          description: `Add ${formatINR(quote.amountToMinOrderPaise / 100)} more to continue.`,
        }
      );
    }
    if (!quote && itemTotal < (restaurant?.minOrder ?? 0)) {
      return toast.error(
        `Minimum order is ${formatINR(restaurant?.minOrder ?? 0)}`
      );
    }
    if (!deliveryAddress?.confirmed) {
      setLocationOpen(true);
      return toast.error("Please confirm your delivery location first.", {
        description: "Tap on the delivery address bar to set your location.",
      });
    }
    if (normalizePhone(customerPhone).length < 10) {
      return toast.error("Please enter your phone number.");
    }

    // Serviceability pre-check (radius + Shadowfax pincode-pair when the
    // provider is configured — catches pincode-unserviceable addresses
    // BEFORE payment instead of failing late at dispatch).
    // Coerce + validate coordinates BEFORE the fetch: never send garbage
    // that 400s into a misleading "can't deliver" toast.
    const svcLat = Number(deliveryAddress.latitude);
    const svcLng = Number(deliveryAddress.longitude);
    const coordsValid =
      Number.isFinite(svcLat) &&
      Number.isFinite(svcLng) &&
      svcLat >= -90 &&
      svcLat <= 90 &&
      svcLng >= -180 &&
      svcLng <= 180 &&
      !(svcLat === 0 && svcLng === 0);
    if (!coordsValid) {
      return toast.error(
        "Delivery location is invalid — please re-confirm your pin."
      );
    }
    paymentInFlight.current = true;
    setProcessing(true);
    // Mint per attempt: a retry after a failed/dismissed payment must REUSE this
    // key so the server replays the existing order rather than creating a second
    // one. Only a genuinely new attempt (cart changed, or a payment completed)
    // should get a fresh key.
    if (!paymentAttemptKeyRef.current) mintAttemptKey();
    try {
      const dropPincode = /^\d{6}$/.test(deliveryAddress.postalCode ?? "")
        ? deliveryAddress.postalCode
        : undefined;
      console.debug("[serviceability] payload", {
        slug: storefrontSlug,
        latitude: svcLat,
        longitude: svcLng,
        postalCode: dropPincode,
      });
      // tRPC batch envelope: this server only answers batch=1 GETs — a bare
      // ?input= gets a 400 that used to masquerade as "unserviceable".
      const svcRes = await fetch(
        `/api/trpc/storefront.checkServiceability?batch=1&input=${encodeURIComponent(
          JSON.stringify({
            "0": {
              json: {
                slug: storefrontSlug,
                latitude: svcLat,
                longitude: svcLng,
                ...(dropPincode ? { postalCode: dropPincode } : {}),
              },
            },
          })
        )}`,
        { credentials: "include" }
      );
      // Defensive parse: non-JSON bodies and non-2xx (e.g. 400 validation
      // errors) are "could not verify" — never misread as unserviceable.
      let svcJson: unknown = null;
      try {
        const rawText = await svcRes.text();
        svcJson = rawText ? (JSON.parse(rawText) as unknown) : null;
      } catch {
        svcJson = null;
      }
      const failOpen = () => {
        paymentInFlight.current = false;
        setProcessing(false);
        toast.error(
          "Could not verify delivery availability. Please try again."
        );
      };
      if (!svcRes.ok || svcJson == null) {
        failOpen();
        return;
      }
      const envelope = svcJson as {
        result?: { data?: unknown };
        error?: unknown;
      } | Array<{ result?: { data?: unknown }; error?: unknown }>;
      const first = Array.isArray(envelope) ? envelope[0] : envelope;
      if (!first || first.error) {
        failOpen();
        return;
      }
      // SuperJSON batch payloads nest under result.data.json.
      const rawData = first.result?.data as { json?: unknown } | undefined;
      const serviceability = ((rawData && typeof rawData === "object" && "json" in rawData ? rawData.json : rawData) ?? svcJson) as {
        serviceable?: unknown;
        reason?: unknown;
      } | null;
      if (!serviceability || typeof serviceability.serviceable !== "boolean") {
        failOpen();
        return;
      }
      if (!serviceability.serviceable) {
        paymentInFlight.current = false;
        setProcessing(false);
        const reason =
          typeof serviceability.reason === "string"
            ? serviceability.reason
            : "";
        const description =
          reason === "OUTSIDE_DELIVERY_RADIUS"
            ? "Your location is outside our current delivery area."
            : reason === "SHADOWFAX_NOT_SERVICEABLE"
              ? "Our delivery partner doesn't serve this pincode yet."
              : reason === "SHADOWFAX_UNAVAILABLE"
                ? "Our delivery partner is unreachable right now. Please try again."
                : reason === "INVALID_LOCATION"
                  ? "Your delivery location looks invalid — please re-confirm your pin."
                  : reason === "NO_ACTIVE_OUTLET" ||
                      reason === "OUTLET_MISCONFIGURED"
                    ? "Our kitchen setup is incomplete. Please contact the restaurant."
                    : reason === "OUTLET_CLOSED"
                      ? "The restaurant is currently closed. Please try again later."
                      : "Please try a different address.";
        toast.error("Sorry, we can't deliver to this location.", {
          description,
        });
        return;
      }
    } catch {
      paymentInFlight.current = false;
      setProcessing(false);
      toast.error(
        "Could not verify delivery availability. Please try again."
      );
      return;
    }

    try {
      const created = await initiatePayment.mutateAsync({
        slug: storefrontSlug,
        // Stable across retries of THIS checkout attempt. The server replays the
        // existing order instead of minting a second one, so a dismissed Razorpay
        // modal or a double-tap cannot create two orders, decrement stock twice,
        // or burn a single-use coupon twice.
        idempotencyKey: paymentAttemptKeyRef.current || undefined,
        lines: cart.map((line) => ({
          menuItemId: line.item.id,
          quantity: line.quantity,
          modifierOptionIds: line.modifierOptionIds?.length
            ? line.modifierOptionIds
            : undefined,
          selectedVariantId: line.selectedVariantId ?? undefined,
          specialInstructions: line.note,
        })),
        ...(couponInput.trim() && quote?.couponApplied
          ? { couponCode: couponInput.trim().toUpperCase() }
          : {}),
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
        customerPhone,
      });

      // A 100%-off coupon produces a ₹0 order. The server creates it as
      // PLACED/PAID and deliberately returns no Razorpay order, so opening the
      // widget with an empty key used to throw, leave the order hidden from the
      // customer, and let a retry create a duplicate.
      if (created.freeOrder) {
        clearCart();
        toast.success("Order placed — no payment needed.");
        navigate(
          `/${storefrontSlug}/confirmation?order=${created.orderNumber}` +
            (created.trackingToken ? `&token=${created.trackingToken}` : "")
        );
        paymentInFlight.current = false;
        setProcessing(false);
        return;
      }

      // Load Razorpay checkout
      if (!window.Razorpay) {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Failed to load Razorpay"));
          document.body.appendChild(script);
        });
      }

      const RazorpayConstructor = window.Razorpay;
      if (!RazorpayConstructor)
        throw new Error("Razorpay not loaded");
      new RazorpayConstructor({
        key: created.keyId,
        amount: created.amountPaise,
        currency: created.currency,
        name: restaurant?.name ?? "Cloud Kitchen",
        description: `Order ${created.orderNumber}`,
        order_id: created.providerOrderId,
        handler: async (response: any) => {
          try {
            const result = await verifyPayment.mutateAsync({
              orderId: created.orderId,
              providerOrderId: response.razorpay_order_id,
              providerPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            // `confirmPayment` REPORTS business failures (bad signature, amount
            // mismatch, already-confirmed-by-another-payment) as a resolved
            // `{success:false}` rather than throwing, so this tRPC call resolves
            // on failure too. Without this check the customer was shown "order
            // confirmed" for an order the server never marked paid, and the cart
            // was cleared so they could not retry.
            if (!result?.success) {
              const reason =
                result?.error ?? "Payment could not be verified.";
              toast.error("Payment received but not confirmed.", {
                description: `${reason} If you were charged, contact ${restaurant?.contactPhone ?? "the restaurant"} with order ${created.orderNumber} — your money is safe and we will settle it.`,
                duration: 12000,
              });
              return;
            }
            // Clear the cart so back-button can't re-pay the same lines.
            clearCart();
            // The order is settled: the next attempt is a genuinely new order and
            // must not replay this one.
            mintAttemptKey();
            // Persist the tracking token so confirmation/tracking can authenticate.
            const paidToken = created.trackingToken ?? "";
            navigate(
              `/${storefrontSlug}/confirmation?order=${created.orderNumber}` +
                (paidToken ? `&token=${paidToken}` : "")
            );
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Payment verification failed."
            );
          } finally {
            paymentInFlight.current = false;
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            paymentInFlight.current = false;
            setProcessing(false);
          },
        },
      }).open();
    } catch (error) {
      paymentInFlight.current = false;
      setProcessing(false);
      toast.error(
        error instanceof Error
          ? error.message
          : "We couldn't start payment."
      );
    }
  };

  // --- Cart slide-over: modal behaviour ---
  // Hand-rolled rather than a <dialog>/Drawer, so the accessibility contract has
  // to be supplied here: the page behind must not scroll or stay tabbable, Escape
  // must close, and focus must come back to whatever opened it.
  const cartPanelRef = useRef<HTMLDivElement | null>(null);
  const cartOpenerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!cartOpen) return;
    cartOpenerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // Focus the panel itself rather than its first control: the close button and
    // the quantity steppers carry aria-labels, but the totals are plain text, so
    // landing on the dialog node announces "Your order" without skipping context.
    cartPanelRef.current?.focus();
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
      cartOpenerRef.current?.focus?.();
    };
  }, [cartOpen]);

  const handleCartPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setCartOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const panel = cartPanelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // --- Error state ---
  if (storefrontQuery.isError) {
    return (
      <div className="storefront">
        <main className="grid min-h-dvh place-items-center px-4" style={{ background: "var(--sf-bg)" }}>
          <div className="w-full max-w-md text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-500">
              <X className="h-7 w-7" />
            </div>
            <h1 className="sf-heading mt-5 text-2xl" style={{ color: "var(--sf-text)" }}>
              Something went wrong
            </h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--sf-text-secondary)" }}>
              We couldn't load this restaurant. Please try again.
            </p>
            <button
              onClick={() => storefrontQuery.refetch()}
              className="sf-add-btn mt-6 cursor-pointer touch-manipulation transition-all duration-200 hover:brightness-110 active:scale-95 [-webkit-tap-highlight-color:transparent]"
            >
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  // --- Loading state (includes waiting for defaultSlug resolution) ---
  if (!hasSlug || storefrontQuery.isLoading || !restaurant) return <MenuSkeleton />;

  const goMenu = () => navigate(`/${storefrontSlug}`);

  // Closed kitchens greet upfront (banner + disabled CTAs + early guard).
  // Ordering stays browsable; only payment is blocked.
  const orderingClosed = restaurant?.orderingOpen === false;
  const orderingReason = restaurant?.orderingReason ?? null;

  // --- Cart / Checkout / Confirmation / Tracking screens ---
  // Confirmation + tracking authenticate via ?order=&token= (or the
  // /order/:number path) and render the live status timeline. The tracking
  // token is required — without it the order stays private.
  const orderQuery = new URLSearchParams(window.location.search);
  const confirmationOrder = orderQuery.get("order") ?? "";
  const confirmationToken = orderQuery.get("token") ?? "";
  const trackingOrder =
    screen === "tracking" ? (trackingNumber || confirmationOrder) : confirmationOrder;

  const seo = (
    <StorefrontSeo
      slug={storefrontSlug}
      name={restaurant?.name ?? null}
      description={restaurant?.description}
      cuisines={restaurant?.cuisines ?? []}
      city={storefront?.outlet?.city}
      address={restaurant?.address}
      phone={restaurant?.contactPhone}
      image={restaurant?.bannerImage || restaurant?.logo}
    />
  );

  if (screen === "confirmation" || screen === "tracking") {
    return (
      <div className="storefront">
        {seo}
        <TrackingScreen
          orderNumber={trackingOrder}
          trackingToken={confirmationToken}
          restaurantName={restaurant?.name}
          onMenu={goMenu}
          variant={screen === "tracking" ? "tracking" : "confirmation"}
        />
      </div>
    );
  }

  if (["cart", "checkout"].includes(screen)) {
    return (
      <div className="storefront">
        {seo}
        <CheckoutScreen
          screen={screen}
          cart={cart}
          totalQuantity={totalQuantity}
          total={grandTotal}
          itemTotal={itemTotal}
          packaging={packaging}
          delivery={delivery}
          taxes={taxes}
          onMenu={goMenu}
          onQuantity={changeQty}
          maxQuantityFor={maxForItem}
          canIncreaseLine={isLineAvailable}
          onCheckout={startSecurePayment}
          processing={processing}
          customerPhone={customerPhone}
          onCustomerPhone={persistPhone}
          orderingClosed={orderingClosed}
          orderingReason={orderingReason}
          couponCode={couponInput}
          onCouponCodeChange={setCouponInput}
          couponError={quote?.couponError}
          couponApplied={quote?.couponApplied}
          couponDiscount={quote ? (quote.couponDiscountPaise || 0) / 100 : 0}
          pricingPending={quoteFetching}
          amountToMinOrder={amountToMinOrder}
        />
      </div>
    );
  }

  // --- Menu screen ---
  return (
    <div className="storefront">
      {seo}
      <main className="min-h-dvh pb-28 lg:pb-16" style={{ background: "var(--sf-bg)" }}>
        {/* Header */}
        <TopBar
          restaurantName={restaurant.name}
          restaurantLogo={restaurant.logo || undefined}
          itemCount={totalQuantity}
          onCart={() => setCartOpen(true)}
          onAccount={() => setAuthOpen(true)}
          query={query}
          onQueryChange={setQuery}
        />

        {/* Hero Banner */}
        <HeroBanner
          restaurant={{
            ...restaurant,
            logo: restaurant.logo || undefined,
            bannerImage: restaurant.bannerImage || undefined,
            // The hero's open/closed badge must follow the same schedule-aware
            // verdict as the banner below it. Passing the raw `isOpen` manual
            // toggle made the hero read "Open every day" while the page
            // underneath announced the kitchen was not taking orders.
            isOpen: !orderingClosed,
            eta: orderingClosed ? "" : restaurant.eta,
          }}
          firstItemImage={liveMenu[0]?.image}
          thumbs={[liveMenu[0]?.image, liveMenu[1]?.image].filter(Boolean) as string[]}
          menuCount={liveMenu.length}
        />

        {/* Delivery Address Bar + Offers */}
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <DeliveryBar
            deliveryAddress={deliveryAddress}
            onOpen={() => setLocationOpen(true)}
          />
          {restaurant.orderingOpen === false && (
            <div
              role="status"
              className="mt-3 rounded-[var(--sf-radius-card)] border p-4 text-center"
              style={{
                borderColor: "var(--sf-border)",
                background: "var(--sf-surface)",
              }}
            >
              <p
                className="text-sm font-extrabold"
                style={{ color: "var(--sf-text)" }}
              >
                Currently not taking orders
              </p>
              <p
                className="mt-1 text-xs leading-relaxed"
                style={{ color: "var(--sf-text-secondary)" }}
              >
                {restaurant.orderingReason ??
                  "Please try again during opening hours."}{" "}
                You can still browse the menu.
              </p>
            </div>
          )}
          <OffersStrip
            offers={offers}
            appliedCode={couponInput}
            onApply={(code) => {
              setCouponInput(code.trim().toUpperCase());
              setCartOpen(true);
            }}
          />
        </div>

        {/* Popular right now */}
        <div className="mt-10">
          <PopularCarousel items={popularItems} onAdd={openItem} />
        </div>

        {/* Menu header + category pills */}
        <SearchAndFilters
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          subtitle={restaurant.description || restaurant.cuisines.join(", ")}
        />

        {/* Menu grid */}
        <div className="mx-auto max-w-[1100px] px-4 pb-2 sm:px-6 lg:px-10">
          {query && (
            <div className="mb-4 flex items-center justify-between">
              <p className="min-w-0 truncate text-sm font-bold tabular-nums" style={{ color: "var(--sf-text)" }}>
                Results for{" "}
                <span style={{ color: "var(--sf-primary)" }}>"{query}"</span>
              </p>
              <button
                onClick={() => setQuery("")}
                className="shrink-0 cursor-pointer touch-manipulation px-2 py-2 text-xs font-bold transition-opacity duration-200 hover:underline [-webkit-tap-highlight-color:transparent]"
                style={{ color: "var(--sf-text-muted)" }}
              >
                Clear
              </button>
            </div>
          )}
          <MenuStream
            items={results}
            activeCategory={activeCategory}
            query={query}
            onAdd={openItem}
            cartQuantities={cartQuantities}
            onStep={changeItemQty}
            stepHeadroomFor={(id) => itemStepTarget(id).headroom}
          />
        </div>

        {/* Policies + contact (required on the storefront home page) */}
        <StorefrontFooter
          restaurantName={restaurant.name}
          address={restaurant.address}
          contactPhone={restaurant.contactPhone}
        />
      </main>

      {/* Mobile Cart CTA */}
      <MobileCartBar
        quantity={totalQuantity}
        total={grandTotal}
        disabled={processing}
        pricingPending={quoteFetching}
        onClick={() => setCartOpen(true)}
      />

      {/* Cart slide-over */}
      {cartOpen && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 cursor-pointer [-webkit-tap-highlight-color:transparent]"
            style={{ background: "var(--sf-overlay)" }}
            aria-label="Close cart"
            onClick={() => setCartOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Your order"
            ref={cartPanelRef}
            onKeyDown={handleCartPanelKeyDown}
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-full max-w-[400px] min-w-0 flex-col p-4"
            style={{ background: "var(--sf-bg-subtle)" }}
          >
            <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
              <h2 className="sf-serif min-w-0 truncate text-xl font-bold" style={{ color: "var(--sf-text)" }}>
                Your order
              </h2>
              <button
                onClick={() => setCartOpen(false)}
                className="grid h-9 min-h-[44px] w-9 min-w-[44px] shrink-0 cursor-pointer touch-manipulation place-items-center rounded-full transition-colors duration-200 hover:bg-white/10 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                style={{ color: "var(--sf-text-secondary)" }}
                aria-label="Close cart"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* The panel itself is the scroll container so the header stays put
                and the whole cart remains reachable on short viewports. */}
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <CartSidebar
                cart={cart}
                totalQuantity={totalQuantity}
                total={grandTotal}
                itemTotal={itemTotal}
                packaging={packaging}
                delivery={delivery}
                taxes={taxes}
                onQuantity={changeQty}
                maxQuantityFor={maxForItem}
                onCheckout={startSecurePayment}
                processing={processing}
                customerPhone={customerPhone}
                onCustomerPhone={persistPhone}
                orderingClosed={orderingClosed}
                orderingReason={orderingReason}
                couponCode={couponInput}
                onCouponCodeChange={setCouponInput}
                couponError={quote?.couponError}
                couponApplied={quote?.couponApplied}
                couponDiscount={quote ? (quote.couponDiscountPaise || 0) / 100 : 0}
                pricingPending={quoteFetching}
                amountToMinOrder={amountToMinOrder}
                soldOutLineIds={soldOutLineIds}
              />
            </div>
          </div>
        </div>
      )}

      {/* Customization Drawer */}
      <CustomizationDrawer
        item={selected}
        quantity={customQty}
        variantId={variantId}
        optionIds={optionIds}
        note={note}
        onClose={() => setSelected(null)}
        onQuantity={setCustomQty}
        onVariant={setVariantId}
        onOptions={setOptionIds}
        onNote={setNote}
        onAdd={addCustomItem}
      />

      {/* Delivery Location Drawer */}
      <DeliveryLocationDrawer
        open={locationOpen}
        onOpenChange={setLocationOpen}
        onConfirm={(loc) => setDeliveryAddress(loc)}
        existingLocation={deliveryAddress}
      />

      {/* Customer Auth Drawer */}
      <AuthDrawer
        open={authOpen}
        onOpenChange={setAuthOpen}
        loggedInPhone={loggedInPhone}
        customerMeData={customerMe.data}
        onSendOtp={handleSendOtp}
        onVerifyOtp={handleVerifyOtp}
        onLogout={handleLogout}
        otpStep={otpStep}
        setOtpStep={setOtpStep}
        otpPhone={otpPhone}
        setOtpPhone={setOtpPhone}
        otpCode={otpCode}
        setOtpCode={setOtpCode}
        otpLoading={otpLoading}
        otpError={otpError}
        setOtpError={setOtpError}
      />
    </div>
  );
}
