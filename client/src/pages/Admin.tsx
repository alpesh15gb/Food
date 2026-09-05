/**
 * Cloud Kitchen Admin Panel — polished operations dashboard.
 * Includes: overview, order management, menu management, restaurant settings,
 * customer management, and integration settings.
 */
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  BarChart3, CheckCircle2, ClipboardList, Clock3, CookingPot,
  ExternalLink, FileUp, LockKeyhole, Plus, Save, Store,
  TicketPercent, UtensilsCrossed, X, Users, TrendingUp,
  Package, AlertCircle, RefreshCw, Search, Trash2,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout, {
  AdminError,
  SECTION_TITLES,
  adminPath,
  parseAdminLocation,
  sectionTitle,
  useMyPermissions,
} from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { usePlatformHost } from "@/lib/platform";
import PlatformAdmin from "@/pages/PlatformAdmin";
import IntegrationPanel from "@/components/IntegrationPanel";
import DomainsPanel from "@/pages/DomainsPanel";
import KDSPage from "@/pages/KDS";
import StaffPanel from "@/pages/StaffPanel";
import NotificationsPanel from "@/pages/NotificationsPanel";
import OutletsPanel from "@/pages/OutletsPanel";
import LoyaltyPanel from "@/pages/LoyaltyPanel";

