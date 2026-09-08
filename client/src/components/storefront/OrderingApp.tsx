/**
 * Cloud Kitchen Storefront — root orchestrator.
 * Wraps all storefront components in a `.storefront` scoped container.
 * Holds ALL state, performs ALL data fetching, routes to screens.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { X } from "lucide-react";
import { formatINR, type MenuItem } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { adaptStorefront } from "@/lib/storefrontAdapter";
import DeliveryLocationDrawer, {
  type DeliveryLocation,
} from "@/components/DeliveryLocationDrawer";

import type { CartLine, Filter } from "./types";
import MenuSkeleton from "./MenuSkeleton";
import TopBar from "./TopBar";
import HeroBanner from "./HeroBanner";
import DeliveryBar from "./DeliveryBar";
import OffersStrip from "./OffersStrip";
import SearchAndFilters from "./SearchAndFilters";
import CategorySidebar from "./CategorySidebar";
import CollectionCarousel from "./CollectionCarousel";
import MenuStream from "./MenuStream";
import CartSidebar from "./CartSidebar";
import MobileCartBar from "./MobileCartBar";
import CustomizationDrawer from "./CustomizationDrawer";
import AuthDrawer from "./AuthDrawer";
import CheckoutScreen from "./CheckoutScreen";

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
  const paymentConfig = trpc.storefront.paymentConfig.useQuery();
  const initiatePayment = trpc.storefront.initiatePayment.useMutation();
  const verifyPayment = trpc.storefront.verifyPayment.useMutation();

  const storefront = storefrontQuery.data
    ? adaptStorefront(storefrontQuery.data)
    : null;
  const restaurant = storefront?.restaurant;
  const categories = storefront?.categories ?? [];
  const liveMenu = storefront?.menu ?? [];
  const collections = storefront?.collections ?? [];
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [customQty, setCustomQty] = useState(1);
  const [size, setSize] = useState("Regular");
  const [extras, setExtras] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [deliveryAddress, setDeliveryAddress] =
    useState<DeliveryLocation | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [customerPhone, setCustomerPhone] = useState(
    () => localStorage.getItem("ck_phone_prefill") ?? ""
  );

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
        const matchesSearch =
          !needle ||
          [item.name, item.description, item.category, item.tag]
            .join(" ")
            .toLowerCase()
            .includes(needle);
        const matchesFilter =
          filter === "all" ||
          filter === item.kind ||
          (filter === "bestseller" && item.isBestseller);
        return matchesSearch && matchesFilter;
      }),
    [liveMenu, query, filter]
  );

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
    if (item.customizable) {
      setSelected(item);
      setCustomQty(1);
      setSize("Regular");
      setExtras([]);
      setNote("");
    } else {
      simpleAdd(item);
    }
  };

  const addCustomItem = () => {
    if (!selected) return;
    const sizeUpcharge =
      size === "Medium" ? 100 : size === "Large" ? 200 : 0;
    const extraUpcharge = extras.reduce(
      (sum, extra) =>
        sum + (extra === "Extra cheese" ? 70 : extra === "Jalapeño" ? 40 : 50),
      0
    );
    const unitPrice = selected.price + sizeUpcharge + extraUpcharge;
    setCart((current) => [
      ...current,
      {
        id: `${selected.id}-${Date.now()}`,
        item: selected,
        quantity: customQty,
        unitPrice,
        note,
        modifiers: [size, ...extras],
      },
    ]);
    toast.success(`${selected.name} added to your order`);
    setSelected(null);
  };

  // --- Customer Auth Handlers ---
  const handleSendOtp = async () => {
    const phone = otpPhone.replace(/[^\d]/g, "");
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
        phone: otpPhone,
        code: otpCode,
      });
      localStorage.setItem("ck_phone_prefill", otpPhone);
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
    if (!paymentConfig.data?.enabled) {
      toast.error("Online payments are not configured yet.", {
        description:
          "The restaurant administrator can activate Razorpay from the integrations settings.",
      });
      return;
    }
    if (cart.length === 0) return toast.error("Add items to your cart first.");
    if (grandTotal < (restaurant?.minOrder ?? 0)) {
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
    if (!customerPhone || customerPhone.length < 10) {
      return toast.error("Please enter your phone number.");
    }

    // Serviceability pre-check
    setProcessing(true);
    try {
      const svcRes = await fetch(
        `/api/trpc/storefront.checkServiceability?input=${encodeURIComponent(
          JSON.stringify({
            slug: storefrontSlug,
            latitude: deliveryAddress.latitude,
            longitude: deliveryAddress.longitude,
          })
        )}`,
        { credentials: "include" }
      );
      const svcJson = await svcRes.json();
      const serviceability = svcJson?.result?.data ?? svcJson;
      if (!serviceability?.serviceable) {
        setProcessing(false);
        const reason = serviceability?.reason ?? "";
        toast.error("Sorry, we can't deliver to this location.", {
          description:
            reason === "OUTSIDE_DELIVERY_RADIUS"
              ? "Your location is outside our current delivery area."
              : "Please try a different address.",
        });
        return;
      }
    } catch {
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
          modifierOptionIds: line.modifiers?.length
            ? line.modifiers.map(
                (name, i) => `${line.item.id}_opt_${i}`
              )
            : undefined,
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
            navigate(
              `/${storefrontSlug}/confirmation?order=${created.orderNumber}`
            );
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Payment verification failed."
            );
          } finally {
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => setProcessing(false),
        },
      }).open();
    } catch (error) {
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
        <main className="grid min-h-screen place-items-center px-4" style={{ background: "var(--sf-bg)" }}>
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
              className="sf-add-btn mt-6"
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

  // --- Cart / Checkout / Confirmation screens ---
  if (["cart", "checkout", "confirmation", "tracking"].includes(screen)) {
    return (
      <div className="storefront">
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
        />
      </div>
    );
  }

  // --- Menu screen ---
  return (
    <div className="storefront">
      <main className="min-h-screen pb-28 lg:pb-10" style={{ background: "var(--sf-bg)" }}>
        {/* Header */}
        <TopBar
          restaurantName={restaurant.name}
          restaurantLogo={restaurant.logo || undefined}
          itemCount={totalQuantity}
          onCart={() => {}}
          onAccount={() => setAuthOpen(true)}
        />

        {/* Hero Banner */}
        <HeroBanner
          restaurant={{
            ...restaurant,
            logo: restaurant.logo || undefined,
            bannerImage: restaurant.bannerImage || undefined,
          }}
          firstItemImage={liveMenu[0]?.image}
        />

        {/* Delivery Address Bar */}
        <div className="mt-3">
          <DeliveryBar
            deliveryAddress={deliveryAddress}
            onOpen={() => setLocationOpen(true)}
          />
        </div>

        {/* Offers Strip */}
        <OffersStrip offers={offers} />

        {/* Main Content Grid */}
        <div className="mx-auto mt-5 max-w-[1440px] px-4 sm:px-6 lg:grid lg:grid-cols-[170px_minmax(0,1fr)_350px] lg:gap-8 lg:px-10">
          {/* Desktop Category Sidebar */}
          <CategorySidebar
            categories={categories}
            activeCategory={activeCategory}
            onSelect={setActiveCategory}
          />

          {/* Main Menu Content */}
          <section className="min-w-0">
            {/* Search & Filters */}
            <SearchAndFilters
              query={query}
              onQueryChange={setQuery}
              categories={categories}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              filter={filter}
              onFilterChange={setFilter}
            />

            {/* Search Results indicator */}
            {query && (
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-bold" style={{ color: "var(--sf-text)" }}>
                  Results for{" "}
                  <span style={{ color: "var(--sf-primary)" }}>
                    "{query}"
                  </span>
                </p>
                <button
                  onClick={() => setQuery("")}
                  className="text-xs font-bold hover:underline"
                  style={{ color: "var(--sf-text-muted)" }}
                >
                  Clear
                </button>
              </div>
            )}

            {/* Collections (when no search active) */}
            {!query &&
              collections.length > 0 &&
              activeCategory === categories[0]?.name && (
                <CollectionCarousel
                  collections={collections}
                  onAdd={openItem}
                />
              )}

            {/* Menu Stream */}
            <MenuStream
              items={results}
              activeCategory={activeCategory}
              query={query}
              onAdd={openItem}
              cartQuantities={cartQuantities}
              onQuantityChange={changeItemQty}
            />
          </section>

          {/* Desktop Cart Sidebar */}
          <aside className="hidden lg:block">
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
            />
          </aside>
        </div>
      </main>

      {/* Mobile Cart CTA */}
      <MobileCartBar
        quantity={totalQuantity}
        total={grandTotal}
        onClick={() => {}}
      />

      {/* Customization Drawer */}
      <CustomizationDrawer
        item={selected}
        quantity={customQty}
        size={size}
        extras={extras}
        note={note}
        onClose={() => setSelected(null)}
        onQuantity={setCustomQty}
        onSize={setSize}
        onExtras={setExtras}
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
