import { trpc } from "@/lib/trpc";
import { MapPin, Loader2, Plus, Store, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function OutletsPanel({ restaurantId }: { restaurantId: string }) {
  const utils = trpc.useUtils();
  const outletsQuery = trpc.admin.listOutlets.useQuery({ restaurantId });
  const { data: outlets, isLoading, refetch } = outletsQuery;
  const isError = outletsQuery.isError;
  const invalidateAll = () => {
    refetch();
    utils.admin.dashboard.invalidate();
  };
  const createMutation = trpc.admin.createOutlet.useMutation({
    onSuccess: () => { invalidateAll(); setShowForm(false); resetForm(); toast.success("Outlet created"); },
    onError: (err) => toast.error(err.message || "Could not create outlet."),
  });
  const updateMutation = trpc.admin.updateOutlet.useMutation({
    onSuccess: () => { invalidateAll(); setShowForm(false); toast.success("Outlet updated"); },
    onError: (err) => toast.error(err.message || "Could not update outlet."),
  });
  const toggleActiveMutation = trpc.admin.toggleOutletActive.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Outlet status updated"); },
    onError: (err) => toast.error(err.message || "Could not update outlet status."),
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", address: "", city: "", phone: "", preparationMinutes: "25", deliveryRadiusKm: "5" });

  const resetForm = () => {
    setForm({ name: "", address: "", city: "", phone: "", preparationMinutes: "25", deliveryRadiusKm: "5" });
    setEditingId(null);
  };

  const handleEdit = (outlet: any) => {
    setForm({
      name: outlet.name,
      address: outlet.address,
      city: outlet.city,
      phone: outlet.phone || "",
      preparationMinutes: String(outlet.preparationMinutes),
      deliveryRadiusKm: String(outlet.deliveryRadiusKm || "5"),
    });
    setEditingId(outlet.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          outletId: editingId,
          restaurantId,
          name: form.name,
          address: form.address,
          city: form.city,
          phone: form.phone || undefined,
          preparationMinutes: parseInt(form.preparationMinutes) || 25,
          deliveryRadiusKm: form.deliveryRadiusKm,
        });
      } else {
        await createMutation.mutateAsync({
          restaurantId,
          name: form.name,
          address: form.address,
          city: form.city,
          phone: form.phone || undefined,
          preparationMinutes: parseInt(form.preparationMinutes) || 25,
          deliveryRadiusKm: form.deliveryRadiusKm,
        });
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not save outlet.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        <span className="ml-2 text-sm font-bold text-gray-500">Loading outlets…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-bold text-red-700">We couldn't load outlets. Please retry.</p>
        <button
          onClick={() => refetch()}
          className="mt-3 h-11 min-h-[44px] cursor-pointer rounded-xl border border-gray-200 bg-white px-4 text-xs font-extrabold text-gray-700 transition-colors hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Outlets</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your restaurant locations and their settings</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex h-11 min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-[#c84630] px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-[#b03a28]"
          >
            <Plus className="h-4 w-4" />
            Add Outlet
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="font-extrabold text-gray-900">{editingId ? "Edit Outlet" : "New Outlet"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-500">Outlet Name</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="e.g., Main Kitchen" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-500">City</label>
              <input required value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="e.g., Hyderabad" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-gray-500">Address</label>
              <input required value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Full address" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-500">Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums" placeholder="+91..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-500">Prep Time (min)</label>
              <input type="number" min="1" value={form.preparationMinutes} onChange={e => setForm(f => ({ ...f, preparationMinutes: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-500">Delivery Radius (km)</label>
              <input value={form.deliveryRadiusKm} onChange={e => setForm(f => ({ ...f, deliveryRadiusKm: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-[#b03a28] disabled:opacity-50">
              {editingId ? "Update" : "Create"} Outlet
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="h-11 min-h-[44px] cursor-pointer rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(outlets ?? []).map((outlet: any) => (
          <div key={outlet.id} className={`rounded-2xl border border-gray-200 bg-white p-5 transition-colors ${!outlet.isActive ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${outlet.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-gray-900">{outlet.name}</h3>
                  <p className="text-xs text-gray-500">{outlet.city}</p>
                </div>
              </div>
              <button
                onClick={() => toggleActiveMutation.mutate({ outletId: outlet.id, isActive: !outlet.isActive })}
                className="cursor-pointer text-gray-500 transition-colors hover:text-gray-900"
                title={outlet.isActive ? "Deactivate" : "Activate"}
              >
                {outlet.isActive ? <ToggleRight className="h-6 w-6 text-green-600" /> : <ToggleLeft className="h-6 w-6" />}
              </button>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
                <p className="text-gray-500 line-clamp-2">{outlet.address}</p>
              </div>
              {outlet.phone && <p className="tabular-nums text-gray-500">{outlet.phone}</p>}
            </div>

            <div className="mt-4 flex items-center gap-4 border-t border-gray-200 pt-3 text-xs tabular-nums text-gray-500">
              <span>Prep: {outlet.preparationMinutes}min</span>
              <span>Radius: {outlet.deliveryRadiusKm}km</span>
              <span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${outlet.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {outlet.isActive ? "Active" : "Inactive"}
              </span>
              <button onClick={() => handleEdit(outlet)} className="cursor-pointer font-bold text-[#c84630] transition-colors hover:underline">Edit</button>
            </div>
          </div>
        ))}
      </div>

      {(!outlets || outlets.length === 0) && !showForm && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <Store className="mx-auto h-8 w-8 text-gray-500" />
          <p className="mt-3 font-extrabold text-gray-900">No outlets yet</p>
          <p className="mt-1 text-sm text-gray-500">Add your first outlet to start accepting orders.</p>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="mt-4 h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-[#b03a28]"
          >
            Add Outlet
          </button>
        </div>
      )}
    </div>
  );
}