const money = (paise: number) => {
  const safe = Number.isFinite(paise) ? paise : 0;
  return `₹${(safe / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

const statusLabel: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAYMENT_CONFIRMED: "Payment confirmed",
  PLACED: "New order",
  RESTAURANT_ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY_FOR_PICKUP: "Ready",
  DELIVERY_REQUESTED: "Delivery requested",
  RIDER_ASSIGNED: "Rider assigned",
  PICKED_UP: "Picked up",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
};

const statusColor: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-50 text-amber-700",
  PAYMENT_CONFIRMED: "bg-blue-50 text-blue-700",
  PLACED: "bg-indigo-50 text-indigo-700",
  RESTAURANT_ACCEPTED: "bg-purple-50 text-purple-700",
  PREPARING: "bg-orange-50 text-orange-700",
  READY_FOR_PICKUP: "bg-emerald-50 text-emerald-700",
  DELIVERY_REQUESTED: "bg-cyan-50 text-cyan-700",
  RIDER_ASSIGNED: "bg-teal-50 text-teal-700",
  PICKED_UP: "bg-sky-50 text-sky-700",
  OUT_FOR_DELIVERY: "bg-blue-50 text-blue-700",
  DELIVERED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-red-700",
  REJECTED: "bg-red-50 text-red-700",
  REFUND_PENDING: "bg-yellow-50 text-yellow-700",
  REFUNDED: "bg-gray-50 text-gray-700",
};

const ADMIN_SECTIONS = new Set(Object.keys(SECTION_TITLES));

// Heavy admin sections are split out of the initial /admin bundle and only
// fetched when their section mounts. Analytics carries recharts, so it must
// stay behind lazy() — do not add a static import for any of these panels.
const AnalyticsPanel = lazy(() => import(/* webpackChunkName: "admin-analytics" */ "@/pages/AnalyticsPanel"));
const InventoryPanel = lazy(() => import(/* webpackChunkName: "admin-inventory" */ "@/pages/InventoryPanel"));
const ComboBuilderPanel = lazy(() => import(/* webpackChunkName: "admin-combos" */ "@/pages/ComboBuilderPanel"));
const MenuImportPanel = lazy(() => import(/* webpackChunkName: "admin-menu-import" */ "@/components/MenuImportPanel"));

// Debounce keystroke-driven admin filters (~200ms) so typing doesn't
// re-filter large lists (or re-fire server queries) on every keypress.
function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// Per-panel Suspense fallback for lazily-loaded admin sections. Pure
// skeleton with no focusable content; aria-busy for assistive tech.
function PanelFallback({ label }: { label: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      <div className="h-16 animate-pulse rounded-2xl bg-[#E9EFD6]" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded-2xl bg-[#E9EFD6]" />
        <div className="h-40 animate-pulse rounded-2xl bg-[#E9EFD6]" />
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-[#E9EFD6]" />
    </div>
  );
}

// Sections that require elevated membership; hidden when the server answers FORBIDDEN.
function isGatedSection(section: string): section is "staff" | "integrations" | "domains" {
  return section === "staff" || section === "integrations" || section === "domains";
}

export default function Admin() {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  const { slug: restaurantSlug, section } = parseAdminLocation(location);
  const safeSection = ADMIN_SECTIONS.has(section) ? section : "overview";
  // Member-owners carry global role "user": admit anyone with an active
  // restaurant membership, not just global admins.
  const memberships = trpc.auth.memberships.useQuery(undefined, {
    enabled: !!user && user.role !== "admin",
    retry: false,
    staleTime: 60_000,
  });

  if (loading || (!!user && user.role !== "admin" && memberships.isLoading))
    return <div className="min-h-screen bg-[#f7f2eb]" />;
  const isOperator =
    !!user && (user.role === "admin" || (memberships.data?.length ?? 0) > 0);
  if (!isOperator) return <AdminAccess />;

  // /admin and /admin/:section (no slug): platform host gets the restaurant
  // registry; restaurant hosts resolve their own workspace as before.
  if (!restaurantSlug) return <AdminRoot section={safeSection} />;

  return (
    <DashboardLayout>
      {safeSection === "import" ? (
        <MenuImportWorkspace slug={restaurantSlug} />
      ) : (
        <AdminWorkspace section={safeSection} slug={restaurantSlug} />
      )}
    </DashboardLayout>
  );
}

// =============================================================================
// Slug redirect helper: /admin/:section -> /admin/:slug/:section
// =============================================================================

// =============================================================================
// Admin root: platform registry on the platform host, slug redirect otherwise
// =============================================================================

function AdminRoot({ section }: { section: string }) {
  const { isPlatform, isLoading } = usePlatformHost();
  if (isLoading) return <AdminLoading />;
  if (isPlatform) return <PlatformAdmin />;
  return <SlugRedirect section={section} />;
}

function SlugRedirect({ section }: { section: string }) {
  const [, setLocation] = useLocation();
  const restaurants = trpc.admin.restaurants.useQuery(undefined, { retry: false });

  useEffect(() => {
    const list = (restaurants.data ?? []) as Array<{ slug?: string }>;
    if (restaurants.isSuccess && list.length > 0 && list[0].slug) {
      setLocation(adminPath(list[0].slug, section));
    }
  }, [restaurants.data, restaurants.isSuccess, section, setLocation]);

  if (restaurants.isLoading) return <AdminLoading />;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f2eb] p-5">
      <section className="max-w-md rounded-[2rem] bg-white p-8 text-center shadow-xl shadow-[#5f3b24]/10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f9e6d9] text-[#B95509]">
          <Store className="h-6 w-6" />
        </span>
        <h1 className="font-display mt-5 text-3xl text-[#35251b]">
          No restaurant selected
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#816252]">
          {restaurants.isError
            ? "We couldn't load your restaurants. Please retry or sign in again."
            : "Create your restaurant first, then open its operations desk."}
        </p>
        <div className="mt-5 flex gap-2">
          {restaurants.isError && (
            <Button
              onClick={() => restaurants.refetch()}
              variant="outline"
              className="h-11 flex-1 rounded-xl border-[#D8DFC0] font-extrabold text-[#3F4C1E]"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          )}
          <Button
            onClick={() => setLocation("/signup")}
            className="h-11 flex-1 rounded-xl bg-[#B95509] font-extrabold hover:bg-[#9C4A07]"
          >
            <Plus className="mr-2 h-4 w-4" /> Create restaurant
          </Button>
        </div>
      </section>
    </main>
  );
}

// =============================================================================
// Admin Access / Login
// =============================================================================

function AdminAccess() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState("");
  const [accessError, setAccessError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const localAccess = trpc.auth.localAdminEnabled.useQuery();
  const localLogin = trpc.auth.localAdminLogin.useMutation({
    onSuccess: () => window.location.reload(),
    onError: () => {
      setAccessError("Sign-in was not accepted. Paste only the administrator passphrase.");
      toast.error("Sign-in was not accepted.");
    },
  });
  const emailLogin = trpc.auth.login.useMutation({
    onSuccess: () => window.location.reload(),
    onError: (err) => {
      setAccessError(err.message || "Invalid credentials.");
      toast.error(err.message || "Login failed.");
    },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f2eb] p-5">
      <section className="max-w-md rounded-[2rem] bg-white p-8 text-center shadow-xl shadow-[#5f3b24]/10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f9e6d9] text-[#B95509]">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <h1 className="font-display mt-5 text-3xl text-[#35251b]">
          Operations access only
        </h1>
        {localAccess.isLoading ? (
          <div className="mt-5 space-y-3" aria-label="Loading sign-in options">
            <div className="h-11 animate-pulse rounded-xl bg-[#E9EFD6]" />
            <div className="h-11 animate-pulse rounded-xl bg-[#E9EFD6]" />
            <div className="h-11 animate-pulse rounded-xl bg-[#E9EFD6]" />
          </div>
        ) : localAccess.data ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAccessError("");
              localLogin.mutate({ token: token.trim() });
            }}
            className="mt-5 text-left"
          >
            <label className="text-sm font-extrabold text-[#563d2d]">
              Administrator passphrase
              <Input
                value={token}
                maxLength={4096}
                onChange={(e) => {
                  setToken(e.target.value);
                  setAccessError("");
                }}
                type="password"
                autoComplete="current-password"
                className="mt-2 h-11 rounded-xl border-[#D8DFC0]"
                placeholder="Paste the admin passphrase"
              />
            </label>
            {accessError && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-[#fff0ed] px-3 py-2.5 text-sm font-bold leading-relaxed text-[#a44230]"
              >
                {accessError}
              </p>
            )}
            <Button
              type="submit"
              disabled={localLogin.isPending || token.trim().length < 16}
              className="mt-3 h-11 w-full rounded-xl bg-[#B95509] font-extrabold hover:bg-[#9C4A07]"
            >
              {localLogin.isPending ? "Checking access..." : "Open operations"}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAccessError("");
              emailLogin.mutate({ email: email.trim(), password });
            }}
            className="mt-5 text-left"
          >
            <p className="mb-4 text-center text-sm leading-relaxed text-[#816252]">
              Sign in with your owner account to access the admin panel.
            </p>
            <label className="text-sm font-extrabold text-[#563d2d]">
              Email
              <Input
                value={email}
                onChange={(e) => { setEmail(e.target.value); setAccessError(""); }}
                type="email"
                autoComplete="email"
                className="mt-2 h-11 rounded-xl border-[#D8DFC0]"
                placeholder="owner@restaurant.com"
              />
            </label>
            <label className="mt-3 block text-sm font-extrabold text-[#563d2d]">
              Password
              <Input
                value={password}
                onChange={(e) => { setPassword(e.target.value); setAccessError(""); }}
                type="password"
                autoComplete="current-password"
                className="mt-2 h-11 rounded-xl border-[#D8DFC0]"
                placeholder="Enter your password"
              />
            </label>
            {accessError && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-[#fff0ed] px-3 py-2.5 text-sm font-bold leading-relaxed text-[#a44230]"
              >
                {accessError}
              </p>
            )}
            <Button
              type="submit"
              disabled={emailLogin.isPending || !email.trim() || !password}
              className="mt-3 h-11 w-full rounded-xl bg-[#B95509] font-extrabold hover:bg-[#9C4A07]"
            >
              {emailLogin.isPending ? "Signing in..." : "Sign in"}
            </Button>
            <div className="mt-4 flex items-center justify-between text-xs font-bold">
              <button
                type="button"
                onClick={() => setLocation("/signup")}
                className="text-[#B95509] hover:underline"
              >
                Create a restaurant
              </button>
              <button
                type="button"
                onClick={() => toast.info("Password resets are handled by your restaurant owner.")}
                className="text-[#816252] hover:underline"
              >
                Reset password
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

// =============================================================================
// Menu Import Workspace
// =============================================================================

function MenuImportWorkspace({ slug }: { slug: string }) {
  const [, setLocation] = useLocation();
  const dashboard = trpc.admin.dashboard.useQuery({ slug: slug || "" }, { enabled: !!slug, retry: false });
  if (dashboard.isLoading) return <AdminLoading />;
  if (dashboard.isError || !dashboard.data)
    return (
      <div className="space-y-4">
        <AdminError
          message="We couldn't load restaurant configuration for this import."
          onRetry={() => dashboard.refetch()}
        />
        <div className="flex justify-center">
          <Button
            onClick={() => setLocation(adminPath(slug, "overview"))}
            variant="outline"
            className="h-10 rounded-xl border-[#D8DFC0] bg-white text-xs font-extrabold text-[#3F4C1E]"
          >
            Back to overview
          </Button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#f7f2eb] p-5 text-[#34251d] lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#E9EFD6] text-[#B95509]">
            <FileUp className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
              {dashboard.data.restaurant.name} · menu studio
            </p>
            <h1 className="font-display text-3xl">Import your live menu</h1>
          </div>
          <Button
            onClick={() => dashboard.refetch()}
            disabled={dashboard.isFetching}
            variant="outline"
            aria-label="Retry loading restaurant configuration"
            className="h-10 rounded-xl border-[#D8DFC0] bg-white text-xs font-extrabold text-[#3F4C1E]"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${dashboard.isFetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
        <Suspense fallback={<PanelFallback label="Loading menu import" />}>
          <MenuImportPanel restaurantId={dashboard.data.restaurant.id} />
        </Suspense>
      </div>
    </div>
  );
}

// =============================================================================
// Main Admin Workspace
// =============================================================================

function AdminWorkspace({ section, slug }: { section: string; slug: string }) {
  const utils = trpc.useUtils();
  const dashboard = trpc.admin.dashboard.useQuery({ slug: slug || "" }, { enabled: !!slug, retry: false });
  const [itemForm, setItemForm] = useState({
    name: "",
    price: "",
    categoryId: "",
    description: "",
    imageUrl: "",
    dietaryType: "veg" as "veg" | "nonveg" | "egg",
  });
  const [couponForm, setCouponForm] = useState({
    code: "",
    description: "",
    discount: "",
    discountType: "flat" as "flat" | "percent",
    minOrder: "",
  });

  const updateAvailability = trpc.admin.updateMenuAvailability.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      toast.success("Availability updated");
    },
    onError: (err) => toast.error(err.message || "Could not update availability."),
  });
  const createItem = trpc.admin.createMenuItem.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      setItemForm({ name: "", price: "", categoryId: "", description: "", imageUrl: "", dietaryType: "veg" });
      toast.success("Menu item added");
    },
    onError: (err) => toast.error(err.message || "Could not add menu item."),
  });
  const createCoupon = trpc.admin.upsertCoupon.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      setCouponForm({ code: "", description: "", discount: "", discountType: "flat", minOrder: "" });
      toast.success("Coupon is live");
    },
    onError: (err) => toast.error(err.message || "Could not save coupon."),
  });
  const updateSettings = trpc.admin.updateSettings.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      toast.success("Restaurant settings saved");
    },
    onError: (err) => toast.error(err.message || "Could not save settings."),
  });
  const toggleItem = trpc.admin.toggleItemOpen.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      toast.success("Item visibility updated");
    },
    onError: (err) => toast.error(err.message || "Could not toggle item."),
  });
  const uploadImage = trpc.admin.uploadMenuImage.useMutation({
    onError: (err) => toast.error(err.message || "Image upload failed."),
  });
  const deleteItem = trpc.admin.deleteMenuItem.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      toast.success("Item removed from menu");
    },
    onError: (err) => toast.error(err.message || "Could not delete item."),
  });
  const bulkUpdate = trpc.admin.bulkUpdateMenuItems.useMutation({
    onSuccess: (d) => {
      utils.admin.dashboard.invalidate();
      toast.success(`${d.updated} items updated`);
    },
    onError: (err) => toast.error(err.message || "Bulk update failed."),
  });
  const updateItem = trpc.admin.updateMenuItem.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      toast.success("Item updated");
    },
    onError: (err) => toast.error(err.message || "Could not update item."),
  });
  const createCat = trpc.admin.createCategory.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      toast.success("Category created");
    },
    onError: (err) => toast.error(err.message || "Could not create category."),
  });
  const updateCat = trpc.admin.updateCategory.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      toast.success("Category updated");
    },
    onError: (err) => toast.error(err.message || "Could not update category."),
  });

  // Stable row callbacks for the memoized menu list. TanStack's `mutate`
  // fns are referentially stable, and the scope id is a primitive, so these
  // don't churn and break memo across dashboard refetches.
  // restaurantId is required scope for platform-host callers (the permission
  // gate fails closed without a tenant) and is re-verified server-side.
  const scopeRestaurantId = dashboard.data?.restaurant?.id as string | undefined;
  const handleMenuAvailability = useCallback(
    (itemId: string, availability: string) =>
      updateAvailability.mutate({ itemId, availability: availability as never, restaurantId: scopeRestaurantId }),
    [updateAvailability.mutate, scopeRestaurantId]
  );
  const handleMenuToggle = useCallback(
    (itemId: string, isOpen: boolean) => toggleItem.mutate({ itemId, isOpen, restaurantId: scopeRestaurantId }),
    [toggleItem.mutate, scopeRestaurantId]
  );
  const handleMenuDelete = useCallback(
    (itemId: string) => deleteItem.mutate({ itemId, restaurantId: scopeRestaurantId }),
    [deleteItem.mutate, scopeRestaurantId]
  );
  const handleMenuUpdateItem = useCallback(
    (input: any) => updateItem.mutate({ ...input, restaurantId: scopeRestaurantId }),
    [updateItem.mutate, scopeRestaurantId]
  );
  const handleMenuBulkUpdate = useCallback(
    (input: any) => bulkUpdate.mutate({ ...input, restaurantId: scopeRestaurantId }),
    [bulkUpdate.mutate, scopeRestaurantId]
  );

  if (dashboard.isLoading) return <AdminLoading />;
  if (dashboard.isError || !dashboard.data)
    return (
      <AdminError
        message="We couldn't load the restaurant workspace. Please retry."
        onRetry={() => dashboard.refetch()}
      />
    );

  const data = dashboard.data;
  const defaultCategoryId = data.categories[0]?.id ?? "";

  const parseRupees = (raw: string): number =>
    Number(String(raw ?? "").replace(/[^0-9.]/g, ""));

  const createMenu = () => {
    if (!itemForm.name.trim())
      return toast.error("Add an item name first.");
    const categoryId = itemForm.categoryId || defaultCategoryId;
    if (!categoryId)
      return toast.error("Create a category first, then add dishes to it.");
    const priceNum = parseRupees(itemForm.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0)
      return toast.error("Enter a valid price greater than ₹0.");
    createItem.mutate({
      restaurantId: data.restaurant.id,
      categoryId,
      name: itemForm.name.trim(),
      description: itemForm.description.trim() || undefined,
      imageUrl: itemForm.imageUrl.trim() || undefined,
      pricePaise: Math.round(priceNum * 100),
      dietaryType: itemForm.dietaryType,
    });
  };

  const saveCoupon = () => {
    if (!couponForm.code.trim() || !couponForm.description.trim() || !couponForm.discount)
      return toast.error("Complete the coupon details first.");
    const discountNum = Number(String(couponForm.discount).replace(/[^0-9.]/g, ""));
    if (couponForm.discountType === "percent") {
      if (!Number.isFinite(discountNum) || discountNum < 1 || discountNum > 100)
        return toast.error("Percentage discount must be between 1 and 100.");
    } else if (!Number.isFinite(discountNum) || discountNum <= 0) {
      return toast.error("Enter a valid flat discount greater than ₹0.");
    }
    const minOrderNum = couponForm.minOrder ? Number(String(couponForm.minOrder).replace(/[^0-9.]/g, "")) : 0;
    if (!Number.isFinite(minOrderNum) || minOrderNum < 0)
      return toast.error("Enter a valid minimum order value.");
    createCoupon.mutate({
      restaurantId: data.restaurant.id,
      code: couponForm.code.trim(),
      description: couponForm.description.trim(),
      discountType: couponForm.discountType,
      discountValue: couponForm.discountType === "percent"
        ? Math.round(discountNum)
        : Math.round(discountNum * 100),
      minOrderPaise: Math.round(minOrderNum * 100),
    });
  };

  const reactivateCoupon = (coupon: any) => {
    createCoupon.mutate({
      restaurantId: data.restaurant.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minOrderPaise: coupon.minOrderPaise ?? 0,
    });
  };

  const combos = (data.items ?? []).filter((i: any) => i.isCustomizable);

  return (
    <div className="min-h-screen bg-[#f7f2eb] text-[#34251d]">
      <header className="border-b border-[#D8DFC0] bg-[#fffdf9] px-5 py-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-[#5F6B3C]">
              <li>Kitchen Admin</li>
              <li aria-hidden>/</li>
              <li className="max-w-40 truncate">{data.restaurant.name}</li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-[#B95509]">{sectionTitle(section)}</li>
            </ol>
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
                Kitchen desk · {data.restaurant.name}
              </p>
              <h1 className="font-display mt-1 text-3xl">
                {sectionTitle(section)}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <OutletSwitcher
                restaurantId={data.restaurant.id}
                currentOutletId={data.outlet?.id}
                currentOutletName={data.outlet?.name}
              />
              <Button
                onClick={() => window.open("/", "_blank")}
                variant="outline"
                className="rounded-xl border-[#D8DFC0] bg-white text-xs font-extrabold text-[#3F4C1E]"
              >
                View storefront <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-5 lg:p-8">
        {isGatedSection(section) ? (
          <PermissionGate
            restaurantId={data.restaurant.id}
            section={section}
            title={sectionTitle(section)}
          >
            {section === "staff" ? (
              <StaffPanel restaurantId={data.restaurant.id} />
            ) : section === "integrations" ? (
              <IntegrationPanel restaurantId={data.restaurant.id} />
            ) : (
              <DomainsPanel restaurantId={data.restaurant.id} />
            )}
          </PermissionGate>
        ) : section === "orders" ? (
          <OrdersPanel restaurantId={data.restaurant.id} />
        ) : section === "menu" ? (
          <MenuPanel
            data={data}
            itemForm={itemForm}
            setItemForm={setItemForm}
            onCreate={createMenu}
            createPending={createItem.isPending}
            listPending={
              updateAvailability.isPending || toggleItem.isPending ||
              deleteItem.isPending || updateItem.isPending || bulkUpdate.isPending
            }
            onAvailability={handleMenuAvailability}
            onToggle={handleMenuToggle}
            onUploadImage={uploadImage}
            onDelete={handleMenuDelete}
            onUpdateItem={handleMenuUpdateItem}
            onBulkUpdate={handleMenuBulkUpdate}
            restaurantId={data.restaurant.id}
          />
        ) : section === "categories" ? (
          <CategoriesPanel
            data={data}
            pending={createCat.isPending || updateCat.isPending}
            onCreateCategory={(input) => createCat.mutate(input)}
            onUpdateCategory={(input) => updateCat.mutate({ ...input, restaurantId: data.restaurant.id })}
          />
        ) : section === "coupons" ? (
          <CouponsPanel
            data={data}
            form={couponForm}
            setForm={setCouponForm}
            onSave={saveCoupon}
            savePending={createCoupon.isPending}
            onReactivate={reactivateCoupon}
          />
        ) : section === "customers" ? (
          <CustomersPanel restaurantId={data.restaurant.id} />
        ) : section === "restaurant" ? (
          <RestaurantPanel
            restaurant={data.restaurant}
            savePending={updateSettings.isPending}
            onSave={(next) => updateSettings.mutate(next)}
          />
        ) : section === "kds" ? (
          <KDSPage slug={slug} restaurantId={data.restaurant.id} />
        ) : section === "inventory" ? (
          <Suspense fallback={<PanelFallback label="Loading inventory" />}>
            <InventoryPanel restaurantId={data.restaurant.id} />
          </Suspense>
        ) : section === "notifications" ? (
          <NotificationsPanel restaurantId={data.restaurant.id} />
        ) : section === "analytics" ? (
          <Suspense fallback={<PanelFallback label="Loading analytics" />}>
            <AnalyticsPanel restaurantId={data.restaurant.id} />
          </Suspense>
        ) : section === "outlets" ? (
          <OutletsPanel restaurantId={data.restaurant.id} />
        ) : section === "loyalty" ? (
          <LoyaltyPanel restaurantId={data.restaurant.id} />
        ) : section === "combos" ? (
          <Suspense fallback={<PanelFallback label="Loading combo builder" />}>
            <ComboBuilderPanel
              restaurantId={data.restaurant.id}
              categories={data.categories ?? []}
              combos={combos}
            />
          </Suspense>
        ) : (
          <OverviewPanel data={data} slug={slug} />
        )}
      </main>
    </div>
  );
}

// =============================================================================
// Permission gate for Team / Integrations / Domains
// =============================================================================

function PermissionGate({
  restaurantId,
  section,
  title,
  children,
}: {
  restaurantId: string;
  section: string;
  title: string;
  children: React.ReactNode;
}) {
  const perms = useMyPermissions(restaurantId);
  const blocked =
    (section === "staff" && !perms.canManageTeam) ||
    (section === "domains" && !perms.canManageDomains) ||
    (section === "integrations" && !perms.canManageIntegrations);

  if (blocked) {
    return (
      <AdminError
        message={`You don't have access to ${title}. Ask your restaurant owner for the required permission.`}
      />
    );
  }
  return <>{children}</>;
}

