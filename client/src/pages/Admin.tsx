/**
 * Cloud Kitchen Admin Panel — polished operations dashboard.
 * Includes: overview, order management, menu management, restaurant settings,
 * customer management, and integration settings.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  BarChart3, CheckCircle2, ClipboardList, Clock3, CookingPot,
  ExternalLink, FileUp, LockKeyhole, Plus, Save, Store,
  TicketPercent, UtensilsCrossed, X, Users, TrendingUp,
  Package, AlertCircle, RefreshCw, Search,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import IntegrationPanel from "@/components/IntegrationPanel";
import MenuImportPanel from "@/components/MenuImportPanel";

const money = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

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

export default function Admin() {
  const { user, loading } = useAuth();
  const [location] = useLocation();
  const section = location.split("/")[2] ?? "overview";

  if (loading)
    return <div className="min-h-screen bg-[#f7f2eb]" />;
  if (!user || user.role !== "admin") return <AdminAccess />;

  return (
    <DashboardLayout>
      {section === "import" ? (
        <MenuImportWorkspace />
      ) : (
        <AdminWorkspace section={section} />
      )}
    </DashboardLayout>
  );
}

// =============================================================================
// Admin Access / Login
// =============================================================================

function AdminAccess() {
  const [token, setToken] = useState("");
  const [accessError, setAccessError] = useState("");
  const localAccess = trpc.auth.localAdminEnabled.useQuery();
  const localLogin = trpc.auth.localAdminLogin.useMutation({
    onSuccess: () => window.location.reload(),
    onError: () => {
      setAccessError("Sign-in was not accepted. Paste only the administrator passphrase.");
      toast.error("Sign-in was not accepted.");
    },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f2eb] p-5">
      <section className="max-w-md rounded-[2rem] bg-white p-8 text-center shadow-xl shadow-[#5f3b24]/10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f9e6d9] text-[#c84630]">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <h1 className="font-display mt-5 text-3xl text-[#35251b]">
          Operations access only
        </h1>
        {localAccess.data ? (
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
                className="mt-2 h-11 rounded-xl border-[#ddc6b5]"
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
              className="mt-3 h-11 w-full rounded-xl bg-[#c84630] font-extrabold hover:bg-[#ad3627]"
            >
              {localLogin.isPending ? "Checking access..." : "Open operations"}
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-[#816252]">
            Sign in with the project owner account to access the admin panel.
          </p>
        )}
      </section>
    </main>
  );
}

// =============================================================================
// Menu Import Workspace
// =============================================================================

function MenuImportWorkspace() {
  const dashboard = trpc.admin.dashboard.useQuery({ slug: "spice-garden" });
  if (dashboard.isLoading) return <AdminLoading />;
  if (dashboard.isError || !dashboard.data)
    return (
      <main className="grid min-h-[70vh] place-items-center">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          We couldn't load restaurant configuration for this import.
        </p>
      </main>
    );

  return (
    <div className="min-h-screen bg-[#f7f2eb] p-5 text-[#34251d] lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f7e4d3] text-[#c84630]">
            <FileUp className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9e765e]">
              {dashboard.data.restaurant.name} · menu studio
            </p>
            <h1 className="font-display text-3xl">Import your live menu</h1>
          </div>
        </div>
        <MenuImportPanel restaurantId={dashboard.data.restaurant.id} />
      </div>
    </div>
  );
}

// =============================================================================
// Main Admin Workspace
// =============================================================================

function AdminWorkspace({ section }: { section: string }) {
  const utils = trpc.useUtils();
  const dashboard = trpc.admin.dashboard.useQuery({ slug: "spice-garden" });
  const [itemForm, setItemForm] = useState({
    name: "",
    price: "",
    categoryId: "",
    dietaryType: "veg" as "veg" | "nonveg" | "egg",
  });
  const [couponForm, setCouponForm] = useState({
    code: "",
    description: "",
    discount: "",
    discountType: "flat" as "flat" | "percent",
    minOrder: "",
  });

  const updateOrder = trpc.admin.updateOrderStatus.useMutation({
    onSuccess: () => utils.admin.dashboard.invalidate(),
  });
  const updateAvailability = trpc.admin.updateMenuAvailability.useMutation({
    onSuccess: () => utils.admin.dashboard.invalidate(),
  });
  const createItem = trpc.admin.createMenuItem.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      setItemForm({ name: "", price: "", categoryId: "", dietaryType: "veg" });
      toast.success("Menu item added");
    },
  });
  const createCoupon = trpc.admin.upsertCoupon.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      setCouponForm({ code: "", description: "", discount: "", discountType: "flat", minOrder: "" });
      toast.success("Coupon is live");
    },
  });
  const updateSettings = trpc.admin.updateSettings.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      toast.success("Restaurant settings saved");
    },
  });
  const toggleItem = trpc.admin.toggleItemOpen.useMutation({
    onSuccess: () => utils.admin.dashboard.invalidate(),
  });

  if (dashboard.isLoading) return <AdminLoading />;
  if (dashboard.isError || !dashboard.data)
    return (
      <main className="grid min-h-[70vh] place-items-center">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          We couldn't load the restaurant workspace. Please retry.
        </p>
      </main>
    );

  const data = dashboard.data;
  const defaultCategoryId = data.categories[0]?.id ?? "";

  const createMenu = () => {
    if (!itemForm.name || !itemForm.price)
      return toast.error("Add an item name and price first.");
    createItem.mutate({
      restaurantId: data.restaurant.id,
      categoryId: itemForm.categoryId || defaultCategoryId,
      name: itemForm.name,
      pricePaise: Math.round(Number(itemForm.price) * 100),
      dietaryType: itemForm.dietaryType,
    });
  };

  const saveCoupon = () => {
    if (!couponForm.code || !couponForm.description || !couponForm.discount)
      return toast.error("Complete the coupon details first.");
    createCoupon.mutate({
      restaurantId: data.restaurant.id,
      code: couponForm.code,
      description: couponForm.description,
      discountType: couponForm.discountType,
      discountValue: Math.round(Number(couponForm.discount) * 100),
      minOrderPaise: Math.round(Number(couponForm.minOrder || 0) * 100),
    });
  };

  return (
    <div className="min-h-screen bg-[#f7f2eb] text-[#34251d]">
      <header className="border-b border-[#e4d5c8] bg-[#fffdf9] px-5 py-5 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9e765e]">
              Kitchen desk · {data.restaurant.name}
            </p>
            <h1 className="font-display mt-1 text-3xl">
              {section === "overview"
                ? "Today at a glance"
                : section === "orders"
                ? "Order queue"
                : section === "menu"
                ? "Menu studio"
                : section === "coupons"
                ? "Offers desk"
                : section === "customers"
                ? "Customer directory"
                : section === "integrations"
                ? "Integration settings"
                : "Restaurant settings"}
            </h1>
          </div>
          <Button
            onClick={() => window.open("/", "_blank")}
            variant="outline"
            className="rounded-xl border-[#d8bda7] bg-white text-xs font-extrabold text-[#704d37]"
          >
            View storefront <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-5 lg:p-8">
        {section === "orders" ? (
          <OrdersPanel
            data={data}
            onStatus={(orderId, nextStatus, note) =>
              updateOrder.mutate({ orderId, status: nextStatus as never, note })
            }
            busy={updateOrder.isPending}
          />
        ) : section === "menu" ? (
          <MenuPanel
            data={data}
            itemForm={itemForm}
            setItemForm={setItemForm}
            onCreate={createMenu}
            onAvailability={(itemId, availability) =>
              updateAvailability.mutate({
                itemId,
                availability: availability as never,
              })
            }
            onToggle={(itemId, isOpen) =>
              toggleItem.mutate({ itemId, isOpen })
            }
          />
        ) : section === "coupons" ? (
          <CouponsPanel
            data={data}
            form={couponForm}
            setForm={setCouponForm}
            onSave={saveCoupon}
          />
        ) : section === "customers" ? (
          <CustomersPanel />
        ) : section === "restaurant" ? (
          <RestaurantPanel
            restaurant={data.restaurant}
            onSave={(next) => updateSettings.mutate(next)}
          />
        ) : section === "integrations" ? (
          <IntegrationPanel />
        ) : (
          <OverviewPanel data={data} />
        )}
      </main>
    </div>
  );
}

// =============================================================================
// Overview Panel
// =============================================================================

function OverviewPanel({ data }: { data: any }) {
  const m = data.metrics;
  const cards = [
    {
      label: "Today's orders",
      value: m.todayOrders,
      detail: "Orders placed today",
      icon: ClipboardList,
      tone: "bg-[#f7e4d3] text-[#c84630]",
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
      value: `${m.availableItems}/${m.totalItems}`,
      detail: "Shown to customers",
      icon: UtensilsCrossed,
      tone: "bg-[#f5ecd8] text-[#9e692a]",
    },
  ];

  const statusCards = [
    {
      label: "Pending",
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
            <p className="mt-2 text-xs text-[#9b7a66]">{card.detail}</p>
          </article>
        ))}
      </section>

      {/* Status Summary */}
      <section className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9e765e]">
          Order pipeline
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {statusCards.map((card) => (
            <div
              key={card.label}
              className="flex items-center gap-3 rounded-xl border border-[#eadccf] bg-[#fffaf5] p-3"
            >
              <card.icon className={`h-5 w-5 ${card.color}`} />
              <div>
                <p className="text-lg font-extrabold">{card.value}</p>
                <p className="text-xs text-[#8e6d59]">{card.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Orders */}
      <section className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9e765e]">
              Recent orders
            </p>
            <h2 className="font-display mt-1 text-2xl">
              Latest activity
            </h2>
          </div>
          <span className="rounded-full bg-[#f7e4d3] px-3 py-1 text-xs font-extrabold text-[#a64130]">
            {m.openOrders} open
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {(data.orders ?? []).slice(0, 8).map((order: any) => (
            <div
              key={order.id}
              className="flex items-center justify-between rounded-xl border border-[#eadccf] bg-[#fffaf5] p-3"
            >
              <div>
                <p className="text-sm font-extrabold">{order.orderNumber}</p>
                <p className="mt-1 text-xs text-[#8e6d59]">
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
          ))}
        </div>
      </section>

      {/* Restaurant Status Card */}
      <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <article className="rounded-2xl bg-[#38271f] p-6 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${
                data.restaurant.isOpen ? "bg-green-400" : "bg-red-400"
              }`}
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
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9e765e]">
            Quick actions
          </p>
          <h2 className="font-display mt-1 text-2xl">Kitchen controls</h2>
          <div className="mt-5 space-y-3">
            <button
              onClick={() => window.location.assign("/admin/orders")}
              className="flex w-full items-center gap-3 rounded-xl border border-[#eadccf] bg-[#fffaf5] p-3 text-left hover:bg-[#f8ecdf]"
            >
              <ClipboardList className="h-5 w-5 text-[#c84630]" />
              <div>
                <p className="text-sm font-bold">Manage orders</p>
                <p className="text-xs text-[#8e6d59]">
                  View and update order status
                </p>
              </div>
            </button>
            <button
              onClick={() => window.location.assign("/admin/menu")}
              className="flex w-full items-center gap-3 rounded-xl border border-[#eadccf] bg-[#fffaf5] p-3 text-left hover:bg-[#f8ecdf]"
            >
              <UtensilsCrossed className="h-5 w-5 text-[#c84630]" />
              <div>
                <p className="text-sm font-bold">Menu studio</p>
                <p className="text-xs text-[#8e6d59]">
                  Add dishes and manage availability
                </p>
              </div>
            </button>
            <button
              onClick={() => window.location.assign("/admin/integrations")}
              className="flex w-full items-center gap-3 rounded-xl border border-[#eadccf] bg-[#fffaf5] p-3 text-left hover:bg-[#f8ecdf]"
            >
              <AlertCircle className="h-5 w-5 text-[#c84630]" />
              <div>
                <p className="text-sm font-bold">Integrations</p>
                <p className="text-xs text-[#8e6d59]">
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
// Orders Panel
// =============================================================================

function OrdersPanel({
  data,
  onStatus,
  busy,
}: {
  data: any;
  onStatus: (id: string, status: string, note?: string) => void;
  busy: boolean;
}) {
  const [filter, setFilter] = useState<string>("all");

  const activeStatuses = [
    "PLACED",
    "RESTAURANT_ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "DELIVERY_REQUESTED",
    "RIDER_ASSIGNED",
    "PICKED_UP",
    "OUT_FOR_DELIVERY",
  ];

  const filtered =
    filter === "all"
      ? (data.orders ?? [])
      : filter === "active"
      ? (data.orders ?? []).filter((o: any) => activeStatuses.includes(o.status))
      : (data.orders ?? []).filter((o: any) => o.status === filter);

  return (
    <section className="overflow-hidden rounded-2xl bg-[#fffdf9] shadow-sm">
      <div className="border-b border-[#eadccf] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9e765e]">
              Live operations
            </p>
            <h2 className="font-display mt-1 text-2xl">Order queue</h2>
          </div>
          <span className="text-sm font-bold text-[#856652]">
            {filtered.length} orders
          </span>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto hide-scrollbar">
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
              onClick={() => setFilter(value)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-extrabold ${
                filter === value
                  ? "bg-[#382719] text-white"
                  : "border border-[#ddc6b5] bg-white text-[#704d37]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div className="overflow-x-auto">
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
                <tr key={order.id} className="border-t border-[#f0e4d9]">
                  <td className="px-5 py-4">
                    <p className="font-extrabold">{order.orderNumber}</p>
                    <p className="mt-1 text-xs text-[#8c6d58]">
                      {new Date(order.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold">{order.customerName || "Guest"}</p>
                    <p className="text-xs text-[#8c6d58]">{order.customerPhone || "-"}</p>
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
                      {statusLabel[order.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <select
                      disabled={busy}
                      value={order.status}
                      onChange={(e) => onStatus(order.id, e.target.value)}
                      className="rounded-lg border border-[#ddc6b5] bg-white px-2 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[#c84630]"
                    >
                      <option value="PLACED">New order</option>
                      <option value="RESTAURANT_ACCEPTED">Accept</option>
                      <option value="PREPARING">Preparing</option>
                      <option value="READY_FOR_PICKUP">Ready</option>
                      <option value="DELIVERY_REQUESTED">Request delivery</option>
                      <option value="OUT_FOR_DELIVERY">Out for delivery</option>
                      <option value="DELIVERED">Delivered</option>
                      <option value="REJECTED">Reject</option>
                      <option value="CANCELLED">Cancel</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function MenuPanel({
  data,
  itemForm,
  setItemForm,
  onCreate,
  onAvailability,
  onToggle,
}: {
  data: any;
  itemForm: any;
  setItemForm: (f: any) => void;
  onCreate: () => void;
  onAvailability: (id: string, status: string) => void;
  onToggle: (id: string, isOpen: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const items = (data.items ?? []).filter((item: any) =>
    search ? item.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
      {/* Add Item Form */}
      <aside className="rounded-2xl bg-[#38271f] p-5 text-white shadow-sm">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e7b99d]">
          Add a dish
        </p>
        <h2 className="font-display mt-2 text-3xl">Make the menu yours</h2>
        <div className="mt-6 space-y-3">
          <Input
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            placeholder="Dish name"
            className="h-11 border-white/20 bg-white/10 text-white placeholder:text-white/50"
          />
          <Input
            value={itemForm.price}
            onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
            inputMode="numeric"
            placeholder="Price in ₹"
            className="h-11 border-white/20 bg-white/10 text-white placeholder:text-white/50"
          />
          <select
            value={itemForm.categoryId}
            onChange={(e) =>
              setItemForm({ ...itemForm, categoryId: e.target.value })
            }
            className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-bold text-white"
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
          <select
            value={itemForm.dietaryType}
            onChange={(e) =>
              setItemForm({
                ...itemForm,
                dietaryType: e.target.value as "veg" | "nonveg" | "egg",
              })
            }
            className="h-11 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-bold text-white"
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
            className="h-11 w-full rounded-xl bg-[#f7e4d3] font-extrabold text-[#40291c] hover:bg-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add to menu
          </Button>
        </div>
      </aside>

      {/* Menu Items List */}
      <section className="overflow-hidden rounded-2xl bg-[#fffdf9] shadow-sm">
        <div className="border-b border-[#eadccf] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9e765e]">
                Live menu
              </p>
              <h2 className="font-display mt-1 text-2xl">Availability controls</h2>
            </div>
            <span className="text-sm font-bold text-[#856652]">
              {(data.items ?? []).length} dishes
            </span>
          </div>
          <div className="mt-3 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a37d64]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu items..."
              className="h-10 rounded-xl border-[#e8d6c5] pl-9 text-sm"
            />
          </div>
        </div>
        <div className="divide-y divide-[#f0e4d9]">
          {items.map((item: any) => (
            <article key={item.id} className="flex items-center gap-4 p-4">
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${
                  item.dietaryType === "veg"
                    ? "bg-green-50 text-green-700"
                    : item.dietaryType === "egg"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {item.dietaryType === "veg"
                  ? "V"
                  : item.dietaryType === "egg"
                  ? "E"
                  : "NV"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-extrabold">{item.name}</p>
                  {item.isBestseller && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-700">
                      BESTSELLER
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-[#8b6b57]">
                  {item.description}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs font-bold">
                  <span>{money(item.pricePaise)}</span>
                  {item.offerPricePaise && (
                    <span className="text-green-600">
                      Offer: {money(item.offerPricePaise)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={item.isOpen}
                    onChange={(e) => onToggle(item.id, e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#c84630] after:peer-checked:translate-x-full" />
                </label>
                <select
                  value={item.availability}
                  onChange={(e) => onAvailability(item.id, e.target.value)}
                  className="rounded-lg border border-[#ddc6b5] bg-white px-2 py-2 text-xs font-extrabold"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="SOLD_OUT">Sold out</option>
                  <option value="SCHEDULED_UNAVAILABLE">Later</option>
                  <option value="OUT_OF_STOCK">Out of stock</option>
                  <option value="DISABLED">Hidden</option>
                </select>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
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
}: {
  data: any;
  form: any;
  setForm: (f: any) => void;
  onSave: () => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9e765e]">
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
            className="h-11 rounded-xl border-[#ddc6b5] font-extrabold"
          />
          <Input
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="Offer description"
            className="h-11 rounded-xl border-[#ddc6b5]"
          />
          <div className="flex gap-2">
            <select
              value={form.discountType}
              onChange={(e) =>
                setForm({ ...form, discountType: e.target.value })
              }
              className="h-11 rounded-xl border border-[#ddc6b5] bg-white px-3 text-sm font-bold"
            >
              <option value="flat">Flat (₹)</option>
              <option value="percent">Percentage (%)</option>
            </select>
            <Input
              value={form.discount}
              onChange={(e) => setForm({ ...form, discount: e.target.value })}
              inputMode="numeric"
              placeholder={form.discountType === "flat" ? "₹ off" : "% off"}
              className="h-11 rounded-xl border-[#ddc6b5]"
            />
          </div>
          <Input
            value={form.minOrder}
            onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
            inputMode="numeric"
            placeholder="Minimum order in ₹"
            className="h-11 rounded-xl border-[#ddc6b5]"
          />
          <Button
            onClick={onSave}
            className="h-11 w-full rounded-xl bg-[#c84630] font-extrabold hover:bg-[#ad3627]"
          >
            <TicketPercent className="mr-2 h-4 w-4" />
            Save offer
          </Button>
        </div>
      </section>

      <section className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9e765e]">
          Live offers
        </p>
        <h2 className="font-display mt-1 text-2xl">On the counter now</h2>
        <div className="mt-5 space-y-3">
          {(data.offers ?? []).length ? (
            (data.offers ?? []).map((coupon: any) => (
              <article
                key={coupon.id}
                className="rounded-xl border border-[#eadccf] bg-[#fff9f3] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold tracking-wide text-[#c84630]">
                      {coupon.code}
                    </p>
                    <p className="mt-1 text-sm text-[#71513e]">
                      {coupon.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#e5f1e5] px-2.5 py-1 text-xs font-extrabold text-[#42774b]">
                    Live
                  </span>
                </div>
                <p className="mt-3 text-xs font-bold text-[#906f5a]">
                  {coupon.discountType === "flat"
                    ? `₹${coupon.discountValue / 100} off`
                    : `${coupon.discountValue}% off`}{" "}
                  · Min {money(coupon.minOrderPaise)}
                </p>
              </article>
            ))
          ) : (
            <EmptyKitchen />
          )}
        </div>
      </section>
    </div>
  );
}

// =============================================================================
// Customers Panel
// =============================================================================

function CustomersPanel() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const customers = trpc.admin.customers.useQuery({ search: search || undefined, limit: 50 });
  const customerDetail = trpc.admin.customerDetail.useQuery(
    { customerId: selectedId! },
    { enabled: !!selectedId }
  );
  const updateNotes = trpc.admin.updateCustomerNotes.useMutation({
    onSuccess: () => {
      toast.success("Notes saved");
      customerDetail.refetch();
    },
  });

  const list = customers.data ?? [];
  const detail = customerDetail.data;

  if (selectedId && detail) {
    return (
      <div className="space-y-5">
        <button
          onClick={() => { setSelectedId(null); setNotes(""); }}
          className="flex items-center gap-2 text-sm font-extrabold text-[#c84630] hover:underline"
        >
          ← Back to customers
        </button>
        <div className="rounded-2xl border border-[#eadccf] bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-display text-2xl text-[#382719]">
                {detail.userName || detail.preferredName || "Guest Customer"}
              </h3>
              <p className="mt-1 text-sm text-[#91725e]">
                {detail.mobileNumber ?? "No phone"} · {detail.userEmail ?? "No email"}
              </p>
            </div>
            <span className="rounded-full bg-[#f0e4d8] px-3 py-1 text-[10px] font-extrabold text-[#a77d63]">
              {detail.totalOrders ?? 0} orders
            </span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-[#fff9f3] p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Lifetime value</p>
              <p className="mt-1 text-xl font-extrabold text-[#382719]">₹{((detail.totalSpentPaise ?? 0) / 100).toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-xl bg-[#fff9f3] p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Total orders</p>
              <p className="mt-1 text-xl font-extrabold text-[#382719]">{detail.totalOrders ?? 0}</p>
            </div>
            <div className="rounded-xl bg-[#fff9f3] p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Registered</p>
              <p className="mt-1 text-sm font-bold text-[#382719]">
                {detail.createdAt ? new Date(detail.createdAt).toLocaleDateString("en-IN") : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Admin Notes */}
        <div className="rounded-2xl border border-[#eadccf] bg-white p-6 shadow-sm">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Admin notes</p>
          <textarea
            value={notes || detail.adminNotes || ""}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add private notes about this customer..."
            className="mt-3 min-h-20 w-full rounded-xl border border-[#ddc6b5] bg-[#fff9f3] p-3 text-sm outline-none focus:ring-2 focus:ring-[#c84630]"
          />
          <Button
            onClick={() => updateNotes.mutate({ customerId: selectedId, notes })}
            disabled={updateNotes.isPending}
            className="mt-3 h-10 rounded-xl bg-[#c84630] px-4 text-xs font-extrabold hover:bg-[#ad3627]"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" /> Save notes
          </Button>
        </div>

        {/* Order History */}
        <div className="rounded-2xl border border-[#eadccf] bg-white shadow-sm">
          <div className="border-b border-[#eadccf] px-6 py-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Order history</p>
          </div>
          {detail.orderHistory?.length ? (
            <div className="divide-y divide-[#f0e4d8]">
              {detail.orderHistory.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm font-bold text-[#382719]">{order.orderNumber}</p>
                    <p className="mt-0.5 text-xs text-[#91725e]">
                      {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-[#382719]">₹{((order.totalPaise ?? 0) / 100).toLocaleString("en-IN")}</p>
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
            <p className="px-6 py-8 text-center text-sm text-[#91725e]">No orders yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a77d63]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="h-11 w-full rounded-xl border border-[#ddc6b5] bg-white pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#c84630]"
          />
        </div>
      </div>

      {customers.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[#eadfd4]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#dbc3b0] bg-[#fff9f3] p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-[#c84630]" />
          <p className="mt-3 font-display text-xl text-[#593f2d]">No customers yet</p>
          <p className="mt-1 text-sm text-[#91725e]">Customers will appear here once they place their first order.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#eadccf] bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#eadccf] bg-[#faf5ef]">
                <th className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Customer</th>
                <th className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Phone</th>
                <th className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Orders</th>
                <th className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Lifetime value</th>
                <th className="px-5 py-3 text-left text-[10px] font-extrabold uppercase tracking-wider text-[#a77d63]">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0e4d8]">
              {list.map((c: any) => (
                <tr
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    setNotes("");
                  }}
                  className="cursor-pointer hover:bg-[#fff9f3] transition-colors"
                >
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold text-[#382719]">{c.userName || c.preferredName || "Guest"}</p>
                    <p className="mt-0.5 text-xs text-[#91725e]">{c.userEmail ?? "—"}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-[#553d2c]">{c.mobileNumber ?? "—"}</td>
                  <td className="px-5 py-4 text-sm font-bold text-[#382719]">{c.totalOrders ?? 0}</td>
                  <td className="px-5 py-4 text-sm font-extrabold text-[#382719]">₹{((c.totalSpentPaise ?? 0) / 100).toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-xs text-[#91725e]">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "—"}
                  </td>
                </tr>
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

function RestaurantPanel({
  restaurant,
  onSave,
}: {
  restaurant: any;
  onSave: (value: any) => void;
}) {
  const [form, setForm] = useState({
    name: restaurant.name,
    cuisineSummary: restaurant.cuisineSummary,
    description: restaurant.description ?? "",
    primaryColor: restaurant.primaryColor,
    deliveryFee: String(restaurant.deliveryFeePaise / 100),
    packagingFee: String(restaurant.packagingFeePaise / 100),
    minOrder: String(restaurant.minOrderPaise / 100),
    isOpen: restaurant.isOpen,
    allowScheduledOrders: restaurant.allowScheduledOrders,
    preparationMinutes: String(restaurant.preparationMinutes ?? 25),
  });

  const save = () =>
    onSave({
      id: restaurant.id,
      name: form.name,
      cuisineSummary: form.cuisineSummary,
      description: form.description,
      primaryColor: form.primaryColor,
      deliveryFeePaise: Math.round(Number(form.deliveryFee) * 100),
      packagingFeePaise: Math.round(Number(form.packagingFee) * 100),
      minOrderPaise: Math.round(Number(form.minOrder) * 100),
      isOpen: form.isOpen,
      allowScheduledOrders: form.allowScheduledOrders,
      preparationMinutes: Number(form.preparationMinutes) || 25,
    });

  return (
    <section className="max-w-3xl rounded-2xl bg-[#fffdf9] p-5 shadow-sm">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9e765e]">
        Restaurant identity & service
      </p>
      <h2 className="font-display mt-1 text-2xl">
        How guests meet your kitchen
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Restaurant name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Cuisine line">
          <Input
            value={form.cuisineSummary}
            onChange={(e) =>
              setForm({ ...form, cuisineSummary: e.target.value })
            }
          />
        </Field>
        <Field label="Primary color">
          <Input
            value={form.primaryColor}
            onChange={(e) =>
              setForm({ ...form, primaryColor: e.target.value })
            }
          />
        </Field>
        <Field label="Preparation time (min)">
          <Input
            value={form.preparationMinutes}
            inputMode="numeric"
            onChange={(e) =>
              setForm({ ...form, preparationMinutes: e.target.value })
            }
          />
        </Field>
        <Field label="Delivery fee (₹)">
          <Input
            value={form.deliveryFee}
            inputMode="numeric"
            onChange={(e) =>
              setForm({ ...form, deliveryFee: e.target.value })
            }
          />
        </Field>
        <Field label="Packaging fee (₹)">
          <Input
            value={form.packagingFee}
            inputMode="numeric"
            onChange={(e) =>
              setForm({ ...form, packagingFee: e.target.value })
            }
          />
        </Field>
        <Field label="Minimum order (₹)">
          <Input
            value={form.minOrder}
            inputMode="numeric"
            onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
          />
        </Field>
      </div>
      <label className="mt-4 block text-sm font-extrabold text-[#553d2c]">
        Description
        <textarea
          value={form.description}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
          className="mt-2 min-h-24 w-full rounded-xl border border-[#ddc6b5] bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-[#c84630]"
        />
      </label>
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
        className="mt-6 h-11 rounded-xl bg-[#c84630] px-5 font-extrabold hover:bg-[#ad3627]"
      >
        <Save className="mr-2 h-4 w-4" />
        Save restaurant
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
    <label className="text-sm font-extrabold text-[#553d2c]">
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
    <label className="flex items-center justify-between rounded-xl border border-[#eadccf] bg-[#fff9f3] p-3 text-sm font-extrabold text-[#553d2c]">
      {label}
      <input
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
        className="h-4 w-4 accent-[#c84630]"
      />
    </label>
  );
}

function EmptyKitchen() {
  return (
    <div className="rounded-xl border border-dashed border-[#dbc3b0] bg-[#fff9f3] p-5 text-center">
      <CookingPot className="mx-auto h-6 w-6 text-[#c84630]" />
      <p className="mt-3 text-sm font-extrabold text-[#593f2d]">
        The counter is clear for now
      </p>
      <p className="mt-1 text-xs text-[#91725e]">
        New customer orders will appear here as soon as they're placed.
      </p>
    </div>
  );
}

function AdminLoading() {
  return (
    <main className="min-h-screen bg-[#f7f2eb] p-8">
      <div className="mx-auto max-w-7xl animate-pulse space-y-5">
        <div className="h-20 rounded-2xl bg-[#eadfd4]" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((key) => (
            <div key={key} className="h-40 rounded-2xl bg-[#eadfd4]" />
          ))}
        </div>
        <div className="h-80 rounded-2xl bg-[#eadfd4]" />
      </div>
    </main>
  );
}
