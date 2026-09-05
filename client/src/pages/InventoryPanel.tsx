import { useState } from "react";
import { AlertTriangle, Box, LoaderCircle, Package, Plus, ShoppingCart, Truck, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminError } from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";

type Tab = "materials" | "recipes" | "suppliers" | "purchase-orders";

export default function InventoryPanel({ restaurantId }: { restaurantId: string }) {
  const [tab, setTab] = useState<Tab>("materials");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#2A3A0C]" style={{ fontFamily: "var(--font-display)" }}>Inventory & Recipes</h2>
        <p className="text-sm text-[#3F4C1E] mt-1">Track raw materials, link ingredients to menu items, manage suppliers and purchase orders.</p>
      </div>

      <div className="flex gap-1 border-b border-[#D8DFC0] pb-0 overflow-x-auto">
        {([
          { id: "materials", label: "Materials", icon: Box },
          { id: "recipes", label: "Recipes", icon: UtensilsCrossed },
          { id: "suppliers", label: "Suppliers", icon: Truck },
          { id: "purchase-orders", label: "Purchase Orders", icon: ShoppingCart },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 whitespace-nowrap items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-[#2A3A0C] text-[#2A3A0C]"
                : "border-transparent text-[#3F4C1E] hover:text-[#2A3A0C]"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "materials" && <MaterialsTab restaurantId={restaurantId} />}
      {tab === "recipes" && <RecipesTab restaurantId={restaurantId} />}
      {tab === "suppliers" && <SuppliersTab restaurantId={restaurantId} />}
      {tab === "purchase-orders" && <PurchaseOrdersTab restaurantId={restaurantId} />}
    </div>
  );
}

// =============================================================================
// Materials Tab
// =============================================================================

function MaterialsTab({ restaurantId }: { restaurantId: string }) {
  const utils = trpc.useUtils();
  const materials = trpc.inventory.listMaterials.useQuery({ restaurantId });
  const lowStock = trpc.inventory.getLowStockAlerts.useQuery({ restaurantId });
  const createMaterial = trpc.inventory.createMaterial.useMutation({
    onSuccess: () => {
      toast.success("Material created");
      utils.inventory.listMaterials.invalidate({ restaurantId });
      setShowForm(false);
      setForm({ name: "", unit: "kg", minStock: "", costPerUnit: "", category: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "kg", minStock: "", costPerUnit: "", category: "" });

  const alerts = lowStock.data ?? [];
  const list = materials.data ?? [];

  if (materials.isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading materials">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-[#E9EFD6]" />
        ))}
      </div>
    );
  }

  if (materials.isError) {
    return (
      <AdminError
        message="We couldn't load materials. Please retry."
        onRetry={() => materials.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 text-sm">{alerts.length} item{alerts.length > 1 ? "s" : ""} below minimum stock</p>
            <p className="text-xs text-red-600 mt-1">{alerts.map(a => `${a.name} (${a.currentStock}/${a.minStock} ${a.unit})`).join(", ")}</p>
          </div>
        </div>
      )}

      {!showForm ? (
        <Button onClick={() => setShowForm(true)} className="bg-[#2A3A0C] hover:bg-[#2A3A0C] text-white gap-2">
          <Plus className="w-4 h-4" /> Add Material
        </Button>
      ) : (
        <div className="bg-white rounded-xl border border-[#D8DFC0] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Chicken Breast" />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                <option value="kg">kg</option>
                <option value="ltr">ltr</option>
                <option value="pcs">pcs</option>
                <option value="unit">unit</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Min Stock</Label>
              <Input type="number" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Cost/Unit (₹)</Label>
              <Input type="number" value={form.costPerUnit} onChange={e => setForm({ ...form, costPerUnit: e.target.value })} placeholder="0" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => {
              const name = form.name.trim();
              if (!name) { toast.error("Name is required"); return; }
              let minStock: number | undefined;
              if (form.minStock) {
                minStock = parseFloat(form.minStock);
                if (!Number.isFinite(minStock) || minStock < 0) { toast.error("Min stock must be 0 or more."); return; }
              }
              let costPerUnitPaise: number | undefined;
              if (form.costPerUnit) {
                const cost = parseFloat(form.costPerUnit);
                if (!Number.isFinite(cost) || cost < 0) { toast.error("Cost must be 0 or more."); return; }
                costPerUnitPaise = Math.round(cost * 100);
              }
              createMaterial.mutate({
                restaurantId,
                name,
                unit: form.unit,
                minStock,
                costPerUnitPaise,
                category: form.category.trim() || undefined,
              });
            }} disabled={createMaterial.isPending} className="bg-[#2A3A0C] hover:bg-[#2A3A0C] text-white">
              {createMaterial.isPending ? <LoaderCircle className="w-4 h-4 animate-spin mr-1" /> : null} Save
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#D8DFC0] overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[#f7f2eb] text-left">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Material</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Stock</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Min</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Cost/Unit</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Category</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[#9AA07E]">No materials added yet</td></tr>
            ) : list.map(m => {
              const rawStock = parseFloat(String(m.currentStock));
              const rawMin = parseFloat(String(m.minStock));
              const stock = Number.isFinite(rawStock) ? rawStock : 0;
              const min = Number.isFinite(rawMin) ? rawMin : 0;
              const isLow = stock <= min;
              const cost = Number.isFinite(m.costPerUnitPaise) ? m.costPerUnitPaise : 0;
              return (
                <tr key={m.id} className="border-t border-[#f0e8de]">
                  <td className="px-4 py-2.5 font-medium">{m.name}</td>
                  <td className={`px-4 py-2.5 ${isLow ? "text-red-600 font-bold" : ""}`}>{stock} {m.unit}</td>
                  <td className="px-4 py-2.5 text-[#3F4C1E]">{min} {m.unit}</td>
                  <td className="px-4 py-2.5">₹{(cost / 100).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-[#3F4C1E]">{m.category ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Recipes Tab
// =============================================================================

function RecipesTab({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="text-center py-12 text-[#9AA07E]">
      <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 opacity-40" />
      <p className="font-medium">Recipe Builder</p>
      <p className="text-sm mt-1">Link menu items to raw material ingredients. Select a menu item from the Menu panel to configure its recipe.</p>
    </div>
  );
}

// =============================================================================
// Suppliers Tab
// =============================================================================

function SuppliersTab({ restaurantId }: { restaurantId: string }) {
  const utils = trpc.useUtils();
  const suppliers = trpc.inventory.listSuppliers.useQuery({ restaurantId });
  const createSupplier = trpc.inventory.createSupplier.useMutation({
    onSuccess: () => {
      toast.success("Supplier added");
      utils.inventory.listSuppliers.invalidate({ restaurantId });
      setShowForm(false);
      setForm({ name: "", phone: "", email: "" });
    },
    onError: (err) => toast.error(err.message),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const list = suppliers.data ?? [];

  if (suppliers.isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading suppliers">
        {[1, 2].map(i => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-[#E9EFD6]" />
        ))}
      </div>
    );
  }

  if (suppliers.isError) {
    return (
      <AdminError
        message="We couldn't load suppliers. Please retry."
        onRetry={() => suppliers.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      {!showForm ? (
        <Button onClick={() => setShowForm(true)} className="bg-[#2A3A0C] hover:bg-[#2A3A0C] text-white gap-2">
          <Plus className="w-4 h-4" /> Add Supplier
        </Button>
      ) : (
        <div className="bg-white rounded-xl border border-[#D8DFC0] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => {
              const name = form.name.trim();
              if (!name) { toast.error("Name required"); return; }
              const phone = form.phone.trim();
              const email = form.email.trim();
              if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter a valid email address."); return; }
              createSupplier.mutate({
                restaurantId,
                name,
                phone: phone || undefined,
                email: email || undefined,
              });
            }} disabled={createSupplier.isPending} className="bg-[#2A3A0C] hover:bg-[#2A3A0C] text-white">
              {createSupplier.isPending ? <LoaderCircle className="w-4 h-4 animate-spin mr-1" /> : null} Save
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#D8DFC0] overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[#f7f2eb] text-left">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Name</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Phone</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Email</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-[#9AA07E]">No suppliers added yet</td></tr>
            ) : list.map(s => (
              <tr key={s.id} className="border-t border-[#f0e8de]">
                <td className="px-4 py-2.5 font-medium">{s.name}</td>
                <td className="px-4 py-2.5">{s.phone ?? "-"}</td>
                <td className="px-4 py-2.5">{s.email ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Purchase Orders Tab
// =============================================================================

function PurchaseOrdersTab({ restaurantId }: { restaurantId: string }) {
  const utils = trpc.useUtils();
  const pos = trpc.inventory.listPurchaseOrders.useQuery({ restaurantId }, { retry: false });
  const receivePo = trpc.inventory.receivePurchaseOrder.useMutation({
    onSuccess: (d) => {
      toast.success(`Purchase order received (${d.itemsReceived} items)`);
      utils.inventory.listPurchaseOrders.invalidate({ restaurantId });
      utils.inventory.listMaterials.invalidate({ restaurantId });
    },
    onError: (err) => toast.error(err.message),
  });
  const list = pos.data ?? [];

  if (pos.isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading purchase orders">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-[#E9EFD6]" />
        ))}
      </div>
    );
  }

  if (pos.isError) {
    return (
      <AdminError
        message="We couldn't load purchase orders. Please retry."
        onRetry={() => pos.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#D8DFC0] overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[#f7f2eb] text-left">
            <tr>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">PO #</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Supplier</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Status</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Total</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]">Date</th>
              <th className="px-4 py-2.5 font-semibold text-[#3F4C1E]"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[#9AA07E]">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No purchase orders yet
              </td></tr>
            ) : list.map(po => {
              const total = Number.isFinite(po.totalPaise) ? po.totalPaise : 0;
              const created = new Date(po.createdAt);
              const canReceive = po.status === "DRAFT" || po.status === "SENT";
              return (
              <tr key={po.id} className="border-t border-[#f0e8de]">
                <td className="px-4 py-2.5 font-mono text-xs">{po.id.slice(-8)}</td>
                <td className="px-4 py-2.5">{po.supplierName ?? "-"}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    po.status === "RECEIVED" ? "bg-green-100 text-green-700" :
                    po.status === "SENT" ? "bg-blue-100 text-blue-700" :
                    po.status === "CANCELLED" ? "bg-gray-100 text-gray-600" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>{po.status}</span>
                </td>
                <td className="px-4 py-2.5">₹{(total / 100).toLocaleString("en-IN")}</td>
                <td className="px-4 py-2.5 text-[#3F4C1E]">{Number.isNaN(created.getTime()) ? "—" : created.toLocaleDateString()}</td>
                <td className="px-4 py-2.5 text-right">
                  {canReceive && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={receivePo.isPending}
                      onClick={() => { if (window.confirm(`Mark PO ${po.id.slice(-8)} as received? Stock will be added.`)) receivePo.mutate({ poId: po.id, restaurantId }); }}
                      className="h-7 text-xs"
                    >
                      {receivePo.isPending ? <LoaderCircle className="w-3 h-3 animate-spin" /> : "Receive"}
                    </Button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