// =============================================================================
// Outlet switcher
// =============================================================================

function OutletSwitcher({
  restaurantId,
  currentOutletId,
  currentOutletName,
}: {
  restaurantId: string;
  currentOutletId?: string;
  currentOutletName?: string;
}) {
  const outletsQuery = trpc.admin.listOutlets.useQuery(
    { restaurantId },
    { retry: false, staleTime: 60_000, refetchOnWindowFocus: false }
  );
  const storageKey = `admin-outlet:${restaurantId}`;
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const outlets = (outletsQuery.data ?? []) as Array<{ id: string; name: string }>;
  if (outletsQuery.isError || (outletsQuery.isSuccess && outlets.length === 0)) {
    return currentOutletName ? (
      <span className="inline-flex items-center gap-2 rounded-xl border border-[#D8DFC0] bg-white px-3 py-2 text-xs font-extrabold text-[#3F4C1E]">
        <Store className="h-3.5 w-3.5" aria-hidden />
        {currentOutletName}
      </span>
    ) : null;
  }
  if (!outletsQuery.data) return null;

  const value = selectedId ?? currentOutletId ?? "";

  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-[#D8DFC0] bg-white px-3 py-1.5 text-xs font-extrabold text-[#3F4C1E]">
      <Store className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">Active outlet</span>
      <select
        aria-label="Active outlet"
        value={value}
        onChange={(e) => {
          setSelectedId(e.target.value || null);
          try {
            if (e.target.value) localStorage.setItem(storageKey, e.target.value);
            else localStorage.removeItem(storageKey);
          } catch { /* storage unavailable */ }
          const picked = outlets.find((o) => o.id === e.target.value);
          toast.success(picked ? `Outlet context: ${picked.name}` : "Outlet context cleared");
        }}
        className="h-8 max-w-44 truncate bg-transparent outline-none"
      >
        <option value="">All outlets</option>
        {outlets.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}

// =============================================================================
// Overview Panel
// =============================================================================

function OverviewPanel({ data, slug }: { data: any; slug: string }) {
  const [, setLocation] = useLocation();
  const go = (section: string) => setLocation(adminPath(slug, section));
  const m = data.metrics;
  // Server truth check: purchasable = isOpen AND availability AVAILABLE
  // (server/domain/availability.ts + orderPricing.ts). The precomputed
  // m.availableItems counts availability only, so recompute from the items.
  const availableCount = (data.items ?? []).filter(
    (i: any) => i.isOpen !== false && i.availability === "AVAILABLE"
  ).length;
  const cards = [
    {
      label: "Today's orders",
      value: m.todayOrders,
      detail: "All orders started today",
      icon: ClipboardList,
      tone: "bg-[#E9EFD6] text-[#B95509]",
    },
    {
      label: "Today's sales",
      value: money(m.todaySalesPaise),
      detail: "Captured payments",
      icon: BarChart3,
      tone: "bg-[#e6f0e5] text-[#47754d]",
    },
    {
      label: "Average order",
      value: money(m.averageOrderValue),
      detail: "Across all paid orders",
      icon: TrendingUp,
      tone: "bg-[#eee8f6] text-[#695b9c]",
    },
    {
      label: "Available dishes",
      value: `${availableCount}/${(data.items ?? []).length}`,
      detail: "Ready to order",
      icon: UtensilsCrossed,
      tone: "bg-[#f5ecd8] text-[#9e692a]",
    },
  ];

  const statusCards = [
    {
      label: "New",
      value: m.pendingOrders,
      icon: Clock3,
      color: "text-amber-600",
    },
    {
      label: "Preparing",
      value: m.preparingOrders,
      icon: CookingPot,
      color: "text-orange-600",
    },
    {
      label: "Open orders",
      value: m.openOrders,
      icon: Package,
      color: "text-indigo-600",
    },
    {
      label: "Delivered",
      value: m.deliveredOrders,
      icon: CheckCircle2,
      color: "text-green-600",
    },
    {
      label: "Cancelled",
      value: m.cancelledOrders,
      icon: X,
      color: "text-red-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.label}
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 180px" }}
            className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm"
          >
            <span
              className={`grid h-10 w-10 place-items-center rounded-xl ${card.tone}`}
            >
              <card.icon className="h-5 w-5" />
            </span>
            <p className="mt-5 text-sm font-bold text-[#7d5e4c]">
              {card.label}
            </p>
            <p className="font-display mt-1 text-3xl">{card.value}</p>
            <p className="mt-2 text-xs text-[#5F6B3C]">{card.detail}</p>
          </article>
        ))}
      </section>

      {/* Status Summary (static display cards; safe to skip off-screen paint) */}
      <section
        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 160px" }}
        className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm"
      >
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
          Order pipeline
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {statusCards.map((card) => (
            <div
              key={card.label}
              className="flex items-center gap-3 rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-3"
            >
              <card.icon className={`h-5 w-5 ${card.color}`} />
              <div>
                <p className="text-lg font-extrabold">{card.value}</p>
                <p className="text-xs text-[#5F6B3C]">{card.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Orders (static preview; no focusable content) */}
      <section
        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
        className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
              Recent orders
            </p>
            <h2 className="font-display mt-1 text-2xl">
              Latest activity
            </h2>
          </div>
          <span className="rounded-full bg-[#E9EFD6] px-3 py-1 text-xs font-extrabold text-[#a64130]">
            {m.openOrders} open
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {(data.orders ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#D8DFC0] bg-[#E9EFD6] p-5 text-center text-xs font-bold text-[#5F6B3C]">
              No orders yet — new orders will appear here as soon as they're placed.
            </p>
          ) : (
          (data.orders ?? []).slice(0, 8).map((order: any) => (
            <div
              key={order.id}
              className="flex items-center justify-between rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-3"
            >
              <div>
                <p className="text-sm font-extrabold">{order.orderNumber}</p>
                <p className="mt-1 text-xs text-[#5F6B3C]">
                  {statusLabel[order.status] || order.status} ·{" "}
                  {money(order.totalPaise)}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                  statusColor[order.status] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {statusLabel[order.status]?.slice(0, 12) || order.status}
              </span>
            </div>
          )))}
        </div>
      </section>

      {/* Restaurant Status Card (static display; quick-action buttons intentionally excluded) */}
      <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <article
          style={{ contentVisibility: "auto", containIntrinsicSize: "auto 240px" }}
          className="rounded-2xl bg-[#2A3A0C] p-6 text-white shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${
                data.restaurant.isOpen ? "bg-green-400" : "bg-red-400"
              }`}
              aria-hidden
            />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e1b79c]">
              Restaurant status
            </p>
          </div>
          <h2 className="font-display mt-2 text-3xl">
            {data.restaurant.isOpen ? "Open for orders" : "Paused"}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
            {data.restaurant.isOpen
              ? "Customers can place orders. Toggle from the restaurant settings page."
              : "Orders are paused. Enable from the restaurant settings page."}
          </p>
          <div className="mt-6 flex items-center gap-2 text-xs font-extrabold text-[#f8d7be]">
            <Store className="h-4 w-4" />
            {data.outlet?.name ?? "No active outlet"}
          </div>
        </article>

        <article className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
            Quick actions
          </p>
          <h2 className="font-display mt-1 text-2xl">Kitchen controls</h2>
          <div className="mt-5 space-y-3">
            <button
              onClick={() => go("orders")}
              className="flex w-full items-center gap-3 rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-3 text-left hover:bg-[#E9EFD6]"
            >
              <ClipboardList className="h-5 w-5 text-[#B95509]" />
              <div>
                <p className="text-sm font-bold">Manage orders</p>
                <p className="text-xs text-[#5F6B3C]">
                  View and update order status
                </p>
              </div>
            </button>
            <button
              onClick={() => go("menu")}
              className="flex w-full items-center gap-3 rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-3 text-left hover:bg-[#E9EFD6]"
            >
              <UtensilsCrossed className="h-5 w-5 text-[#B95509]" />
              <div>
                <p className="text-sm font-bold">Menu studio</p>
                <p className="text-xs text-[#5F6B3C]">
                  Add dishes and manage availability
                </p>
              </div>
            </button>
            <button
              onClick={() => go("integrations")}
              className="flex w-full items-center gap-3 rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-3 text-left hover:bg-[#E9EFD6]"
            >
              <AlertCircle className="h-5 w-5 text-[#B95509]" />
              <div>
                <p className="text-sm font-bold">Integrations</p>
                <p className="text-xs text-[#5F6B3C]">
                  Configure payments and delivery
                </p>
              </div>
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}

// =============================================================================
// Orders Panel — server-paginated, live-updating queue
// =============================================================================

const ORDERS_PAGE_SIZE = 20;

const ORDER_ACTIVE_STATUSES = [
  "PLACED",
  "RESTAURANT_ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "DELIVERY_REQUESTED",
  "RIDER_ASSIGNED",
  "PICKED_UP",
  "OUT_FOR_DELIVERY",
];

// Legal next states per the server state machine
// (server/domain/orderStateMachine.ts VALID_TRANSITIONS). Every entry here must
// be accepted by validateTransition — offering anything else fails with
// InvalidTransitionError after an optimistic "Saving..." flash.
// Cancel/Reject/Delivered require confirmation.
const ORDER_TRANSITIONS: Record<string, Array<{ to: string; label: string; danger?: boolean; confirm?: boolean }>> = {
  PENDING_PAYMENT: [{ to: "CANCELLED", label: "Cancel order", danger: true }],
  PAYMENT_CONFIRMED: [
    { to: "PLACED", label: "Move to queue" },
    { to: "CANCELLED", label: "Cancel order", danger: true },
  ],
  PLACED: [
    { to: "RESTAURANT_ACCEPTED", label: "Accept" },
    { to: "REJECTED", label: "Reject", danger: true },
    { to: "CANCELLED", label: "Cancel order", danger: true },
  ],
  RESTAURANT_ACCEPTED: [
    { to: "PREPARING", label: "Start preparing" },
    { to: "CANCELLED", label: "Cancel order", danger: true },
  ],
  PREPARING: [
    { to: "READY_FOR_PICKUP", label: "Mark ready" },
    { to: "CANCELLED", label: "Cancel order", danger: true },
  ],
  READY_FOR_PICKUP: [
    { to: "DELIVERY_REQUESTED", label: "Request delivery" },
    { to: "CANCELLED", label: "Cancel order", danger: true },
  ],
  DELIVERY_REQUESTED: [
    { to: "RIDER_ASSIGNED", label: "Assign rider" },
    { to: "CANCELLED", label: "Cancel order", danger: true },
  ],
  RIDER_ASSIGNED: [
    { to: "PICKED_UP", label: "Picked up" },
    { to: "CANCELLED", label: "Cancel order", danger: true },
  ],
  PICKED_UP: [{ to: "OUT_FOR_DELIVERY", label: "Out for delivery" }],
  OUT_FOR_DELIVERY: [{ to: "DELIVERED", label: "Delivered", confirm: true }],
};

// Memoized order rows: `order` keeps a stable reference from the query
// cache and every other prop is a primitive or stable callback, so typing,
// paging, and 5s live refetches don't re-render untouched rows.
const OrderActions = memo(function OrderActions({
  order,
  busy,
  onChange,
}: {
  order: any;
  busy: boolean;
  onChange: (order: any, next: string, danger?: boolean, confirm?: boolean) => void;
}) {
  const transitions = ORDER_TRANSITIONS[order.status] ?? [];
  const showInvoice = order.status === "DELIVERED" || order.status === "READY_FOR_PICKUP";
  if (!transitions.length && !showInvoice)
    return <span className="text-xs text-[#5F6B3C]">No actions</span>;
  return (
    <div className="flex flex-col gap-2">
      {transitions.map((t) => (
        <button
          key={t.to}
          disabled={busy}
          onClick={() => onChange(order, t.to, t.danger, t.confirm)}
          aria-label={`${t.label} order ${order.orderNumber}`}
          className={`min-h-11 rounded-lg px-3 py-2 text-xs font-extrabold disabled:opacity-50 ${
            t.danger
              ? "border border-red-200 bg-white text-red-600 hover:bg-red-50"
              : "bg-[#2A3A0C] text-white hover:bg-[#4a3527]"
          }`}
        >
          {busy ? "Saving..." : t.label}
        </button>
      ))}
      {showInvoice && (
        <InvoiceButton orderId={order.id} />
      )}
    </div>
  );
});

const OrderDesktopRow = memo(function OrderDesktopRow({
  order,
  busy,
  expanded,
  onToggleExpand,
  onChange,
}: {
  order: any;
  busy: boolean;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onChange: (order: any, next: string, danger?: boolean, confirm?: boolean) => void;
}) {
  return (
    <>
    <tr className="border-t border-[#E9EFD6]">
      <td className="px-5 py-4">
        <button
          onClick={() => onToggleExpand(order.id)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} details for order ${order.orderNumber}`}
          className="text-left font-extrabold text-[#2A3A0C] underline decoration-dotted decoration-[#c9a88f] underline-offset-4 hover:text-[#B95509]"
        >
          {order.orderNumber}
        </button>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-xs text-[#5F6B3C]">
            {new Date(order.createdAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          {order.orderSource && order.orderSource !== "DIRECT" && (
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
              order.orderSource === "ZOMATO" ? "bg-red-100 text-red-700" :
              order.orderSource === "SWIGGY" ? "bg-orange-100 text-orange-700" :
              order.orderSource === "PHONE" ? "bg-blue-100 text-blue-700" :
              "bg-green-100 text-green-700"
            }`}>
              {order.orderSource}
            </span>
          )}
        </div>
      </td>
      <td className="px-5 py-4">
        <p className="text-sm font-bold">{order.customerName || "Guest"}</p>
        <p className="text-xs text-[#5F6B3C]">{order.customerPhone || "-"}</p>
      </td>
      <td className="px-5 py-4">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
            order.paymentStatus === "PAID"
              ? "bg-[#e5f1e5] text-[#42774b]"
              : order.paymentStatus === "FAILED"
              ? "bg-red-50 text-red-700"
              : "bg-[#f7e5d7] text-[#a74c34]"
          }`}
        >
          {order.paymentStatus}
        </span>
      </td>
      <td className="px-5 py-4 font-extrabold">
        {money(order.totalPaise)}
      </td>
      <td className="px-5 py-4">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
            statusColor[order.status] ?? "bg-gray-100 text-gray-700"
          }`}
        >
          {statusLabel[order.status] ?? order.status}
        </span>
      </td>
      <td className="px-5 py-4">
        <OrderActions order={order} busy={busy} onChange={onChange} />
      </td>
    </tr>
    {expanded && (
      <tr className="border-t border-dashed border-[#e4d2c2] bg-[#fff8f1]">
        <td colSpan={6} className="px-5 py-4">
          <OrderDetails orderId={order.id} />
        </td>
      </tr>
    )}
    </>
  );
});

const OrderMobileCard = memo(function OrderMobileCard({
  order,
  busy,
  expanded,
  onToggleExpand,
  onChange,
}: {
  order: any;
  busy: boolean;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onChange: (order: any, next: string, danger?: boolean, confirm?: boolean) => void;
}) {
  return (
    <article className="rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <button
            onClick={() => onToggleExpand(order.id)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} details for order ${order.orderNumber}`}
            className="text-left text-sm font-extrabold text-[#2A3A0C] underline decoration-dotted decoration-[#c9a88f] underline-offset-4"
          >
            {order.orderNumber}
          </button>
          <p className="mt-0.5 text-xs text-[#5F6B3C]">
            {new Date(order.createdAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
            statusColor[order.status] ?? "bg-gray-100 text-gray-700"
          }`}
        >
          {statusLabel[order.status] ?? order.status}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <p className="font-bold">{order.customerName || "Guest"}</p>
        <p className="font-extrabold">{money(order.totalPaise)}</p>
      </div>
      <p className="mt-1 text-xs text-[#5F6B3C]">{order.customerPhone || "No phone"} · {order.paymentStatus}</p>
      {expanded && (
        <div className="mt-3 border-t border-[#E9EFD6] pt-3">
          <OrderDetails orderId={order.id} />
        </div>
      )}
      <div className="mt-3 border-t border-[#E9EFD6] pt-3">
        <OrderActions order={order} busy={busy} onChange={onChange} />
      </div>
    </article>
  );
});

// Lazily-loaded line items / address / history for one order. The queue query
// returns headers only, so without this the desk cannot verify a pick.
function OrderDetails({ orderId }: { orderId: string }) {
  const detail = trpc.admin.orderDetail.useQuery({ orderId }, { retry: false });
  if (detail.isLoading) {
    return (
      <div className="space-y-2" aria-label="Loading order details">
        <div className="h-8 animate-pulse rounded-lg bg-[#E9EFD6]" />
        <div className="h-8 animate-pulse rounded-lg bg-[#E9EFD6]" />
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#a34630]">
        <span>Could not load order details.</span>
        <button onClick={() => detail.refetch()} className="underline underline-offset-2">Retry</button>
      </div>
    );
  }
  const d = detail.data as any;
  const addr = (d.addressSnapshot ?? {}) as Record<string, string>;
  const addrLine = [addr.flatHouse, addr.building, addr.street, addr.area, addr.city, addr.postalCode]
    .filter((v) => typeof v === "string" && v.trim())
    .join(", ");
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        {(d.items ?? []).map((it: any) => (
          <div key={it.id} className="flex items-start gap-2">
            <span className="w-8 shrink-0 font-extrabold text-[#2A3A0C]">{it.quantity}x</span>
            <div className="min-w-0">
              <p className="font-bold text-[#2A3A0C]">{it.itemNameSnapshot}</p>
              {it.variantNameSnapshot && (
                <p className="text-xs text-[#5F6B3C]">{it.variantNameSnapshot}</p>
              )}
              {Array.isArray(it.selectedModifiers) && it.selectedModifiers.length > 0 && (
                <p className="text-xs italic text-[#5F6B3C]">
                  + {it.selectedModifiers.map((m: any) => m.optionName ?? "").filter(Boolean).join(", ")}
                </p>
              )}
              {it.specialInstructions && (
                <p className="text-xs font-bold text-[#a3541f]">Note: {it.specialInstructions}</p>
              )}
            </div>
            <span className="ml-auto shrink-0 font-bold text-[#2A3A0C]">
              {money((it.unitPricePaise ?? 0) * (it.quantity ?? 1))}
            </span>
          </div>
        ))}
        {(d.items ?? []).length === 0 && (
          <p className="text-xs text-[#5F6B3C]">No line items recorded.</p>
        )}
      </div>
      <div className="grid gap-2 border-t border-[#E9EFD6] pt-3 text-xs text-[#71513e] sm:grid-cols-2">
        <p><span className="font-extrabold">Deliver to: </span>{addrLine || "—"}</p>
        <p><span className="font-extrabold">Instructions: </span>{d.specialInstructions || d.deliveryNotes || "—"}</p>
        <p><span className="font-extrabold">Payment: </span>{d.paymentStatus}{d.payment ? ` via ${d.payment.method ?? d.payment.provider ?? "—"}` : ""}</p>
        <p><span className="font-extrabold">Updates: </span>{(d.history ?? []).length} status event{(d.history ?? []).length === 1 ? "" : "s"}</p>
      </div>
    </div>
  );
}

function OrdersPanel({ restaurantId }: { restaurantId: string }) {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 200);
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  // Concrete statuses are filtered server-side so paging stays correct; "all"
  // and "active" still filter client-side ("active" spans 8 statuses).
  const serverStatus =
    filter !== "all" && filter !== "active" ? (filter as never) : undefined;
  // Free-text search has no server endpoint, so it only covers loaded rows.
  // Widen the window to the server max while searching instead of one page.
  const searching = q.length > 0;
  const queryLimit = searching ? 200 : ORDERS_PAGE_SIZE;
  const queryOffset = searching ? 0 : page * ORDERS_PAGE_SIZE;

  const ordersQuery = trpc.admin.orders.useQuery(
    serverStatus
      ? { restaurantId, status: serverStatus, limit: queryLimit, offset: queryOffset }
      : { restaurantId, limit: queryLimit, offset: queryOffset },
    { refetchInterval: 5000, retry: false }
  );

  const updateOrder = trpc.admin.updateOrderStatus.useMutation({
    onSuccess: () => {
      utils.admin.orders.invalidate();
      utils.admin.dashboard.invalidate();
      toast.success("Order updated");
    },
    onError: (err) => toast.error(err.message || "Could not update order."),
    onSettled: () => setBusyId(null),
  });

  const orders = (ordersQuery.data ?? []) as any[];
  const filtered = useMemo(
    () =>
      orders.filter((o: any) => {
        if (filter === "active" && !ORDER_ACTIVE_STATUSES.includes(o.status)) return false;
        if (filter !== "all" && filter !== "active" && o.status !== filter) return false;
        if (q) {
          const hay = `${o.orderNumber ?? ""} ${o.customerName ?? ""} ${o.customerPhone ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordersQuery.data, filter, q]
  );
  // Page-scoped by construction (the queue has no server count endpoint) —
  // label it as such so it is never mistaken for the workspace total.
  const openOnPage = useMemo(
    () => orders.filter((o: any) => ORDER_ACTIVE_STATUSES.includes(o.status)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordersQuery.data]
  );
  const hasMore = !searching && orders.length === ORDERS_PAGE_SIZE;

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const changeStatus = useCallback(
    (order: any, next: string, danger?: boolean, confirm?: boolean) => {
      if (danger || confirm || next === "DELIVERED") {
        const ok = window.confirm(
          `This will mark order ${order.orderNumber} as ${statusLabel[next] ?? next}. Continue?`
        );
        if (!ok) return;
      }
      setBusyId(order.id);
      updateOrder.mutate({ orderId: order.id, status: next as never });
    },
    [updateOrder.mutate]
  );

  if (ordersQuery.isLoading) return <AdminLoading />;
  if (ordersQuery.isError || !ordersQuery.data) {
    return (
      <AdminError
        message="We couldn't load orders. Please retry."
        onRetry={() => ordersQuery.refetch()}
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-[#fffdf9] shadow-sm">
      <div className="border-b border-[#D8DFC0] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
              Live operations
            </p>
            <h2 className="font-display mt-1 text-2xl">Order queue</h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="rounded-full bg-[#E9EFD6] px-3 py-1 text-xs font-extrabold text-[#a64130]"
              title="Counts only the orders loaded on this page — the workspace total lives on the overview."
            >
              {openOnPage} open on this page
            </span>
            <button
              onClick={() => ordersQuery.refetch()}
              disabled={ordersQuery.isFetching}
              aria-label="Refresh orders"
              className="grid h-11 w-11 place-items-center rounded-xl border border-[#D8DFC0] bg-white text-[#3F4C1E] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${ordersQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="orders-search" className="sr-only">Search orders</label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F6B3C]" />
            <Input
              id="orders-search"
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(0); }}
              placeholder="Search order, name, or phone..."
              className="h-11 rounded-xl border-[#D8DFC0] pl-9 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar" role="group" aria-label="Order status filter">
          {[
            ["all", "All"],
            ["active", "Active"],
            ["PLACED", "New"],
            ["PREPARING", "Preparing"],
            ["READY_FOR_PICKUP", "Ready"],
            ["DELIVERED", "Delivered"],
            ["CANCELLED", "Cancelled"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setFilter(value); setPage(0); }}
              aria-pressed={filter === value}
              className={`min-h-11 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-extrabold ${
                filter === value
                  ? "bg-[#2A3A0C] text-white"
                  : "border border-[#D8DFC0] bg-white text-[#3F4C1E]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-[#f8efe6] text-[10px] uppercase tracking-[0.14em] text-[#9b7861]">
                <tr>
                  <th className="px-5 py-3 font-extrabold">Order</th>
                  <th className="px-5 py-3 font-extrabold">Customer</th>
                  <th className="px-5 py-3 font-extrabold">Payment</th>
                  <th className="px-5 py-3 font-extrabold">Amount</th>
                  <th className="px-5 py-3 font-extrabold">Status</th>
                  <th className="px-5 py-3 font-extrabold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order: any) => (
                  <OrderDesktopRow
                    key={order.id}
                    order={order}
                    busy={busyId === order.id}
                    expanded={expandedId === order.id}
                    onToggleExpand={toggleExpand}
                    onChange={changeStatus}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 p-4 md:hidden">
            {filtered.map((order: any) => (
              <OrderMobileCard
                key={order.id}
                order={order}
                busy={busyId === order.id}
                expanded={expandedId === order.id}
                onToggleExpand={toggleExpand}
                onChange={changeStatus}
              />
            ))}
          </div>

          {/* Server pagination */}
          <div className="flex items-center justify-between border-t border-[#D8DFC0] px-5 py-3">
            <p className="text-xs font-bold text-[#5F6B3C]">
              {searching
                ? `Searching recent ${orders.length} · ${filtered.length} match${filtered.length === 1 ? "" : "es"}`
                : `Page ${page + 1} · ${filtered.length} shown`}
            </p>
            {!searching && (
            <div className="flex gap-2">
              <Button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || ordersQuery.isFetching}
                variant="outline"
                className="h-11 min-h-11 rounded-xl border-[#D8DFC0] px-4 text-xs font-extrabold text-[#3F4C1E]"
              >
                Previous
              </Button>
              <Button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore || ordersQuery.isFetching}
                variant="outline"
                className="h-11 min-h-11 rounded-xl border-[#D8DFC0] px-4 text-xs font-extrabold text-[#3F4C1E]"
              >
                Next
              </Button>
            </div>
            )}
          </div>
        </>
      ) : searching || filter !== "all" ? (
        <div className="space-y-3 p-8 text-center">
          <p className="text-sm font-extrabold text-[#2A3A0C]">No orders match this search</p>
          <p className="text-xs text-[#5F6B3C]">
            {searching
              ? "Search covers the 200 most recent orders — older orders need a narrower status filter."
              : "Try a different status filter."}
          </p>
          <Button
            onClick={() => { setSearchInput(""); setFilter("all"); setPage(0); }}
            variant="outline"
            className="h-11 rounded-xl border-[#D8DFC0] px-4 text-xs font-extrabold text-[#3F4C1E]"
          >
            Clear search & filters
          </Button>
        </div>
      ) : (
        <div className="p-8">
          <EmptyKitchen />
        </div>
      )}
    </section>
  );
}

// =============================================================================
// Menu Panel
// =============================================================================

// Memoized menu row: stable `item` reference from the dashboard cache plus
// primitives and stable callbacks only — no inline object/array props.
const MenuItemRow = memo(function MenuItemRow({
  item,
  selected,
  listPending,
  onToggleSelect,
  onStartEdit,
  onDeleteRequest,
  onToggle,
  onAvailability,
}: {
  item: any;
  selected: boolean;
  listPending: boolean;
  onToggleSelect: (id: string) => void;
  onStartEdit: (item: any) => void;
  onDeleteRequest: (id: string) => void;
  onToggle: (id: string, isOpen: boolean) => void;
  onAvailability: (id: string, status: string) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <input type="checkbox" aria-label={`Select ${item.name}`} checked={selected} onChange={() => onToggleSelect(item.id)} className="shrink-0 accent-[#B95509]" />
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover border border-[#D8DFC0]" />
      ) : (
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${
          item.dietaryType === "veg" ? "bg-green-50 text-green-700" : item.dietaryType === "egg" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
        }`}>
          {item.dietaryType === "veg" ? "V" : item.dietaryType === "egg" ? "E" : "NV"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-extrabold">{item.name}</p>
          {item.isBestseller && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-700">BESTSELLER</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-[#8b6b57]">{item.description}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs font-bold">
          <span>{money(item.pricePaise)}</span>
          {item.offerPricePaise && <span className="text-green-600">Offer: {money(item.offerPricePaise)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onStartEdit(item)} disabled={listPending} className="rounded-lg border border-[#D8DFC0] bg-white px-2 py-1.5 text-[10px] font-bold text-[#2A3A0C] hover:bg-[#E9EFD6] disabled:opacity-50">Edit</button>
        <button onClick={() => onDeleteRequest(item.id)} disabled={listPending} className="rounded-lg border border-red-200 bg-white px-2 py-1.5 text-[10px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" role="switch" aria-checked={item.isOpen} aria-label={`Show ${item.name} on storefront`} checked={item.isOpen} onChange={(e) => {
            if (!e.target.checked && !window.confirm(`Hide "${item.name}" from the storefront?`)) return;
            onToggle(item.id, e.target.checked);
          }} disabled={listPending} className="peer sr-only" />
          <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#B95509] after:peer-checked:translate-x-full" />
        </label>
        <label className="sr-only" htmlFor={`avail-${item.id}`}>Availability for {item.name}</label>
        <select
          id={`avail-${item.id}`}
          value={item.availability}
          disabled={listPending}
          onChange={(e) => {
            if (e.target.value === "DISABLED" && !window.confirm(`Hide "${item.name}" from the storefront?`)) return;
            onAvailability(item.id, e.target.value);
          }}
          className="rounded-lg border border-[#D8DFC0] bg-white px-2 py-2 text-xs font-extrabold disabled:opacity-50"
        >
          <option value="AVAILABLE">Available</option>
          <option value="SOLD_OUT">Sold out</option>
          <option value="SCHEDULED_UNAVAILABLE">Later</option>
          <option value="OUT_OF_STOCK">Out of stock</option>
          <option value="DISABLED">Hidden</option>
        </select>
      </div>
    </div>
  );
});

function MenuPanel({
  data,
  itemForm,
  setItemForm,
  onCreate,
  createPending,
  listPending,
  onAvailability,
  onToggle,
  onUploadImage,
  onDelete,
  onUpdateItem,
  onBulkUpdate,
  restaurantId,
}: {
  data: any;
  itemForm: any;
  setItemForm: (f: any) => void;
  onCreate: () => void;
  createPending: boolean;
  listPending: boolean;
  onAvailability: (id: string, status: string) => void;
  onToggle: (id: string, isOpen: boolean) => void;
  onUploadImage: any;
  onDelete: (id: string) => void;
  onUpdateItem: (input: any) => void;
  onBulkUpdate: (input: any) => void;
  restaurantId: string;
}) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 200);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const searchLower = search.trim().toLowerCase();
  const items = useMemo(
    () =>
      (data.items ?? []).filter((item: any) =>
        searchLower ? item.name.toLowerCase().includes(searchLower) : true
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.items, searchLower]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === items.length) return new Set<string>();
      return new Set(items.map((i: any) => i.id));
    });
  }, [items]);

  const handleImageUpload = async (
    file: File,
    target: "create" | "edit",
    scopeRestaurantId: string,
  ) => {
    if (file.size > 2 * 1024 * 1024) return toast.error("Image must be under 2 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return toast.error("Use a PNG, JPG or WebP image.");
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          const result = await onUploadImage.mutateAsync({
            restaurantId: scopeRestaurantId,
            data: base64,
            filename: file.name,
            contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
          });
          if (target === "create") {
            setItemForm({ ...itemForm, imageUrl: result.url });
            setImagePreview(result.url);
          } else {
            setEditForm({ ...editForm, imageUrl: result.url });
          }
        } catch {
          toast.error("Image upload failed.");
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
      toast.error("Could not read image file.");
    }
  };

  const startEdit = useCallback((item: any) => {
    setEditingId(item.id);
    setEditForm({
      itemId: item.id,
      name: item.name,
      description: item.description ?? "",
      pricePaise: item.pricePaise,
      offerPricePaise: item.offerPricePaise,
      dietaryType: item.dietaryType,
      isBestseller: item.isBestseller,
      imageUrl: item.imageUrl,
    });
  }, []);

  const handleDeleteRequest = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const saveEdit = () => {
    if (!editingId) return;
    if (!String(editForm.name ?? "").trim())
      return toast.error("Dish name cannot be empty.");
    const pricePaise = Number(editForm.pricePaise);
    if (!Number.isFinite(pricePaise) || pricePaise <= 0)
      return toast.error("Enter a valid price greater than ₹0.");
    if (editForm.offerPricePaise !== null && editForm.offerPricePaise !== undefined) {
      const offer = Number(editForm.offerPricePaise);
      if (!Number.isFinite(offer) || offer <= 0)
        return toast.error("Offer price must be greater than ₹0, or cleared.");
      if (offer >= Math.round(pricePaise))
        return toast.error("Offer price must be lower than the regular price.");
    }
    onUpdateItem({
      itemId: editingId,
      name: String(editForm.name).trim(),
      description: editForm.description || undefined,
      pricePaise: Math.round(pricePaise),
      offerPricePaise: editForm.offerPricePaise || undefined,
      dietaryType: editForm.dietaryType,
      isBestseller: editForm.isBestseller,
      imageUrl: editForm.imageUrl === null ? null : editForm.imageUrl || undefined,
    });
    setEditingId(null);
  };

  // The create form lives in the parent: once it resets imageUrl after a
  // successful add, drop the stale local preview too.
  useEffect(() => {
    if (!itemForm.imageUrl) setImagePreview(null);
  }, [itemForm.imageUrl]);

  return (
    <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
      {/* Add Item Form */}
      <aside className="rounded-2xl bg-[#2A3A0C] p-5 text-white shadow-sm">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e7b99d]">
          Add a dish
        </p>
        <h2 className="font-display mt-2 text-3xl">Make the menu yours</h2>
        <div className="mt-6 space-y-3">
          {/* Image upload */}
          <div className="flex items-center gap-3">
            {imagePreview ? (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/20">
                <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                <button aria-label="Remove dish photo" onClick={() => { setImagePreview(null); setItemForm({ ...itemForm, imageUrl: undefined }); }} className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-white"><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-white/30 hover:border-white/60">
                {uploading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5 text-white/50" />}
                <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload dish photo" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void handleImageUpload(file, "create", restaurantId); }} />
              </label>
            )}
            <span className="text-xs text-white/50">{imagePreview ? "Image ready" : "Tap to add photo"}</span>
          </div>

          <Input
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            placeholder="Dish name"
            aria-label="Dish name"
            className="h-11 border-white/20 bg-white/10 text-white placeholder:text-white/50"
          />
          <textarea
            value={itemForm.description ?? ""}
            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
            placeholder="Short description"
            aria-label="Dish description"
            rows={2}
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 resize-none"
          />
          <Input
            value={itemForm.price}
            onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
            inputMode="numeric"
            placeholder="Price in ₹"
            aria-label="Price in rupees"
            className="h-11 border-white/20 bg-white/10 text-white placeholder:text-white/50"
          />
          <label className="sr-only" htmlFor="menu-item-category">Category</label>
          <select
            id="menu-item-category"
            value={itemForm.categoryId}
            onChange={(e) =>
              setItemForm({ ...itemForm, categoryId: e.target.value })
            }
            className="h-11 min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-bold text-white"
          >
            <option className="text-black" value="">
              Choose category
            </option>
            {(data.categories ?? []).map((cat: any) => (
              <option className="text-black" key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="menu-item-diet">Dietary type</label>
          <select
            id="menu-item-diet"
            value={itemForm.dietaryType}
            onChange={(e) =>
              setItemForm({
                ...itemForm,
                dietaryType: e.target.value as "veg" | "nonveg" | "egg",
              })
            }
            className="h-11 min-h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-bold text-white"
          >
            <option className="text-black" value="veg">
              Vegetarian
            </option>
            <option className="text-black" value="nonveg">
              Non-vegetarian
            </option>
            <option className="text-black" value="egg">
              Contains egg
            </option>
          </select>
          <Button
            onClick={onCreate}
            disabled={uploading || createPending}
            className="h-11 w-full rounded-xl bg-[#E9EFD6] font-extrabold text-[#40291c] hover:bg-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            {createPending ? "Adding..." : "Add to menu"}
          </Button>
        </div>
      </aside>

      {/* Menu Items List */}
      <section className="overflow-hidden rounded-2xl bg-[#fffdf9] shadow-sm">
        <div className="border-b border-[#D8DFC0] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
                Live menu
              </p>
              <h2 className="font-display mt-1 text-2xl">Availability controls</h2>
            </div>
            <span className="text-sm font-bold text-[#5F6B3C]">
              {(data.items ?? []).length} dishes
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F6B3C]" />
              <label htmlFor="menu-search" className="sr-only">Search menu items</label>
              <Input
                id="menu-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search menu items..."
                className="h-11 min-h-11 rounded-xl border-[#D8DFC0] pl-9 text-sm"
              />
            </div>
            {items.length > 0 && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#D8DFC0] bg-white px-3 text-xs font-bold text-[#5F6B3C]">
                <input type="checkbox" aria-label="Select all dishes" checked={selectedIds.size === items.length && items.length > 0} onChange={toggleAll} className="accent-[#B95509]" />
                All
              </label>
            )}
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#2A3A0C] px-4 py-2.5">
              <span className="text-xs font-bold text-white">{selectedIds.size} selected</span>
              <button onClick={() => onBulkUpdate({ itemIds: Array.from(selectedIds), availability: "AVAILABLE" })} disabled={listPending} className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-white/20 disabled:opacity-50">Set available</button>
              <button onClick={() => onBulkUpdate({ itemIds: Array.from(selectedIds), availability: "SOLD_OUT" })} disabled={listPending} className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-white/20 disabled:opacity-50">Sold out</button>
              <button onClick={() => { if (window.confirm(`Hide ${selectedIds.size} selected dish${selectedIds.size === 1 ? "" : "es"} from the storefront?`)) onBulkUpdate({ itemIds: Array.from(selectedIds), isOpen: false, availability: "DISABLED" }); }} disabled={listPending} className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-white/20 disabled:opacity-50">Disable</button>
              <button onClick={() => { setSelectedIds(new Set()); }} className="ml-auto text-[10px] font-bold text-white/60 hover:text-white">Clear</button>
            </div>
          )}
        </div>
        <div className="divide-y divide-[#E9EFD6]">
          {(data.items ?? []).length === 0 ? (
            <div className="p-10 text-center">
              <UtensilsCrossed className="mx-auto h-8 w-8 text-[#B95509]" />
              <p className="mt-3 text-sm font-extrabold text-[#2A3A0C]">No dishes yet</p>
              <p className="mt-1 text-xs text-[#5F6B3C]">Add your first dish from the panel, or import the whole menu as CSV.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="space-y-3 p-10 text-center">
              <p className="text-sm font-extrabold text-[#2A3A0C]">No dishes match “{search.trim()}”</p>
              <Button
                onClick={() => setSearchInput("")}
                variant="outline"
                className="h-11 rounded-xl border-[#D8DFC0] px-4 text-xs font-extrabold text-[#3F4C1E]"
              >
                Clear search
              </Button>
            </div>
          ) : (
          items.map((item: any) => (
            <article key={item.id} className="p-4">
              {editingId === item.id ? (
                /* Inline Edit Form */
                <div className="space-y-3 rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-4">
                  <div className="flex items-start gap-3">
                    {editForm.imageUrl ? (
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[#D8DFC0]">
                        <img src={editForm.imageUrl} alt="" className="h-full w-full object-cover" />
                        <button type="button" aria-label="Remove dish photo" onClick={() => setEditForm({ ...editForm, imageUrl: null })} className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-white"><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <label className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[#D8DFC0] hover:border-[#B95509]">
                        <Plus className="h-4 w-4 text-[#5F6B3C]" />
                        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload dish photo" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void handleImageUpload(file, "edit", restaurantId); }} />
                      </label>
                    )}
                    <div className="flex-1 space-y-2">
                      <Input value={editForm.name ?? ""} aria-label="Dish name" onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" className="h-9 rounded-lg border-[#D8DFC0] text-sm" />
                      <textarea value={editForm.description ?? ""} aria-label="Dish description" onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Description" rows={2} className="w-full rounded-lg border border-[#D8DFC0] px-3 py-1.5 text-sm resize-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input value={Number.isFinite(editForm.pricePaise) ? (editForm.pricePaise / 100).toFixed(2) : ""} aria-label="Price in rupees" onChange={(e) => setEditForm({ ...editForm, pricePaise: Math.round(Number(e.target.value) * 100) })} placeholder="Price ₹" inputMode="numeric" className="h-9 rounded-lg border-[#D8DFC0] text-sm" />
                    <Input value={editForm.offerPricePaise != null && Number.isFinite(Number(editForm.offerPricePaise)) ? (Number(editForm.offerPricePaise) / 100).toFixed(2) : ""} aria-label="Offer price in rupees" onChange={(e) => setEditForm({ ...editForm, offerPricePaise: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} placeholder="Offer ₹" inputMode="numeric" className="h-9 rounded-lg border-[#D8DFC0] text-sm" />
                    <label className="sr-only" htmlFor={`edit-diet-${item.id}`}>Dietary type</label>
                    <select id={`edit-diet-${item.id}`} value={editForm.dietaryType ?? "veg"} onChange={(e) => setEditForm({ ...editForm, dietaryType: e.target.value })} className="h-9 rounded-lg border border-[#D8DFC0] px-2 text-sm">
                      <option value="veg">Veg</option>
                      <option value="nonveg">Non-veg</option>
                      <option value="egg">Egg</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-[#2A3A0C]">
                      <input type="checkbox" checked={editForm.isBestseller ?? false} onChange={(e) => setEditForm({ ...editForm, isBestseller: e.target.checked })} className="accent-[#B95509]" />
                      Bestseller
                    </label>
                    <div className="ml-auto flex gap-2">
                      <Button onClick={() => setEditingId(null)} variant="outline" className="h-8 rounded-lg border-[#D8DFC0] text-xs font-bold">Cancel</Button>
                      <Button onClick={saveEdit} disabled={listPending} className="h-8 rounded-lg bg-[#B95509] text-xs font-bold text-white">Save</Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Normal Row (memoized; stable item ref + stable callbacks) */
                <MenuItemRow
                  item={item}
                  selected={selectedIds.has(item.id)}
                  listPending={listPending}
                  onToggleSelect={toggleSelect}
                  onStartEdit={startEdit}
                  onDeleteRequest={handleDeleteRequest}
                  onToggle={onToggle}
                  onAvailability={onAvailability}
                />
              )}
            </article>
          )))}
        </div>
      </section>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this dish?</AlertDialogTitle>
            <AlertDialogDescription>
              The item will be hidden from the storefront. This cannot be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep dish</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) onDelete(deleteId); setDeleteId(null); }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete dish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// Categories Panel
// =============================================================================

function CategoriesPanel({
  data,
  pending,
  onCreateCategory,
  onUpdateCategory,
}: {
  data: any;
  pending: boolean;
  onCreateCategory: (input: { restaurantId: string; name: string; description?: string }) => void;
  onUpdateCategory: (input: { categoryId: string; isVisible?: boolean; isOpen?: boolean; name?: string; sortOrder?: number }) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const categories = data.categories ?? [];
  const items = data.items ?? [];

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error("Enter a category name first.");
      return;
    }
    onCreateCategory({
      restaurantId: data.restaurant.id,
      name: newName.trim(),
      description: newDesc.trim() || undefined,
    });
    setNewName("");
    setNewDesc("");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
      {/* Create Category */}
      <aside className="rounded-2xl bg-[#2A3A0C] p-5 text-white shadow-sm">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e7b99d]">
          New category
        </p>
        <h2 className="font-display mt-2 text-3xl">Organise your menu</h2>
        <div className="mt-6 space-y-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Category name"
            aria-label="New category name"
            className="h-11 border-white/20 bg-white/10 text-white placeholder:text-white/50"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Short description (optional)"
            aria-label="New category description"
            rows={2}
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 resize-none"
          />
          <Button
            onClick={handleCreate}
            disabled={!newName.trim() || pending}
            className="h-11 w-full rounded-xl bg-[#E9EFD6] font-extrabold text-[#40291c] hover:bg-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add category
          </Button>
        </div>
      </aside>

      {/* Category List */}
      <section className="overflow-hidden rounded-2xl bg-[#fffdf9] shadow-sm">
        <div className="border-b border-[#D8DFC0] p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
            All categories
          </p>
          <h2 className="font-display mt-1 text-2xl">Visibility & availability</h2>
          <span className="mt-1 block text-sm font-bold text-[#5F6B3C]">
            {categories.length} categories · {items.length} items total
          </span>
        </div>
        <div className="divide-y divide-[#E9EFD6]">
          {categories.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-extrabold text-[#2A3A0C]">No categories yet</p>
              <p className="mt-1 text-xs text-[#5F6B3C]">Create a category to start organising your menu.</p>
            </div>
          ) : (
            categories.map((cat: any) => {
              const catItems = items.filter((i: any) => i.categoryId === cat.id);
              return (
                <CategoryRow
                  key={cat.id}
                  cat={cat}
                  itemCount={catItems.length}
                  pending={pending}
                  onUpdate={onUpdateCategory}
                />
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function CategoryRow({
  cat,
  itemCount,
  pending,
  onUpdate,
}: {
  cat: any;
  itemCount: number;
  pending: boolean;
  onUpdate: (input: { categoryId: string; isVisible?: boolean; isOpen?: boolean; name?: string; sortOrder?: number }) => void;
}) {
  const [name, setName] = useState(cat.name);
  const [sortOrder, setSortOrder] = useState(cat.sortOrder != null ? String(cat.sortOrder) : "0");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Re-sync local fields when the server row changes (e.g. after a rename
  // save + dashboard refetch); untouched while the user is typing.
  useEffect(() => { setName(cat.name); }, [cat.name]);
  useEffect(() => { setSortOrder(cat.sortOrder != null ? String(cat.sortOrder) : "0"); }, [cat.sortOrder]);
  const dirtyName = name.trim() !== (cat.name ?? "");
  const dirtyOrder = sortOrder.trim() !== String(cat.sortOrder ?? 0);

  // Flattened display label (supports nested data; flat data renders plainly).
  const flatLabel = cat.parentName ? `${cat.parentName} / ${cat.name}` : cat.parentId ? `— ${cat.name}` : cat.name;

  const saveMeta = () => {
    if (dirtyName && !name.trim()) {
      toast.error("Category name cannot be empty.");
      return;
    }
    const orderNum = Number(sortOrder);
    if (dirtyOrder && (!Number.isFinite(orderNum) || !Number.isInteger(orderNum))) {
      toast.error("Sort order must be a whole number.");
      return;
    }
    onUpdate({
      categoryId: cat.id,
      ...(dirtyName ? { name: name.trim() } : {}),
      ...(dirtyOrder ? { sortOrder: orderNum } : {}),
    });
  };

  return (
    <article className="space-y-3 p-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#2A3A0C]">{flatLabel}</p>
          {cat.description && (
            <p className="mt-0.5 truncate text-xs text-[#8b6b57]">{cat.description}</p>
          )}
          <p className="mt-0.5 text-[10px] font-bold text-[#5F6B3C]">
            {itemCount} {itemCount === 1 ? "item" : "items"}
            {cat.sortOrder != null ? ` · Order ${cat.sortOrder}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-extrabold uppercase text-[#5F6B3C]">Visible</span>
            <Switch
              checked={cat.isVisible !== false}
              disabled={pending}
              aria-label={`Visible: ${cat.name}`}
              onCheckedChange={(checked) => onUpdate({ categoryId: cat.id, isVisible: checked })}
            />
          </label>
          <label className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-extrabold uppercase text-[#5F6B3C]">Open</span>
            <Switch
              checked={cat.isOpen !== false}
              disabled={pending}
              aria-label={`Open: ${cat.name}`}
              onCheckedChange={(checked) => onUpdate({ categoryId: cat.id, isOpen: checked })}
            />
          </label>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            aria-label={`Delete category ${cat.name}`}
            className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1 text-[10px] font-extrabold uppercase text-[#5F6B3C]">
          Rename
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            aria-label={`Rename category ${cat.name}`}
            className="mt-1 h-10 rounded-lg border-[#D8DFC0] text-sm font-normal normal-case"
          />
        </label>
        <label className="w-full text-[10px] font-extrabold uppercase text-[#5F6B3C] sm:w-28">
          Sort order
          <Input
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            disabled={pending}
            inputMode="numeric"
            aria-label={`Sort order for ${cat.name}`}
            className="mt-1 h-10 rounded-lg border-[#D8DFC0] text-sm font-normal"
          />
        </label>
        <Button
          onClick={saveMeta}
          disabled={pending || (!dirtyName && !dirtyOrder)}
          variant="outline"
          className="h-10 self-end rounded-lg border-[#D8DFC0] text-xs font-bold"
        >
          Save
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide category “{cat.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The category and its {itemCount} {itemCount === 1 ? "item" : "items"} will be hidden
              from the storefront. You can make it visible again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep category</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onUpdate({ categoryId: cat.id, isVisible: false, isOpen: false })}
              className="bg-red-600 hover:bg-red-700"
            >
              Hide category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

// =============================================================================
// Coupons Panel
// =============================================================================

function CouponsPanel({
  data,
  form,
  setForm,
  onSave,
  savePending,
  onReactivate,
}: {
  data: any;
  form: any;
  setForm: (f: any) => void;
  onSave: () => void;
  savePending: boolean;
  onReactivate: (coupon: any) => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const unsupported = () =>
    toast.error("Coupon deactivation isn't supported by the server yet — the coupon stays live.");

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
          New offer
        </p>
        <h2 className="font-display mt-1 text-2xl">Give guests a reason</h2>
        <div className="mt-5 space-y-3">
          <Input
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.toUpperCase() })
            }
            placeholder="CODE"
            aria-label="Coupon code"
            className="h-11 rounded-xl border-[#D8DFC0] font-extrabold"
          />
          <Input
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="Offer description"
            aria-label="Offer description"
            className="h-11 rounded-xl border-[#D8DFC0]"
          />
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="coupon-type">Discount type</label>
            <select
              id="coupon-type"
              value={form.discountType}
              onChange={(e) =>
                setForm({ ...form, discountType: e.target.value })
              }
              className="h-11 min-h-11 rounded-xl border border-[#D8DFC0] bg-white px-3 text-sm font-bold"
            >
              <option value="flat">Flat (₹)</option>
              <option value="percent">Percentage (%)</option>
            </select>
            <Input
              value={form.discount}
              onChange={(e) => setForm({ ...form, discount: e.target.value })}
              inputMode="numeric"
              placeholder={form.discountType === "flat" ? "₹ off" : "% off (1-100)"}
              aria-label={form.discountType === "flat" ? "Flat discount in rupees" : "Percentage discount 1 to 100"}
              className="h-11 rounded-xl border-[#D8DFC0]"
            />
          </div>
          <Input
            value={form.minOrder}
            onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
            inputMode="numeric"
            placeholder="Minimum order in ₹"
            aria-label="Minimum order in rupees"
            className="h-11 rounded-xl border-[#D8DFC0]"
          />
          <Button
            onClick={onSave}
            disabled={savePending}
            className="h-11 w-full rounded-xl bg-[#B95509] font-extrabold hover:bg-[#9C4A07]"
          >
            <TicketPercent className="mr-2 h-4 w-4" />
            {savePending ? "Saving..." : "Save offer"}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
          Live offers
        </p>
        <h2 className="font-display mt-1 text-2xl">On the counter now</h2>
        <div className="mt-5 space-y-3">
          {(data.offers ?? []).length ? (
            (data.offers ?? []).map((coupon: any) => {
              const active = coupon.isActive !== false;
              return (
                <article
                  key={coupon.id}
                  className="rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold tracking-wide text-[#B95509]">
                        {coupon.code}
                      </p>
                      <p className="mt-1 text-sm text-[#71513e]">
                        {coupon.description}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
                      active ? "bg-[#e5f1e5] text-[#42774b]" : "bg-gray-100 text-gray-600"
                    }`}>
                      {active ? "Live" : "Paused"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-bold text-[#906f5a]">
                    {coupon.discountType === "flat"
                      ? `₹${coupon.discountValue / 100} off`
                      : `${coupon.discountValue}% off`}{" "}
                    · Min {money(coupon.minOrderPaise)}
                  </p>
                  <div className="mt-3 flex items-center gap-3 border-t border-[#f0e4d8] pt-3">
                    <label className="flex items-center gap-2 text-xs font-extrabold text-[#2A3A0C]">
                      <Switch
                        checked={active}
                        disabled={savePending}
                        aria-label={`Active: coupon ${coupon.code}`}
                        onCheckedChange={(checked) => {
                          if (checked) onReactivate(coupon);
                          else unsupported();
                        }}
                      />
                      Active
                    </label>
                    <div className="ml-auto flex gap-2">
                      {!active && (
                        <button
                          onClick={() => onReactivate(coupon)}
                          disabled={savePending}
                          className="rounded-lg border border-[#D8DFC0] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#2A3A0C] hover:bg-[#E9EFD6] disabled:opacity-50"
                        >
                          Re-enable
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(coupon)}
                        disabled={savePending}
                        aria-label={`Delete coupon ${coupon.code}`}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-[#D8DFC0] bg-[#E9EFD6] p-10 text-center">
              <TicketPercent className="mx-auto h-8 w-8 text-[#B95509]" />
              <p className="font-display mt-3 text-xl text-[#2A3A0C]">No offers yet</p>
              <p className="mt-1 text-sm text-[#5F6B3C]">Create your first coupon from the panel — it goes live immediately.</p>
            </div>
          )}
        </div>
      </section>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete coupon {deleteTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Coupon deletion isn't supported by the server yet. The coupon will stay live until
              server-side deletion is available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { unsupported(); setDeleteTarget(null); }}
              className="bg-red-600 hover:bg-red-700"
            >
              Understood
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// Customers Panel
// =============================================================================

// Memoized customer row: stable `customer` reference from the query cache
// plus one stable select callback — no inline object/array props.
const CustomerRow = memo(function CustomerRow({
  customer,
  onSelect,
}: {
  customer: any;
  onSelect: (id: string) => void;
}) {
  return (
    <tr
      onClick={() => onSelect(customer.id)}
      className="cursor-pointer hover:bg-[#E9EFD6] transition-colors"
    >
      <td className="px-5 py-4">
        <p className="text-sm font-bold text-[#2A3A0C]">{customer.userName || customer.preferredName || "Guest"}</p>
        <p className="mt-0.5 text-xs text-[#5F6B3C]">{customer.userEmail ?? "—"}</p>
      </td>
      <td className="px-5 py-4 text-sm text-[#2A3A0C]">{customer.mobileNumber ?? "—"}</td>
      <td className="px-5 py-4 text-sm font-bold text-[#2A3A0C]">{customer.totalOrders ?? 0}</td>
      <td className="px-5 py-4 text-sm font-extrabold text-[#2A3A0C]">₹{((customer.totalSpentPaise ?? 0) / 100).toLocaleString("en-IN")}</td>
      <td className="px-5 py-4 text-xs text-[#5F6B3C]">
        {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString("en-IN") : "—"}
      </td>
    </tr>
  );
});

function CustomersPanel({ restaurantId }: { restaurantId: string }) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 200);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const customers = trpc.admin.customers.useQuery({ restaurantId, search: search || undefined, limit: 50 });
  const customerDetail = trpc.admin.customerDetail.useQuery(
    { customerId: selectedId!, restaurantId },
    { enabled: !!selectedId, retry: false }
  );
  const updateNotes = trpc.admin.updateCustomerNotes.useMutation({
    onSuccess: () => {
      toast.success("Notes saved");
      customerDetail.refetch();
    },
    onError: (err) => toast.error(err.message || "Could not save notes."),
  });

  const list = customers.data ?? [];
  const detail = customerDetail.data;

  const handleSelectCustomer = useCallback((id: string) => {
    setSelectedId(id);
    setNotes("");
  }, []);

  // Initialise the editor from the server value (allows clearing the field).
  useEffect(() => {
    if (selectedId && detail) {
      setNotes(detail.adminNotes ?? "");
    }
  }, [selectedId, detail]);

  if (selectedId && detail) {
    return (
      <div className="space-y-5">
        <button
          onClick={() => { setSelectedId(null); setNotes(""); }}
          className="flex items-center gap-2 text-sm font-extrabold text-[#B95509] hover:underline"
        >
          ← Back to customers
        </button>
        <div className="rounded-2xl border border-[#D8DFC0] bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-display text-2xl text-[#2A3A0C]">
                {detail.userName || detail.preferredName || "Guest Customer"}
              </h3>
              <p className="mt-1 text-sm text-[#5F6B3C]">
                {detail.mobileNumber ?? "No phone"} · {detail.userEmail ?? "No email"}
              </p>
            </div>
            <span className="rounded-full bg-[#f0e4d8] px-3 py-1 text-[10px] font-extrabold text-[#5F6B3C]">
              {detail.totalOrders ?? 0} orders
            </span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-[#E9EFD6] p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5F6B3C]">Lifetime value</p>
              <p className="mt-1 text-xl font-extrabold text-[#2A3A0C]">₹{((detail.totalSpentPaise ?? 0) / 100).toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-xl bg-[#E9EFD6] p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5F6B3C]">Total orders</p>
              <p className="mt-1 text-xl font-extrabold text-[#2A3A0C]">{detail.totalOrders ?? 0}</p>
            </div>
            <div className="rounded-xl bg-[#E9EFD6] p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5F6B3C]">Registered</p>
              <p className="mt-1 text-sm font-bold text-[#2A3A0C]">
                {detail.createdAt ? new Date(detail.createdAt).toLocaleDateString("en-IN") : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Admin Notes */}
        <div className="rounded-2xl border border-[#D8DFC0] bg-white p-6 shadow-sm">
          <label htmlFor="customer-notes" className="text-[10px] font-extrabold uppercase tracking-wider text-[#5F6B3C]">Admin notes</label>
          <textarea
            id="customer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add private notes about this customer..."
            className="mt-3 min-h-20 w-full rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-3 text-sm outline-none focus:ring-2 focus:ring-[#B95509]"
          />
          <Button
            onClick={() => updateNotes.mutate({ customerId: selectedId, notes })}
            disabled={updateNotes.isPending}
            className="mt-3 h-10 rounded-xl bg-[#B95509] px-4 text-xs font-extrabold hover:bg-[#9C4A07]"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" /> {updateNotes.isPending ? "Saving..." : "Save notes"}
          </Button>
        </div>

        {/* Order History */}
        <div className="rounded-2xl border border-[#D8DFC0] bg-white shadow-sm">
          <div className="border-b border-[#D8DFC0] px-6 py-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5F6B3C]">Order history</p>
          </div>
          {detail.orderHistory?.length ? (
            <div className="divide-y divide-[#f0e4d8]">
              {detail.orderHistory.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm font-bold text-[#2A3A0C]">{order.orderNumber}</p>
                    <p className="mt-0.5 text-xs text-[#5F6B3C]">
                      {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-[#2A3A0C]">₹{((order.totalPaise ?? 0) / 100).toLocaleString("en-IN")}</p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                      order.status === "DELIVERED" ? "bg-green-50 text-green-700"
                      : order.status === "CANCELLED" ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-700"
                    }`}>
                      {statusLabel[order.status] ?? order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-6 py-8 text-center text-sm text-[#5F6B3C]">No orders yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F6B3C]" />
          <label htmlFor="customers-search" className="sr-only">Search customers</label>
          <input
            id="customers-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="h-11 min-h-11 w-full rounded-xl border border-[#D8DFC0] bg-white pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#B95509]"
          />
        </div>
      </div>

      {customers.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[#E9EFD6]" />
          ))}
        </div>
      ) : customers.isError ? (
        <AdminError
          message="We couldn't load customers. Please retry."
          onRetry={() => customers.refetch()}
        />
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D8DFC0] bg-[#E9EFD6] p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-[#B95509]" />
          <p className="mt-3 font-display text-xl text-[#2A3A0C]">No customers yet</p>
          <p className="mt-1 text-sm text-[#5F6B3C]">Customers will appear here once they place their first order.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#D8DFC0] bg-white shadow-sm">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-[#D8DFC0] bg-[#faf5ef]">
                <th className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#5F6B3C]">Customer</th>
                <th className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#5F6B3C]">Phone</th>
                <th className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#5F6B3C]">Orders</th>
                <th className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#5F6B3C]">Lifetime value</th>
                <th className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#5F6B3C]">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0e4d8]">
              {list.map((c: any) => (
                <CustomerRow key={c.id} customer={c} onSelect={handleSelectCustomer} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Restaurant Settings Panel
// =============================================================================

function initRestaurantForm(restaurant: any) {
  const toDateInput = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : "");
  return {
    name: restaurant.name ?? "",
    cuisineSummary: restaurant.cuisineSummary ?? "",
    description: restaurant.description ?? "",
    logoUrl: restaurant.logoUrl ?? "",
    primaryColor: restaurant.primaryColor ?? "#B95509",
    deliveryFee: String((restaurant.deliveryFeePaise ?? 0) / 100),
    packagingFee: String((restaurant.packagingFeePaise ?? 0) / 100),
    minOrder: String((restaurant.minOrderPaise ?? 0) / 100),
    deliveryRadiusKm: restaurant.deliveryRadiusKm != null ? String(restaurant.deliveryRadiusKm) : "",
    gstNumber: restaurant.gstNumber ?? "",
    gstPercentage: restaurant.gstPercentage != null ? String(restaurant.gstPercentage) : "",
    tempClosureStart: toDateInput(restaurant.tempClosureStart),
    tempClosureEnd: toDateInput(restaurant.tempClosureEnd),
    tempClosureMessage: restaurant.tempClosureMessage ?? "",
    isOpen: !!restaurant.isOpen,
    allowScheduledOrders: !!restaurant.allowScheduledOrders,
    preparationMinutes: String(restaurant.preparationMinutes ?? 25),
  };
}

function RestaurantPanel({
  restaurant,
  savePending,
  onSave,
}: {
  restaurant: any;
  savePending: boolean;
  onSave: (value: any) => void;
}) {
  const [form, setForm] = useState(() => initRestaurantForm(restaurant));
  const [logoUploading, setLogoUploading] = useState(false);
  const uploadLogo = trpc.admin.uploadBrandImage.useMutation({
    onError: (err) => toast.error(err.message || "Logo upload failed."),
  });

  // Reset the form whenever a different restaurant loads.
  useEffect(() => {
    setForm(initRestaurantForm(restaurant));
  }, [restaurant.id]);

  const handleLogoUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return toast.error("Image must be under 2 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return toast.error("Use a PNG, JPG or WebP image.");
    }
    setLogoUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const result = await uploadLogo.mutateAsync({
        restaurantId: restaurant.id,
        data: dataUrl.split(",")[1] ?? "",
        kind: "logo",
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
      });
      setForm((prev) => ({ ...prev, logoUrl: result.url }));
      toast.success("Logo uploaded — save the form to apply it.");
    } catch {
      toast.error("Could not upload logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  const save = () => {
    const radiusNum = form.deliveryRadiusKm.trim() ? Number(form.deliveryRadiusKm) : NaN;
    if (form.deliveryRadiusKm.trim() && (!Number.isFinite(radiusNum) || radiusNum <= 0))
      return toast.error("Delivery radius must be a number greater than 0.");
    // Guard paise math: blank means 0, but typed garbage must not reach the
    // server as NaN (zod would reject it with a cryptic error).
    const feeEntries = [
      ["Delivery fee", form.deliveryFee],
      ["Packaging fee", form.packagingFee],
      ["Minimum order", form.minOrder],
    ] as const;
    for (const [label, raw] of feeEntries) {
      const n = raw.trim() === "" ? 0 : Number(raw);
      if (!Number.isFinite(n) || n < 0)
        return toast.error(`${label} must be a number, 0 or more.`);
    }
    const prepNum = Number(form.preparationMinutes);
    if (!Number.isFinite(prepNum) || !Number.isInteger(prepNum) || prepNum <= 0)
      return toast.error("Preparation time must be a whole number of minutes greater than 0.");
    onSave({
      id: restaurant.id,
      restaurantId: restaurant.id,
      name: form.name,
      cuisineSummary: form.cuisineSummary,
      description: form.description,
      logoUrl: form.logoUrl.trim() || undefined,
      primaryColor: form.primaryColor,
      deliveryFeePaise: Math.round(Number(form.deliveryFee || 0) * 100),
      packagingFeePaise: Math.round(Number(form.packagingFee || 0) * 100),
      minOrderPaise: Math.round(Number(form.minOrder || 0) * 100),
      deliveryRadiusKm: Number.isFinite(radiusNum) ? radiusNum : undefined,
      gstNumber: form.gstNumber.trim() || undefined,
      gstPercentage: form.gstPercentage.trim() || undefined,
      tempClosureStart: form.tempClosureStart ? new Date(form.tempClosureStart) : null,
      tempClosureEnd: form.tempClosureEnd ? new Date(form.tempClosureEnd) : null,
      tempClosureMessage: form.tempClosureMessage.trim() || null,
      isOpen: form.isOpen,
      allowScheduledOrders: form.allowScheduledOrders,
      preparationMinutes: Number(form.preparationMinutes) || 25,
    });
  };

  return (
    <section className="max-w-3xl rounded-2xl bg-[#fffdf9] p-5 shadow-sm">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5F6B3C]">
        Restaurant identity & service
      </p>
      <h2 className="font-display mt-1 text-2xl">
        How guests meet your kitchen
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Restaurant name">
          <Input
            value={form.name}
            aria-label="Restaurant name"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Cuisine line">
          <Input
            value={form.cuisineSummary}
            aria-label="Cuisine line"
            onChange={(e) =>
              setForm({ ...form, cuisineSummary: e.target.value })
            }
          />
        </Field>
        <Field label="Logo">
          <div className="flex items-center gap-3">
            {form.logoUrl ? (
              <img
                src={form.logoUrl}
                alt="Restaurant logo preview"
                className="h-12 w-12 shrink-0 rounded-xl border border-[#D8DFC0] bg-white object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-dashed border-[#D8DFC0] bg-[#E9EFD6] text-[#5F6B3C]"
              >
                <Store className="h-5 w-5" />
              </span>
            )}
            <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl border border-[#D8DFC0] bg-white px-4 text-sm font-extrabold text-[#3F4C1E] hover:border-[#B95509] hover:text-[#B95509]">
              {logoUploading ? "Uploading…" : "Upload image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Upload restaurant logo"
                className="hidden"
                disabled={logoUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleLogoUpload(file);
                }}
              />
            </label>
          </div>
          <Input
            value={form.logoUrl}
            aria-label="Logo URL"
            inputMode="url"
            placeholder="https://… or upload above"
            className="mt-2"
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          />
          <p className="mt-1 text-xs text-[#8a6954]">PNG, JPG or WebP under 2 MB. Saving the form applies it.</p>
        </Field>
        <Field label="Primary color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(form.primaryColor) ? form.primaryColor : "#B95509"}
              onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              aria-label="Primary color picker"
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[#D8DFC0] bg-white p-1"
            />
            <Input
              value={form.primaryColor}
              aria-label="Primary color hex"
              onChange={(e) =>
                setForm({ ...form, primaryColor: e.target.value })
              }
            />
          </div>
        </Field>
        <Field label="Preparation time (min)">
          <Input
            value={form.preparationMinutes}
            aria-label="Preparation time in minutes"
            inputMode="numeric"
            onChange={(e) =>
              setForm({ ...form, preparationMinutes: e.target.value })
            }
          />
        </Field>
        <Field label="Delivery radius (km)">
          <Input
            value={form.deliveryRadiusKm}
            aria-label="Delivery radius in kilometres"
            inputMode="decimal"
            placeholder="e.g. 5"
            onChange={(e) =>
              setForm({ ...form, deliveryRadiusKm: e.target.value })
            }
          />
        </Field>
        <Field label="Delivery fee (₹)">
          <Input
            value={form.deliveryFee}
            aria-label="Delivery fee in rupees"
            inputMode="numeric"
            onChange={(e) =>
              setForm({ ...form, deliveryFee: e.target.value })
            }
          />
        </Field>
        <Field label="Packaging fee (₹)">
          <Input
            value={form.packagingFee}
            aria-label="Packaging fee in rupees"
            inputMode="numeric"
            onChange={(e) =>
              setForm({ ...form, packagingFee: e.target.value })
            }
          />
        </Field>
        <Field label="Minimum order (₹)">
          <Input
            value={form.minOrder}
            aria-label="Minimum order in rupees"
            inputMode="numeric"
            onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
          />
        </Field>
        <Field label="GST number">
          <Input
            value={form.gstNumber}
            aria-label="GST number"
            placeholder="e.g. 29ABCDE1234F1Z5"
            onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
          />
        </Field>
        <Field label="GST percentage">
          <Input
            value={form.gstPercentage}
            aria-label="GST percentage"
            inputMode="decimal"
            placeholder="e.g. 5"
            onChange={(e) => setForm({ ...form, gstPercentage: e.target.value })}
          />
        </Field>
      </div>
      <label className="mt-4 block text-sm font-extrabold text-[#2A3A0C]">
        Description
        <textarea
          value={form.description}
          aria-label="Restaurant description"
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
          className="mt-2 min-h-24 w-full rounded-xl border border-[#D8DFC0] bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-[#B95509]"
        />
      </label>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Closure starts">
          <Input
            type="date"
            value={form.tempClosureStart}
            aria-label="Temporary closure start date"
            onChange={(e) => setForm({ ...form, tempClosureStart: e.target.value })}
          />
        </Field>
        <Field label="Closure ends">
          <Input
            type="date"
            value={form.tempClosureEnd}
            aria-label="Temporary closure end date"
            onChange={(e) => setForm({ ...form, tempClosureEnd: e.target.value })}
          />
        </Field>
        <Field label="Closure message">
          <Input
            value={form.tempClosureMessage}
            aria-label="Temporary closure message"
            placeholder="e.g. Festival break"
            onChange={(e) => setForm({ ...form, tempClosureMessage: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Toggle
          label="Accept orders"
          checked={form.isOpen}
          onChange={(checked) => setForm({ ...form, isOpen: checked })}
        />
        <Toggle
          label="Allow scheduled orders"
          checked={form.allowScheduledOrders}
          onChange={(checked) =>
            setForm({ ...form, allowScheduledOrders: checked })
          }
        />
      </div>
      <Button
        onClick={save}
        disabled={savePending}
        className="mt-6 h-11 rounded-xl bg-[#B95509] px-5 font-extrabold hover:bg-[#9C4A07]"
      >
        <Save className="mr-2 h-4 w-4" />
        {savePending ? "Saving..." : "Save restaurant"}
      </Button>
    </section>
  );
}

// =============================================================================
// Shared UI Components
// =============================================================================

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-sm font-extrabold text-[#2A3A0C]">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-[#D8DFC0] bg-[#E9EFD6] p-3 text-sm font-extrabold text-[#2A3A0C]">
      {label}
      <input
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="h-4 w-4 accent-[#B95509]"
      />
    </label>
  );
}

function InvoiceButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, error } = trpc.admin.generateInvoice.useQuery(
    { orderId },
    { enabled: open, retry: false }
  );

  const handlePrint = () => {
    setOpen(true);
  };

  useEffect(() => {
    if (isError) {
      toast.error(error?.message || "Could not load the invoice.");
      setOpen(false);
    }
  }, [isError, error]);

  useEffect(() => {
    if (data?.html && open) {
      const win = window.open("", "_blank", "width=800,height=600");
      if (win) {
        win.document.write(data.html);
        win.document.close();
        win.focus();
      }
      setOpen(false);
    }
  }, [data, open]);

  return (
    <button
      onClick={handlePrint}
      disabled={isLoading}
      aria-label="Print invoice"
      className="rounded-lg border border-[#D8DFC0] bg-white px-2 py-1.5 text-[10px] font-bold text-[#B95509] hover:bg-[#fdf5ef] disabled:opacity-50"
    >
      {isLoading ? "Loading..." : "Invoice"}
    </button>
  );
}

function EmptyKitchen() {
  return (
    <div className="rounded-xl border border-dashed border-[#D8DFC0] bg-[#E9EFD6] p-5 text-center">
      <CookingPot className="mx-auto h-6 w-6 text-[#B95509]" />
      <p className="mt-3 text-sm font-extrabold text-[#2A3A0C]">
        The counter is clear for now
      </p>
      <p className="mt-1 text-xs text-[#5F6B3C]">
        New customer orders will appear here as soon as they're placed.
      </p>
    </div>
  );
}

function AdminLoading() {
  return (
    <main className="min-h-screen bg-[#f7f2eb] p-8">
      <div className="mx-auto max-w-7xl animate-pulse space-y-5">
        <div className="h-20 rounded-2xl bg-[#E9EFD6]" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((key) => (
            <div key={key} className="h-40 rounded-2xl bg-[#E9EFD6]" />
          ))}
        </div>
        <div className="h-80 rounded-2xl bg-[#E9EFD6]" />
      </div>
    </main>
  );
}
