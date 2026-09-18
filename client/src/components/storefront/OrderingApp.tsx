/**
 * Cloud Kitchen Storefront — root orchestrator.
 * Wraps all storefront components in a `.storefront` scoped container.
 * Holds ALL state, performs ALL data fetching, routes to screens.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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

  const storefront = storefrontQuery.data
    ? adaptStorefront(storefrontQuery.data)
    : null;
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
  const path = window.location.pathname;
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
  // Re-entry guard: state alone lags a frame, so rapid double-clicks could
  // fire startSecurePayment twice before `processing` flips.
  const paymentInFlight = useRef(false);
  const [deliveryAddress, setDeliveryAddress] =
    useState<DeliveryLocation | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState(
    () => localStorage.getItem("ck_phone_prefill") ?? ""
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
  const itemTotal = cart.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );
  const packaging = cart.length ? (restaurant?.packagingFee ?? 15) : 0;
  const delivery = cart.length ? (restaurant?.deliveryFee ?? 30) : 0;
  const taxes = Math.round((itemTotal + packaging) * 0.05);
  const grandTotal = Math.max(0, itemTotal + packaging + delivery + taxes);
  const totalQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);

  // --- Cart persistence: survive reloads, clear after successful payment ---
  const cartKey = storefrontSlug ? `ck_cart:${storefrontSlug}` : null;
  const restoredCartKey = useRef<string | null>(null);
  useEffect(() => {
    if (!cartKey || restoredCartKey.current === cartKey) return;
    restoredCartKey.current = cartKey;
    try {
      const raw = localStorage.getItem(cartKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CartLine[];
      if (!Array.isArray(parsed)) return;
      const clean = parsed.filter(
        (line) =>
          line &&
          typeof line.id === "string" &&
          line.item &&
          typeof line.item.id === "string" &&
          typeof line.quantity === "number" &&
          Number.isInteger(line.quantity) &&
          line.quantity >= 1 &&
          typeof line.unitPrice === "number" &&
          Number.isFinite(line.unitPrice)
      );
      if (clean.length) setCart(clean);
    } catch {
      /* corrupt snapshot — start fresh */
    }
  }, [cartKey]);
  useEffect(() => {
    if (!cartKey || restoredCartKey.current !== cartKey) return;
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

  // --- Cart quantity map (for MenuCard inline steppers) ---
  const cartQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const line of cart) {
      // Extract base item id (strip -default or timestamp suffix)
      const baseId = line.item.id;
      map[baseId] = (map[baseId] ?? 0) + line.quantity;
    }
    return map;
  }, [cart]);

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
            line.id === id ? { ...line, quantity } : line
          )
    );

  // For MenuCard inline quantity: find the matching cart line by base item id
  const changeItemQty = (itemId: string, quantity: number) => {
    const line = cart.find((l) => l.id === `${itemId}-default`);
    if (line) {
      changeQty(line.id, quantity);
    }
  };

  const simpleAdd = (item: MenuItem) => {
    if (item.availability !== "AVAILABLE") return;
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
      localStorage.setItem("ck_phone_prefill", normalizePhone(otpPhone));
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
    if (!paymentConfig.data?.enabled) {
      toast.error("Online payments are not configured yet.", {
        description:
          "The restaurant administrator can activate Razorpay from the integrations settings.",
      });
      return;
    }
    if (cart.length === 0) return toast.error("Add items to your cart first.");
    // Server enforces itemTotal >= minOrder (fees excluded) — match it here.
    if (itemTotal < (restaurant?.minOrder ?? 0)) {
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
        lines: cart.map((line) => ({
          menuItemId: line.item.id,
          quantity: line.quantity,
          modifierOptionIds: line.modifierOptionIds?.length
            ? line.modifierOptionIds
            : undefined,
          selectedVariantId: line.selectedVariantId ?? undefined,
          specialInstructions: line.note,
        })),
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
            await verifyPayment.mutateAsync({
              orderId: created.orderId,
              providerOrderId: response.razorpay_order_id,
              providerPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            // Clear the cart so back-button can't re-pay the same lines.
            clearCart();
            // Persist the tracking token so confirmation/tracking can authenticate.
            const paidToken =
              (created as { trackingToken?: string }).trackingToken ?? "";
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
          total={grandTotal}
          itemTotal={itemTotal}
          packaging={packaging}
          delivery={delivery}
          taxes={taxes}
          onMenu={goMenu}
          onQuantity={changeQty}
          onCheckout={startSecurePayment}
          processing={processing}
          restaurant={restaurant}
          customerPhone={customerPhone}
          onCustomerPhone={persistPhone}
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
          <OffersStrip offers={offers} />
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
            onQuantityChange={changeItemQty}
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
            className="absolute inset-y-0 right-0 w-full max-w-[400px] min-w-0 overflow-y-auto p-4"
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
            <CartSidebar
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
              customerPhone={customerPhone}
              onCustomerPhone={persistPhone}
            />
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
