import { trpc } from "@/lib/trpc";
import { MapPin, Plus, Store, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { AdminError } from "@/components/DashboardLayout";

export default function OutletsPanel({ restaurantId }: { restaurantId: string }) {
  const outletsQuery = trpc.admin.listOutlets.useQuery({ restaurantId }, { retry: false });
  const { data: outlets, isLoading, refetch } = outletsQuery;
  const createMutation = trpc.admin.createOutlet.useMutation({
    onSuccess: () => {
      toast.success("Outlet created");
      refetch();
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message || "Could not create outlet."),
  });
  const updateMutation = trpc.admin.updateOutlet.useMutation({
    onSuccess: () => {
      toast.success("Outlet updated");
      refetch();
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message || "Could not update outlet."),
  });
  const toggleActiveMutation = trpc.admin.toggleOutletActive.useMutation({
    onSuccess: () => {
      toast.success("Outlet status updated");
      refetch();
    },
    onError: (err) => toast.error(err.message || "Could not update outlet status."),
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", address: "", city: "", phone: "", preparationMinutes: "25", deliveryRadiusKm: "5" });
  const [pendingToggle, setPendingToggle] = useState<{ id: string; name: string; next: boolean } | null>(null);

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
    const name = form.name.trim();
    const address = form.address.trim();
    const city = form.city.trim();
    const phone = form.phone.trim();
    if (!name || !address || !city) {
      toast.error("Name, address, and city are required.");
      return;
    }
    const prep = parseInt(form.preparationMinutes, 10);
    if (!Number.isFinite(prep) || prep < 1 || prep > 480) {
      toast.error("Prep time must be between 1 and 480 minutes.");
      return;
    }
    const radius = parseFloat(form.deliveryRadiusKm);
    if (!Number.isFinite(radius) || radius <= 0 || radius > 100) {
      toast.error("Delivery radius must be a number between 0 and 100 km.");
      return;
    }
    if (phone && !/^\+?[0-9\s-]{8,24}$/.test(phone)) {
      toast.error("Enter a valid phone number.");
      return;
    }
    const payload = {
      restaurantId,
      name,
      address,
      city,
      phone: phone || undefined,
      preparationMinutes: prep,
      deliveryRadiusKm: String(radius),
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ outletId: editingId, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } catch {
      // Error toast is handled by the mutation's onError.
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading outlets">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-[#E9EFD6]" />
        ))}
      </div>
    );
  }

  if (outletsQuery.isError) {
    return (
      <AdminError
        message="We couldn't load outlets. Please retry."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outlets</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your restaurant locations and their settings</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 rounded-lg bg-[#B95509] px-4 py-2 text-sm font-bold text-white hover:bg-[#7E3C05]"
          >
            <Plus className="h-4 w-4" />
            Add Outlet
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="font-semibold">{editingId ? "Edit Outlet" : "New Outlet"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Outlet Name</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g., Main Kitchen" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">City</label>
              <input required value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g., Hyderabad" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
              <input required value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Full address" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="+91..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Prep Time (min)</label>
              <input type="number" min="1" value={form.preparationMinutes} onChange={e => setForm(f => ({ ...f, preparationMinutes: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Delivery Radius (km)</label>
              <input type="number" min="0.5" max="100" step="0.5" value={form.deliveryRadiusKm} onChange={e => setForm(f => ({ ...f, deliveryRadiusKm: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="rounded-lg bg-[#B95509] px-4 py-2 text-sm font-bold text-white hover:bg-[#7E3C05] disabled:opacity-50">
              {editingId ? "Update" : "Create"} Outlet
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(outlets ?? []).map((outlet: any) => (
          <div key={outlet.id} className={`rounded-xl border bg-card p-5 transition-all ${!outlet.isActive ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${outlet.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{outlet.name}</h3>
                  <p className="text-xs text-muted-foreground">{outlet.city}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  const next = !outlet.isActive;
                  if (!next) {
                    setPendingToggle({ id: outlet.id, name: outlet.name, next });
                  } else {
                    toggleActiveMutation.mutate({ outletId: outlet.id, isActive: next, restaurantId });
                  }
                }}
                disabled={toggleActiveMutation.isPending}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                title={outlet.isActive ? "Deactivate" : "Activate"}
                aria-label={outlet.isActive ? `Deactivate ${outlet.name}` : `Activate ${outlet.name}`}
              >
                {outlet.isActive ? <ToggleRight className="h-6 w-6 text-green-600" /> : <ToggleLeft className="h-6 w-6" />}
              </button>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground line-clamp-2">{outlet.address}</p>
              </div>
              {outlet.phone && <p className="text-muted-foreground">{outlet.phone}</p>}
            </div>

            <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
              <span>Prep: {outlet.preparationMinutes}min</span>
              <span>Radius: {outlet.deliveryRadiusKm}km</span>
              <button onClick={() => handleEdit(outlet)} className="ml-auto font-medium text-[#B95509] hover:underline">Edit</button>
            </div>
          </div>
        ))}
      </div>

      {(!outlets || outlets.length === 0) && !showForm && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Store className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No outlets yet</p>
          <p className="text-sm text-muted-foreground">Add your first outlet to start accepting orders.</p>
        </div>
      )}

      <AlertDialog open={!!pendingToggle} onOpenChange={(open) => { if (!open) setPendingToggle(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {pendingToggle?.name ?? "this outlet"}?</AlertDialogTitle>
            <AlertDialogDescription>
              New orders will stop routing to this outlet until you reactivate it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep active</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingToggle) toggleActiveMutation.mutate({ outletId: pendingToggle.id, isActive: false, restaurantId }); setPendingToggle(null); }}
              className="bg-red-600 hover:bg-red-700"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
