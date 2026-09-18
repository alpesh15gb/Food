import { useState } from "react";
import { AlertTriangle, Box, LoaderCircle, Package, Plus, ShoppingCart, Truck, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { formatINR } from "@/lib/types";

type Tab = "materials" | "recipes" | "suppliers" | "purchase-orders";

export default function InventoryPanel({ restaurantId }: { restaurantId: string }) {
  const [tab, setTab] = useState<Tab>("materials");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900">Inventory & Recipes</h2>
        <p className="text-sm text-gray-500 mt-1">Track raw materials, link ingredients to menu items, manage suppliers and purchase orders.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 pb-0">
        {([
          { id: "materials", label: "Materials", icon: Box },
          { id: "recipes", label: "Recipes", icon: UtensilsCrossed },
          { id: "suppliers", label: "Suppliers", icon: Truck },
          { id: "purchase-orders", label: "Purchase Orders", icon: ShoppingCart },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex cursor-pointer items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              tab === t.id
                ? "border-[#c84630] text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-900"
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
        <Button onClick={() => setShowForm(true)} className="h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] font-extrabold text-white transition-colors hover:bg-[#b03a28] gap-2">
          <Plus className="w-4 h-4" /> Add Material
        </Button>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Chicken Breast" />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <select aria-label="Unit" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
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
              if (!form.name) { toast.error("Name is required"); return; }
              createMaterial.mutate({
                restaurantId,
                name: form.name,
                unit: form.unit,
                minStock: form.minStock ? parseFloat(form.minStock) : undefined,
                costPerUnitPaise: form.costPerUnit ? Math.round(parseFloat(form.costPerUnit) * 100) : undefined,
                category: form.category || undefined,
              });
            }} disabled={createMaterial.isPending} className="h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] font-extrabold text-white transition-colors hover:bg-[#b03a28] disabled:opacity-50">
              {createMaterial.isPending ? <LoaderCircle className="w-4 h-4 animate-spin mr-1" /> : null} Save
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="h-11 min-h-[44px] cursor-pointer rounded-xl transition-colors">Cancel</Button>
          </div>
        </div>
      )}

      {materials.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-12">
          <LoaderCircle className="h-5 w-5 animate-spin text-gray-500" />
          <span className="ml-2 text-sm font-bold text-gray-500">Loading materials…</span>
        </div>
      ) : materials.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-bold text-red-700">We couldn't load materials. Please retry.</p>
          <Button size="sm" variant="outline" className="mt-3 h-11 min-h-[44px] cursor-pointer rounded-xl transition-colors" onClick={() => materials.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Material</th>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Stock</th>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Min</th>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Cost/Unit</th>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Category</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center">
                <p className="text-sm font-extrabold text-gray-900">No materials added yet</p>
                <p className="mt-1 text-xs text-gray-500">Add your first raw material to start tracking stock.</p>
                <Button onClick={() => setShowForm(true)} className="mt-4 h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] font-extrabold text-white transition-colors hover:bg-[#b03a28]">
                  <Plus className="w-4 h-4 mr-1" /> Add Material
                </Button>
              </td></tr>
            ) : list.map(m => {
              const stock = parseFloat(m.currentStock);
              const min = parseFloat(m.minStock);
              const isLow = stock <= min;
              return (
                <tr key={m.id} className="border-t border-gray-100 transition-colors hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-bold text-gray-900">{m.name}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${isLow ? "text-red-600 font-extrabold" : "text-gray-900"}`}>{stock} {m.unit}</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-500">{min} {m.unit}</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-900">{formatINR(m.costPerUnitPaise / 100)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{m.category ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      )}
    </div>
  );
}

// =============================================================================
// Recipes Tab
// =============================================================================

function RecipesTab({ restaurantId }: { restaurantId: string }) {
  void restaurantId;
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center">
      <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 text-gray-500 opacity-40" />
      <p className="font-extrabold text-gray-900">Recipe Builder</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">Link menu items to raw material ingredients. Select a menu item from the Menu panel to configure its recipe.</p>
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

  return (
    <div className="space-y-4">
      {!showForm ? (
        <Button onClick={() => setShowForm(true)} className="h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] font-extrabold text-white transition-colors hover:bg-[#b03a28] gap-2">
          <Plus className="w-4 h-4" /> Add Supplier
        </Button>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1"><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => { if (!form.name) { toast.error("Name required"); return; } createSupplier.mutate({ restaurantId, ...form }); }} disabled={createSupplier.isPending} className="h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] font-extrabold text-white transition-colors hover:bg-[#b03a28] disabled:opacity-50">
              {createSupplier.isPending ? <LoaderCircle className="w-4 h-4 animate-spin mr-1" /> : null} Save
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="h-11 min-h-[44px] cursor-pointer rounded-xl transition-colors">Cancel</Button>
          </div>
        </div>
      )}

      {suppliers.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-12">
          <LoaderCircle className="h-5 w-5 animate-spin text-gray-500" />
          <span className="ml-2 text-sm font-bold text-gray-500">Loading suppliers…</span>
        </div>
      ) : suppliers.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-bold text-red-700">We couldn't load suppliers. Please retry.</p>
          <Button size="sm" variant="outline" className="mt-3 h-11 min-h-[44px] cursor-pointer rounded-xl transition-colors" onClick={() => suppliers.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Name</th>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Phone</th>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Email</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center">
                <p className="text-sm font-extrabold text-gray-900">No suppliers added yet</p>
                <p className="mt-1 text-xs text-gray-500">Add your first supplier to raise purchase orders.</p>
                <Button onClick={() => setShowForm(true)} className="mt-4 h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] font-extrabold text-white transition-colors hover:bg-[#b03a28]">
                  <Plus className="w-4 h-4 mr-1" /> Add Supplier
                </Button>
              </td></tr>
            ) : list.map(s => (
              <tr key={s.id} className="border-t border-gray-100 transition-colors hover:bg-gray-50">
                <td className="px-4 py-2.5 font-bold text-gray-900">{s.name}</td>
                <td className="px-4 py-2.5 tabular-nums text-gray-900">{s.phone ?? "-"}</td>
                <td className="px-4 py-2.5 text-gray-500">{s.email ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      )}
    </div>
  );
}

// =============================================================================
// Purchase Orders Tab
// =============================================================================

function PurchaseOrdersTab({ restaurantId }: { restaurantId: string }) {
  const pos = trpc.inventory.listPurchaseOrders.useQuery({ restaurantId });
  const list = pos.data ?? [];

  if (pos.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-12">
        <LoaderCircle className="h-5 w-5 animate-spin text-gray-500" />
        <span className="ml-2 text-sm font-bold text-gray-500">Loading purchase orders…</span>
      </div>
    );
  }

  if (pos.isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-bold text-red-700">We couldn't load purchase orders. Please retry.</p>
        <Button size="sm" variant="outline" className="mt-3 h-11 min-h-[44px] cursor-pointer rounded-xl transition-colors" onClick={() => pos.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">PO #</th>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Supplier</th>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Total</th>
              <th className="px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center">
                <Package className="w-8 h-8 mx-auto mb-2 text-gray-500 opacity-40" />
                <p className="text-sm font-extrabold text-gray-900">No purchase orders yet</p>
                <p className="mt-1 text-xs text-gray-500">Purchase orders raised to suppliers will appear here.</p>
              </td></tr>
            ) : list.map(po => (
              <tr key={po.id} className="border-t border-gray-100 transition-colors hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{po.id.slice(-8)}</td>
                <td className="px-4 py-2.5 font-bold text-gray-900">{po.supplierName ?? "-"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                    po.status === "RECEIVED" ? "bg-green-50 text-green-700" :
                    po.status === "SENT" ? "bg-blue-50 text-blue-700" :
                    po.status === "CANCELLED" ? "bg-gray-100 text-gray-600" :
                    "bg-amber-50 text-amber-700"
                  }`}>{po.status}</span>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-gray-900">{formatINR(po.totalPaise / 100)}</td>
                <td className="px-4 py-2.5 tabular-nums text-gray-500">{new Date(po.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
