/**
 * Cloud Kitchen Storefront — responsive food ordering app.
 * Mobile-first, inspired by leading Indian food delivery UX patterns.
 * Original premium design, not a copy of any existing brand.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Bike, Check, ChevronDown, ChevronRight, Clock3,
  FileText, Home, LocateFixed, MapPin, Minus, PackageCheck, Phone,
  Plus, Search, ShoppingBag, SlidersHorizontal, Sparkles, Store,
  TicketPercent, UserRound, Utensils, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DeliveryLocationDrawer, { type DeliveryLocation } from "@/components/DeliveryLocationDrawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { formatINR, type MenuItem, type FoodKind } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { adaptStorefront } from "@/lib/storefrontAdapter";

type CartLine = {
  id: string;
  item: MenuItem;
  quantity: number;
  note?: string;
  modifiers?: string[];
  unitPrice: number;
};

type Filter = "all" | FoodKind | "bestseller";

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
  return (
    <span
      aria-label={kindCopy[kind]}
      title={kindCopy[kind]}
      className={`relative inline-grid h-4 w-4 place-items-center border ${colour} before:h-1.5 before:w-1.5 before:rounded-full`}
    />
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
}: {
  value: number;
  onChange: (next: number) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-full border border-[#e7d2bf] bg-[#fffdf8] ${
        compact ? "h-9" : "h-11"
      }`}
    >
      <button
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="grid h-full w-9 place-items-center text-[#7f5a45] hover:text-[#c84630]"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-5 text-center text-sm font-extrabold tabular-nums">
        {value}
      </span>
      <button
        aria-label="Increase quantity"
        onClick={() => onChange(value + 1)}
        className="grid h-full w-9 place-items-center text-[#7f5a45] hover:text-[#c84630]"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function OrderingApp({ slug }: { slug?: string }) {
  const [, navigate] = useLocation();
  const storefrontSlug = slug || "";
  const storefrontQuery = trpc.storefront.get.useQuery({ slug: storefrontSlug });
  const paymentConfig = trpc.storefront.paymentConfig.useQuery();
  const localAdminMode = trpc.auth.localAdminEnabled.useQuery();
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
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.href = t.faviconUrl;
    }
    return () => {
      root.style.removeProperty("--color-primary");
      root.style.removeProperty("--color-accent");
      root.style.removeProperty("--font-display");
      root.style.removeProperty("--font-body");
    };
  }, [storefront?.theme]);

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

  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [activeCategory, setActiveCategory] = useState("Menu");
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [customQty, setCustomQty] = useState(1);
  const [size, setSize] = useState("Regular");
  const [extras, setExtras] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [couponOpen, setCouponOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
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
  const sendOtp = trpc.storefront.sendOtp.useMutation();
  const verifyOtp = trpc.storefront.verifyOtp.useMutation();
  const customerLogout = trpc.storefront.customerLogout.useMutation();
  // Fix 2: customerMe reads identity from session cookie, NOT localStorage
  const customerMe = trpc.storefront.customerMe.useQuery();
  const loggedInPhone = customerMe.data?.phone ?? null;

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

  // Search and filtering
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

  const changeQty = (id: string, quantity: number) =>
    setCart((current) =>
      quantity < 1
        ? current.filter((line) => line.id !== id)
        : current.map((line) =>
            line.id === id ? { ...line, quantity } : line
          )
    );

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
      setOtpError(err instanceof Error ? err.message : "Failed to send code.");
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
      // Server sets HttpOnly session cookie — no localStorage auth
      const result = await verifyOtp.mutateAsync({ phone: otpPhone, code: otpCode });
      // Only remember phone for convenience (pre-fill), NOT for auth
      localStorage.setItem("ck_phone_prefill", otpPhone);
      setAuthOpen(false);
      setOtpStep("phone");
      setOtpPhone("");
      setOtpCode("");
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
    // Require confirmed delivery location with coordinates
    if (!deliveryAddress?.confirmed) {
      setLocationOpen(true);
      return toast.error("Please confirm your delivery location first.", {
        description: "Tap on the delivery address bar to set your location.",
      });
    }
    if (!customerPhone || customerPhone.length < 10) {
      return toast.error("Please enter your phone number.");
    }

    // Serviceability pre-check — block payment if outside delivery area
    setProcessing(true);
    try {
      const svcRes = await fetch(
        `/api/trpc/storefront.checkServiceability?input=${encodeURIComponent(JSON.stringify({ slug: storefrontSlug, latitude: deliveryAddress.latitude, longitude: deliveryAddress.longitude }))}`,
        { credentials: "include" }
      );
      const svcJson = await svcRes.json();
      const serviceability = svcJson?.result?.data ?? svcJson;
      if (!serviceability?.serviceable) {
        setProcessing(false);
        const reason = serviceability?.reason ?? "";
        toast.error("Sorry, we can't deliver to this location.", {
          description: reason === "OUTSIDE_DELIVERY_RADIUS"
            ? "Your location is outside our current delivery area."
            : "Please try a different address.",
        });
        return;
      }
    } catch {
      setProcessing(false);
      toast.error("Could not verify delivery availability. Please try again.");
      return;
    }

    try {
      const created = await initiatePayment.mutateAsync({
        slug: storefrontSlug,
        lines: cart.map((line) => ({
          menuItemId: line.item.id,
          quantity: line.quantity,
          // Issue 5: Send only modifier option IDs — server resolves prices
          modifierOptionIds: line.modifiers?.length ? line.modifiers.map((name, i) => `${line.item.id}_opt_${i}`) : undefined,
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
        customerPhone,
      });

      // Load Razorpay checkout
      if (!window.Razorpay) {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Razorpay"));
          document.body.appendChild(script);
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
        error instanceof Error ? error.message : "We couldn't start payment."
      );
    }
  };

  if (storefrontQuery.isLoading || !restaurant)
    return <MenuSkeleton />;

  const goMenu = () => navigate(`/${storefrontSlug}`);

  if (["cart", "checkout", "confirmation", "tracking"].includes(screen)) {
    return (
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
      />
    );
  }

  return (
    <>
      <main className="min-h-screen bg-[#fffaf3] pb-28 lg:pb-10">
        {/* Header */}
        <TopBar
          restaurantName={restaurant.name}
          itemCount={totalQuantity}
          onCart={() => {}}
          onAccount={() => setAuthOpen(true)}
          customerPhone={loggedInPhone ?? undefined}
        />

        {/* Hero Banner */}
        <section className="relative overflow-hidden bg-[#2d1f17] text-white">
          {restaurant.bannerImage && (
            <img
              src={restaurant.bannerImage}
              alt={`${restaurant.name} kitchen`}
              className="absolute inset-0 h-full w-full object-cover object-center opacity-60"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#1a1210]/95 via-[#2b1e16]/80 to-[#2b1e16]/30" />
          <div className="relative mx-auto flex min-h-[280px] max-w-[1440px] items-end px-4 pb-7 pt-16 sm:px-6 lg:min-h-[320px] lg:px-10 lg:pb-10">
            <div className="rise-in max-w-xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 backdrop-blur shadow-lg">
                  <BrandMark />
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
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#9a7660]">
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

          {/* Offers Banner */}
          {offers.length > 0 && (
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
              {offers.slice(0, 3).map((offer) => (
                <div
                  key={offer.code}
                  className="flex shrink-0 items-center gap-3 rounded-2xl border border-[#e8d6c5] bg-gradient-to-r from-[#fff9f0] to-[#fff3e5] px-4 py-3"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#c84630]/10 text-[#c84630]">
                    <TicketPercent className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-[#c84630]">
                      {offer.code}
                    </p>
                    <p className="text-[11px] text-[#8d6b55]">
                      {offer.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Main Content Grid */}
          <div className="mt-5 lg:grid lg:grid-cols-[170px_minmax(0,1fr)_350px] lg:gap-8">
            {/* Desktop Category Sidebar */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#9a7660]">
                  On the menu
                </p>
                <nav className="space-y-1">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setActiveCategory(category.name)}
                      className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                        activeCategory === category.name
                          ? "bg-[#f5e4d4] text-[#b63d2d]"
                          : "text-[#6f5140] hover:bg-[#faefe5]"
                      }`}
                    >
                      {category.emoji && (
                        <span className="mr-2">{category.emoji}</span>
                      )}
                      {category.name}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Main Menu Content */}
            <section className="min-w-0">
              {/* Search & Filters */}
              <div className="sticky top-0 z-20 -mx-4 bg-[#fffaf3]/95 px-4 pb-3 pt-5 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a37d64]" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search dishes, cuisines, or categories"
                      className="h-12 rounded-2xl border-[#e8d6c5] bg-white pl-11 pr-4 text-sm shadow-sm placeholder:text-[#ac8b73]"
                    />
                  </div>
                </div>

                {/* Mobile Category Pills */}
                <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setActiveCategory(category.name)}
                      className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-extrabold ${
                        activeCategory === category.name
                          ? "bg-[#382719] text-white"
                          : "border border-[#ead8c7] bg-white text-[#76523e]"
                      }`}
                    >
                      {category.emoji && (
                        <span className="mr-1">{category.emoji}</span>
                      )}
                      {category.name}
                    </button>
                  ))}
                </div>

                {/* Filter Chips */}
                <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
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
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold ${
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
              </div>

              {/* Search Results */}
              {query && (
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-bold text-[#5b4233]">
                    Results for{" "}
                    <span className="text-[#c84630]">"{query}"</span>
                  </p>
                  <button
                    onClick={() => setQuery("")}
                    className="text-xs font-bold text-[#9b6a52] hover:text-[#c84630]"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Collections (when no search active) */}
              {!query &&
                collections.length > 0 &&
                activeCategory === categories[0]?.name && (
                  <div className="mb-6 space-y-6">
                    {collections.map((collection) => (
                      <div key={collection.name}>
                        <div className="mb-3 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-[#c84630]" />
                          <h3 className="text-sm font-extrabold text-[#382719]">
                            {collection.name}
                          </h3>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                          {collection.items.slice(0, 6).map((item) => (
                            <CollectionCard
                              key={item.id}
                              item={item}
                              onAdd={() => openItem(item)}
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
                activeCategory={activeCategory}
                query={query}
                onAdd={openItem}
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
          onCart={() => {}}
        />
      )}

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
      <Drawer open={authOpen} onOpenChange={setAuthOpen}>
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
            {loggedInPhone ? (
              <div className="space-y-4">
                {customerMe.data && (
                  <div className="rounded-xl border border-[#eadccf] bg-[#fff9f3] p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Phone</p>
                        <p className="mt-1 font-bold text-[#382719]">{loggedInPhone}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Total Orders</p>
                        <p className="mt-1 font-bold text-[#382719]">{customerMe.data.totalOrders}</p>
                      </div>
                    </div>
                  </div>
                )}
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  className="w-full rounded-xl border-[#ddc6b5] text-[#c84630] font-extrabold"
                >
                  Sign out
                </Button>
              </div>
            ) : otpStep === "phone" ? (
              <div className="space-y-4">
                <Input
                  value={otpPhone}
                  onChange={(e) => { setOtpPhone(e.target.value); setOtpError(""); }}
                  placeholder="10-digit phone number"
                  type="tel"
                  inputMode="numeric"
                  maxLength={15}
                  className="h-12 rounded-xl border-[#ddc6b5] text-base"
                />
                {otpError && (
                  <p className="text-sm font-bold text-[#c84630]">{otpError}</p>
                )}
                <Button
                  onClick={handleSendOtp}
                  disabled={otpLoading || otpPhone.replace(/[^\d]/g, "").length < 10}
                  className="h-12 w-full rounded-xl bg-[#c84630] font-extrabold text-base hover:bg-[#ad3627]"
                >
                  {otpLoading ? "Sending..." : "Send verification code"}
                </Button>
                <p className="text-center text-xs text-[#a77d63]">
                  We'll send a 6-digit code to verify your number.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-[#76523e]">
                  Enter the 6-digit code sent to {otpPhone}
                </p>
                <Input
                  value={otpCode}
                  onChange={(e) => { setOtpCode(e.target.value); setOtpError(""); }}
                  placeholder="000000"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className="h-12 rounded-xl border-[#ddc6b5] text-center text-2xl font-mono tracking-[0.3em]"
                />
                {otpError && (
                  <p className="text-sm font-bold text-[#c84630]">{otpError}</p>
                )}
                <Button
                  onClick={handleVerifyOtp}
                  disabled={otpLoading || otpCode.length !== 6}
                  className="h-12 w-full rounded-xl bg-[#c84630] font-extrabold text-base hover:bg-[#ad3627]"
                >
                  {otpLoading ? "Verifying..." : "Verify & continue"}
                </Button>
                <button
                  onClick={() => { setOtpStep("phone"); setOtpCode(""); setOtpError(""); }}
                  className="w-full text-center text-xs font-bold text-[#a77d63] underline"
                >
                  Change phone number
                </button>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function TopBar({
  restaurantName,
  itemCount,
  onCart,
  onAccount,
  customerPhone,
}: {
  restaurantName: string;
  itemCount: number;
  onCart: () => void;
  onAccount: () => void;
  customerPhone?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#eadbce] bg-[#fffaf3]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center gap-2.5 text-left"
        >
          <BrandMark />
          <span>
            <span className="font-display block text-xl leading-none text-[#382719]">
              {restaurantName}
            </span>
            <span className="mt-1 block text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#a77d63]">
              Direct ordering
            </span>
          </span>
        </button>
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={onAccount}
            className="flex items-center gap-1.5 rounded-xl border border-[#ddc6b5] bg-white px-3 py-2 text-xs font-extrabold text-[#553d2c] hover:bg-[#f9e6d9]"
            aria-label="Account"
          >
            <UserRound className="h-4 w-4" />
            <span className="hidden sm:inline">{customerPhone ?? "Login"}</span>
          </button>
          <button
            onClick={onCart}
            className="relative grid h-10 w-10 place-items-center rounded-xl bg-[#382719] text-white hover:bg-[#c84630]"
            aria-label="Open cart"
          >
            <ShoppingBag className="h-4 w-4" />
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#c84630] px-1 text-[10px] font-extrabold">
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

function CollectionCard({
  item,
  onAdd,
}: {
  item: MenuItem;
  onAdd: () => void;
}) {
  return (
    <div className="flex shrink-0 w-[200px] overflow-hidden rounded-2xl border border-[#ead8c6] bg-[#fffdf9] shadow-sm">
      {item.image && (
        <div className="h-24 w-24 shrink-0 overflow-hidden">
          <img
            src={item.image}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
        <div>
          <p className="truncate text-xs font-extrabold text-[#382719]">
            {item.name}
          </p>
          <p className="mt-0.5 text-xs font-bold text-[#c84630]">
            {formatINR(item.price)}
          </p>
        </div>
        <button
          onClick={onAdd}
          className="mt-1 w-full rounded-lg border border-[#c84630] bg-white px-2 py-1 text-[10px] font-extrabold text-[#c84630] hover:bg-[#c84630] hover:text-white"
        >
          ADD
        </button>
      </div>
    </div>
  );
}

function MenuStream({
  items,
  activeCategory,
  query,
  onAdd,
}: {
  items: MenuItem[];
  activeCategory: string;
  query: string;
  onAdd: (item: MenuItem) => void;
}) {
  if (!items.length)
    return (
      <div className="ticket-edge mt-5 bg-[#fffdf8] p-9 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#faede0] text-[#c84630]">
          <Utensils className="h-6 w-6" />
        </div>
        <h2 className="font-display mt-4 text-2xl">
          The menu is being prepared
        </h2>
        <p className="mt-2 text-sm text-[#856855]">
          The kitchen team will publish dishes shortly.
        </p>
      </div>
    );

  const shown = query
    ? items
    : items.filter((item) =>
        activeCategory === "Bestsellers"
          ? item.isBestseller
          : item.category === activeCategory
      );

  const display = shown.length ? shown : items;

  return (
    <div className="space-y-3 pb-3">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#a37960]">
            Fresh from the kitchen
          </p>
          <h2 className="font-display mt-1 text-3xl text-[#382719]">
            {query ? "What we found" : activeCategory}
          </h2>
        </div>
        <span className="text-xs font-bold text-[#94715c]">
          {display.length} dishes
        </span>
      </div>
      {display.map((item) => (
        <MenuCard key={item.id} item={item} onAdd={() => onAdd(item)} />
      ))}
    </div>
  );
}

function MenuCard({
  item,
  onAdd,
}: {
  item: MenuItem;
  onAdd: () => void;
}) {
  const unavailable = item.availability !== "AVAILABLE";
  const hasDiscount = item.originalPrice && item.originalPrice > item.price;

  return (
    <article
      className={`group relative overflow-hidden rounded-[1.35rem] border border-[#ead8c6] bg-[#fffdf9] p-4 shadow-[0_6px_18px_rgba(89,55,31,0.05)] transition-transform hover:-translate-y-0.5 sm:p-5 ${
        unavailable ? "opacity-70" : ""
      }`}
    >
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <FoodDot kind={item.kind} />
            {item.isBestseller && (
              <span className="rounded-full bg-[#f7e6ca] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#9c5a21]">
                Bestseller
              </span>
            )}
            {item.tag && item.tag !== "Bestseller" && (
              <span className="rounded-full bg-[#e8f5e9] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#2e7d32]">
                {item.tag}
              </span>
            )}
            {item.spiceLevel != null && item.spiceLevel > 0 && (
              <span className="text-xs" title={`Spice level: ${item.spiceLevel}/5`}>
                {"🌶️".repeat(Math.min(item.spiceLevel, 5))}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-[15px] font-extrabold leading-snug text-[#382719] sm:text-base">
            {item.name}
          </h3>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#886a57] sm:text-sm">
            {item.description}
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-sm font-extrabold text-[#382719]">
              {formatINR(item.price)}
            </p>
            {hasDiscount && (
              <p className="text-xs text-[#999] line-through">
                {formatINR(item.originalPrice!)}
              </p>
            )}
          </div>
          {unavailable && (
            <p className="mt-2 inline-flex rounded-md bg-[#f3e4d6] px-2 py-1 text-[11px] font-bold text-[#9d523e]">
              {item.availableNote || "Unavailable"}
            </p>
          )}
        </div>
        {item.image && (
          <div className="w-[112px] shrink-0 sm:w-[140px]">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#f3e5d4]">
              <img
                src={item.image}
                alt=""
                className="h-full w-full object-cover"
              />
              {unavailable && (
                <div className="absolute inset-0 grid place-items-center bg-[#3a251b]/45 px-2 text-center text-[11px] font-extrabold text-white">
                  {item.availability === "SOLD_OUT"
                    ? "Sold out"
                    : "Unavailable"}
                </div>
              )}
            </div>
            <button
              disabled={unavailable}
              onClick={onAdd}
              className="-mt-3 mx-auto flex h-8 min-w-20 items-center justify-center rounded-lg border border-[#c84630] bg-[#fffdf9] px-3 text-xs font-extrabold text-[#c84630] shadow-sm hover:bg-[#c84630] hover:text-white disabled:cursor-not-allowed disabled:border-[#bfae9f] disabled:text-[#9d8d80]"
            >
              {unavailable ? "Unavailable" : item.customizable ? "CUSTOMIZE" : "ADD +"}
            </button>
          </div>
        )}
        {!item.image && (
          <button
            disabled={unavailable}
            onClick={onAdd}
            className="self-end rounded-lg border border-[#c84630] bg-[#fffdf9] px-4 py-2 text-xs font-extrabold text-[#c84630] shadow-sm hover:bg-[#c84630] hover:text-white disabled:cursor-not-allowed disabled:border-[#bfae9f] disabled:text-[#9d8d80]"
          >
            {unavailable ? "Unavailable" : item.customizable ? "CUSTOMIZE" : "ADD +"}
          </button>
        )}
      </div>
      {item.customizable && !unavailable && (
        <p className="mt-3 border-t border-dashed border-[#ead8c6] pt-2 text-[11px] font-bold text-[#9d7b64]">
          Customizable
        </p>
      )}
    </article>
  );
}

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
      className="fixed bottom-4 left-4 right-4 z-40 flex items-center justify-between rounded-2xl bg-[#382719] px-4 py-3.5 text-left text-white shadow-[0_18px_45px_rgba(54,35,24,0.25)] lg:hidden"
    >
      <span>
        <span className="block text-xs font-semibold text-white/70">
          {quantity} item{quantity !== 1 ? "s" : ""} in your order
        </span>
        <span className="text-base font-extrabold">{formatINR(total)}</span>
      </span>
      <span className="flex items-center gap-2 text-sm font-extrabold">
        View cart <ArrowRight className="h-4 w-4" />
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
}) {
  return (
    <div className="ticket-edge sticky top-24 overflow-hidden bg-[#fffdf8] shadow-[0_15px_35px_rgba(84,48,26,0.1)]">
      <div className="paper-grain border-b border-[#ead8c6] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#a37960]">
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
                  <p className="mt-0.5 text-[11px] text-[#967762]">
                    {line.modifiers?.join(" · ") || "As listed"}
                  </p>
                  <p className="mt-1 text-xs font-bold">
                    {formatINR(line.unitPrice * line.quantity)}
                  </p>
                </div>
                <Quantity
                  compact
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
                <span>To pay</span>
                <span>{formatINR(total)}</span>
              </div>
            </div>
            {restaurant?.minOrder > 0 && total < restaurant.minOrder && (
              <p className="text-xs font-bold text-[#c84630]">
                Add {formatINR(restaurant.minOrder - total)} more for minimum order
              </p>
            )}
            <Button
              onClick={onCheckout}
              disabled={processing || (restaurant?.minOrder > 0 && total < restaurant.minOrder)}
              className="h-12 w-full rounded-xl bg-[#c84630] text-sm font-extrabold hover:bg-[#ae3426]"
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
  size,
  extras,
  note,
  onClose,
  onQuantity,
  onSize,
  onExtras,
  onNote,
  onAdd,
}: {
  item: MenuItem | null;
  quantity: number;
  size: string;
  extras: string[];
  note: string;
  onClose: () => void;
  onQuantity: (value: number) => void;
  onSize: (value: string) => void;
  onExtras: (value: string[]) => void;
  onNote: (value: string) => void;
  onAdd: () => void;
}) {
  if (!item) return null;

  const sizeUpcharge = size === "Medium" ? 100 : size === "Large" ? 200 : 0;
  const extraUpcharge = extras.reduce(
    (sum, extra) =>
      sum + (extra === "Extra cheese" ? 70 : extra === "Jalapeño" ? 40 : 50),
    0
  );
  const displayTotal = (item.price + sizeUpcharge + extraUpcharge) * quantity;

  const toggleExtra = (extra: string) =>
    onExtras(
      extras.includes(extra)
        ? extras.filter((choice) => choice !== extra)
        : [...extras, extra]
    );

  return (
    <Drawer open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[92dvh] border-[#dfcbb9] bg-[#fffaf3]">
        <div className="mx-auto w-full max-w-xl overflow-y-auto px-5 pb-3">
          <DrawerHeader className="px-0 text-left">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FoodDot kind={item.kind} />
                  <span className="rounded-full bg-[#f7e6ca] px-2 py-0.5 text-[10px] font-extrabold text-[#97591f]">
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
                className="grid h-9 w-9 place-items-center rounded-full bg-[#f5e7da] text-[#805a43]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DrawerHeader>

          <OptionGroup
            title="Choose size"
            required
            values={["Regular", "Medium +₹100", "Large +₹200"]}
            selected={size}
            onSelect={(value) => onSize(value.split(" ")[0])}
          />

          <div className="mt-6">
            <p className="text-sm font-extrabold text-[#382719]">
              Add extras{" "}
              <span className="font-medium text-[#967762]">(optional)</span>
            </p>
            <div className="mt-3 grid gap-2">
              {["Extra cheese", "Jalapeño"].map((extra) => (
                <button
                  key={extra}
                  onClick={() => toggleExtra(extra)}
                  className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm font-bold ${
                    extras.includes(extra)
                      ? "border-[#c84630] bg-[#fff0e9] text-[#9f392a]"
                      : "border-[#ead7c5] bg-white text-[#5f4534]"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-md border ${
                        extras.includes(extra)
                          ? "border-[#c84630] bg-[#c84630] text-white"
                          : "border-[#d8c3b1]"
                      }`}
                    >
                      {extras.includes(extra) && (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </span>
                    {extra}
                  </span>
                  <span className="text-xs">
                    +₹{extra === "Extra cheese" ? 70 : 40}
                  </span>
                </button>
              ))}
            </div>
          </div>

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
              className="mt-2 min-h-20 w-full resize-none rounded-xl border border-[#e5d0bd] bg-white p-3 text-sm outline-none ring-[#c84630] focus:ring-2"
            />
          </div>

          <div className="mt-5">
            <Quantity value={quantity} onChange={onQuantity} />
          </div>
        </div>
        <DrawerFooter className="border-t border-[#ead8c6] bg-[#fffdf9] px-5 pb-5 pt-4">
          <Button
            onClick={onAdd}
            className="h-13 w-full rounded-xl bg-[#c84630] text-sm font-extrabold hover:bg-[#ad3627]"
          >
            Add item{" "}
            <span className="ml-auto">{formatINR(displayTotal)}</span>
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function OptionGroup({
  title,
  required,
  values,
  selected,
  onSelect,
}: {
  title: string;
  required?: boolean;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="mt-6">
      <p className="text-sm font-extrabold text-[#382719]">
        {title}{" "}
        {required && <span className="font-medium text-[#c84630]">Required</span>}
      </p>
      <div className="mt-3 grid gap-2">
        {values.map((value) => {
          const active = selected === value.split(" ")[0];
          return (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-bold ${
                active
                  ? "border-[#c84630] bg-[#fff0e9] text-[#9f392a]"
                  : "border-[#ead7c5] bg-white text-[#5f4534]"
              }`}
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-full border ${
                  active ? "border-[#c84630]" : "border-[#d8c3b1]"
                }`}
              >
                {active && (
                  <span className="h-2.5 w-2.5 rounded-full bg-[#c84630]" />
                )}
              </span>
              {value}
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
}) {
  if (screen === "cart") {
    return (
      <main className="min-h-screen bg-[#fffaf3]">
        <header className="paper-grain relative overflow-hidden border-b border-[#ead8c6] bg-[#fffdf9]">
          <div className="relative mx-auto flex min-h-20 max-w-5xl items-center gap-4 px-4 py-4 sm:px-6">
            <button
              onClick={onMenu}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e7d2c0] bg-[#fffdf9] text-[#684d3c] hover:bg-[#f8ecdf]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#a37960]">
                Your order
              </p>
              <h1 className="font-display mt-1 text-3xl leading-none text-[#382719]">
                Review & checkout
              </h1>
            </div>
          </div>
        </header>
        <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 md:grid-cols-[1fr_360px]">
          <section className="ticket-edge bg-[#fffdf9] p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm font-extrabold text-[#4c3424]">
                {cart.length} item{cart.length !== 1 ? "s" : ""} from your order
              </p>
              <button
                onClick={onMenu}
                className="text-xs font-extrabold text-[#c84630]"
              >
                + Add more items
              </button>
            </div>
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
                      className="mt-2 text-xs font-bold text-[#a26d50] hover:text-[#c84630]"
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
                      value={line.quantity}
                      onChange={(next) => onQuantity(line.id, next)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <aside className="space-y-4">
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
            />
          </aside>
        </div>
      </main>
    );
  }

  if (screen === "confirmation") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fffaf3] px-4">
        <section className="ticket-edge w-full max-w-lg bg-[#fffdf9] p-8 text-center shadow-sm">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e5f1e5] text-[#42774b]">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="font-display mt-5 text-4xl text-[#382719]">
            Order confirmed!
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#856653]">
            Your order has been placed. The kitchen is preparing your food.
          </p>
          <Button
            onClick={onMenu}
            className="mt-6 h-12 rounded-xl bg-[#c84630] px-6 font-extrabold hover:bg-[#ad3627]"
          >
            Back to menu
          </Button>
        </section>
      </main>
    );
  }

  return <ServiceSetupScreen onMenu={onMenu} screen="menu" cart={[]} total={0} itemTotal={0} packaging={0} delivery={0} taxes={0} onQuantity={() => {}} onCheckout={() => {}} processing={false} restaurant={null} />;
}

function MenuSkeleton() {
  return (
    <main className="min-h-screen bg-[#fffaf3] p-8">
      <div className="mx-auto max-w-7xl animate-pulse space-y-5">
        <div className="h-20 rounded-2xl bg-[#eadfd4]" />
        <div className="h-48 rounded-2xl bg-[#eadfd4]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((key) => (
            <div key={key} className="h-32 rounded-2xl bg-[#eadfd4]" />
          ))}
        </div>
      </div>
    </main>
  );
}
