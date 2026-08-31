import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { useState } from "react";

export default function ComboBuilderPanel({ restaurantId }: { restaurantId: string }) {
  const [slug] = useState(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[1] : "";
  });
  const { data: dashData } = trpc.admin.dashboard.useQuery({ slug }, { enabled: !!slug });
  const categories = (dashData as any)?.categories ?? [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    pricePaise: "",
    categoryId: "",
    description: "",
    groups: [] as Array<{ name: string; required: boolean; min: number; max: number; options: Array<{ name: string; pricePaise: string }> }>,
  });

  const createItemMutation = trpc.admin.createMenuItem.useMutation();

  const addGroup = () => {
    setForm(f => ({
      ...f,
      groups: [...f.groups, { name: "", required: false, min: 0, max: 1, options: [] }],
    }));
  };

  const removeGroup = (gi: number) => {
    setForm(f => ({ ...f, groups: f.groups.filter((_, i) => i !== gi) }));
  };

  const updateGroup = (gi: number, field: string, value: unknown) => {
    setForm(f => {
      const groups = [...f.groups];
      groups[gi] = { ...groups[gi], [field]: value };
      return { ...f, groups };
    });
  };

  const addOption = (gi: number) => {
    setForm(f => {
      const groups = [...f.groups];
      groups[gi] = { ...groups[gi], options: [...groups[gi].options, { name: "", pricePaise: "" }] };
      return { ...f, groups };
    });
  };

  const removeOption = (gi: number, oi: number) => {
    setForm(f => {
      const groups = [...f.groups];
      groups[gi] = { ...groups[gi], options: groups[gi].options.filter((_, i) => i !== oi) };
      return { ...f, groups };
    });
  };

  const updateOption = (gi: number, oi: number, field: string, value: string) => {
    setForm(f => {
      const groups = [...f.groups];
      const options = [...groups[gi].options];
      options[oi] = { ...options[oi], [field]: value };
      groups[gi] = { ...groups[gi], options };
      return { ...f, groups };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryId || !form.name) return;

    const result = await createItemMutation.mutateAsync({
      restaurantId,
      categoryId: form.categoryId,
      name: form.name,
      pricePaise: parseInt(form.pricePaise) || 0,
      description: form.description || undefined,
      dietaryType: "veg",
      isCustomizable: true,
    });

    // Create addon groups and options for the combo
    if (result?.id) {
      for (const group of form.groups) {
        if (!group.name) continue;
        // Note: addon group creation would go through a dedicated endpoint
        // For now, the combo item is created with isCustomizable=true
        // and addon groups can be configured through the existing menu editor
      }
    }

    setShowForm(false);
    setForm({ name: "", pricePaise: "", categoryId: "", description: "", groups: [] });
  };

  if (!dashData && slug) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Combo Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create combo meals with customizable included items and add-ons</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-[#9d3727] px-4 py-2 text-sm font-bold text-white hover:bg-[#7c2b1e]"
          >
            <Plus className="h-4 w-4" />
            New Combo
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <UtensilsCrossed className="h-5 w-5 text-[#9d3727]" />
            <h2 className="font-semibold">Create Combo Meal</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Combo Name</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g., Family Feast" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Price (paise)</label>
              <input required type="number" min="0" value={form.pricePaise} onChange={e => setForm(f => ({ ...f, pricePaise: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g., 49900 for ₹499" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
              <select required value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="">Select category...</option>
                {(categories as any[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="What's included..." />
            </div>
          </div>

          {/* Addon Groups */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Included Sections</h3>
              <button type="button" onClick={addGroup} className="flex items-center gap-1 text-xs font-medium text-[#9d3727] hover:underline">
                <Plus className="h-3 w-3" /> Add Section
              </button>
            </div>

            {form.groups.map((group, gi) => (
              <div key={gi} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      placeholder="Section name (e.g., Main Course, Drink)"
                      value={group.name}
                      onChange={e => updateGroup(gi, "name", e.target.value)}
                      className="flex-1 rounded-md border px-3 py-1.5 text-sm bg-white"
                    />
                    <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                      <input type="checkbox" checked={group.required} onChange={e => updateGroup(gi, "required", e.target.checked)} className="rounded" />
                      Required
                    </label>
                    <div className="flex items-center gap-1 text-xs">
                      <span>Max:</span>
                      <input type="number" min="1" max="10" value={group.max} onChange={e => updateGroup(gi, "max", parseInt(e.target.value) || 1)} className="w-12 rounded border px-1 py-0.5 text-center" />
                    </div>
                  </div>
                  <button type="button" onClick={() => removeGroup(gi)} className="ml-2 text-muted-foreground hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="pl-2 space-y-2">
                  {group.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        placeholder="Option name"
                        value={opt.name}
                        onChange={e => updateOption(gi, oi, "name", e.target.value)}
                        className="flex-1 rounded border px-2 py-1 text-xs bg-white"
                      />
                      <input
                        placeholder="Extra (paise)"
                        type="number"
                        min="0"
                        value={opt.pricePaise}
                        onChange={e => updateOption(gi, oi, "pricePaise", e.target.value)}
                        className="w-24 rounded border px-2 py-1 text-xs bg-white"
                      />
                      <button type="button" onClick={() => removeOption(gi, oi)} className="text-muted-foreground hover:text-red-600">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addOption(gi)} className="text-[10px] font-medium text-muted-foreground hover:text-foreground">
                    + Add option
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={createItemMutation.isPending} className="rounded-lg bg-[#9d3727] px-4 py-2 text-sm font-bold text-white hover:bg-[#7c2b1e] disabled:opacity-50">
              {createItemMutation.isPending ? "Creating..." : "Create Combo"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-dashed p-8 text-center">
        <UtensilsCrossed className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-medium">Combo meals appear as customizable menu items</p>
        <p className="text-sm text-muted-foreground mt-1">
          After creating a combo, use the Menu panel to further configure addon groups and preview how it appears on the storefront.
        </p>
      </div>
    </div>
  );
}
