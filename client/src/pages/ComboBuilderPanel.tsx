import { trpc } from "@/lib/trpc";
import { CircleAlert, Loader2, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminError } from "@/components/DashboardLayout";

type Category = { id: string; name: string };
type Combo = { id: string; name: string; pricePaise: number; description?: string | null };

export default function ComboBuilderPanel({
  restaurantId,
  categories,
  combos,
}: {
  restaurantId: string;
  categories?: Category[];
  combos?: Combo[];
}) {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    priceRupees: "",
    categoryId: "",
    description: "",
    groups: [] as Array<{ name: string; required: boolean; min: number; max: number; options: Array<{ name: string; pricePaise: string }> }>,
  });

  const createItemMutation = trpc.admin.createMenuItem.useMutation({
    onSuccess: () => {
      utils.admin.dashboard.invalidate();
      toast.success("Combo created");
    },
    onError: (err) => toast.error(err.message || "Could not create combo."),
  });

  if (!restaurantId) {
    return (
      <AdminError message="We couldn't determine which restaurant this combo belongs to." />
    );
  }

  const categoryList = categories ?? [];
  const comboList = combos ?? [];

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
    if (!form.name.trim()) {
      toast.error("Enter a combo name first.");
      return;
    }
    if (!form.categoryId) {
      toast.error("Choose a category for this combo.");
      return;
    }
    const priceNum = Number(String(form.priceRupees).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error("Enter a valid combo price greater than ₹0.");
      return;
    }

    const namedGroups = form.groups.filter(g => g.name.trim());
    if (form.groups.length > 0 && namedGroups.length !== form.groups.length) {
      toast.error("Name every included section, or remove the unnamed ones.");
      return;
    }

    // The server has no dedicated combo-group endpoint, so included sections are
    // appended to the item description and surfaced as a warning below.
    const sectionsNote = namedGroups.length
      ? `\n\nIncludes: ${namedGroups.map(g => {
          const opts = g.options.filter(o => o.name.trim()).map(o => o.name.trim()).join(", ");
          return `${g.name.trim()}${opts ? ` (${opts})` : ""}`;
        }).join(" · ")}`
      : "";
    const description = `${form.description.trim()}${sectionsNote}`.trim() || undefined;

    try {
      await createItemMutation.mutateAsync({
        restaurantId,
        categoryId: form.categoryId,
        name: form.name.trim(),
        pricePaise: Math.round(priceNum * 100),
        description,
        dietaryType: "veg",
        isCustomizable: true,
      });
    } catch {
      // onError already toasted — keep the form open with its data intact.
      return;
    }

    if (namedGroups.length > 0) {
      toast.warning("Sections saved as item notes — configure add-on options from the Menu panel.");
    }

    setShowForm(false);
    setForm({ name: "", priceRupees: "", categoryId: "", description: "", groups: [] });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Combo Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create combo meals with customizable included items and add-ons</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            disabled={categoryList.length === 0}
            title={categoryList.length === 0 ? "Create a category first" : undefined}
            className="flex items-center gap-2 rounded-lg bg-[#9d3727] px-4 py-2 text-sm font-bold text-white hover:bg-[#7c2b1e] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New Combo
          </button>
        )}
      </div>

      {categoryList.length === 0 && !showForm && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-amber-800">Create a menu category first — combos must belong to a category.</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <UtensilsCrossed className="h-5 w-5 text-[#9d3727]" />
            <h2 className="font-semibold">Create Combo Meal</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="combo-name" className="block text-xs font-medium text-muted-foreground mb-1">Combo Name</label>
              <input id="combo-name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g., Family Feast" />
            </div>
            <div>
              <label htmlFor="combo-price" className="block text-xs font-medium text-muted-foreground mb-1">Price (₹)</label>
              <input id="combo-price" required inputMode="decimal" value={form.priceRupees} onChange={e => setForm(f => ({ ...f, priceRupees: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g., 499 for ₹499" />
            </div>
            <div>
              <label htmlFor="combo-category" className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
              <select id="combo-category" required value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="min-h-11 w-full rounded-md border px-3 py-2 text-sm">
                <option value="">Select category...</option>
                {categoryList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="combo-desc" className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
              <input id="combo-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="What's included..." />
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

            {form.groups.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-amber-800">The server has no combo-section endpoint yet, so sections are saved as notes on the item. Use the Menu panel to configure add-on options.</p>
              </div>
            )}

            {form.groups.map((group, gi) => (
              <div key={gi} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <input
                      placeholder="Section name (e.g., Main Course, Drink)"
                      aria-label={`Section ${gi + 1} name`}
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
                      <input type="number" min="1" max="10" aria-label={`Section ${gi + 1} max selections`} value={group.max} onChange={e => updateGroup(gi, "max", parseInt(e.target.value) || 1)} className="w-12 rounded border px-1 py-0.5 text-center" />
                    </div>
                  </div>
                  <button type="button" onClick={() => removeGroup(gi)} aria-label={`Remove section ${gi + 1}`} className="ml-2 text-muted-foreground hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="pl-2 space-y-2">
                  {group.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        placeholder="Option name"
                        aria-label={`Section ${gi + 1} option ${oi + 1} name`}
                        value={opt.name}
                        onChange={e => updateOption(gi, oi, "name", e.target.value)}
                        className="flex-1 rounded border px-2 py-1 text-xs bg-white"
                      />
                      <input
                        placeholder="Extra (paise)"
                        aria-label={`Section ${gi + 1} option ${oi + 1} extra in paise`}
                        type="number"
                        min="0"
                        value={opt.pricePaise}
                        onChange={e => updateOption(gi, oi, "pricePaise", e.target.value)}
                        className="w-24 rounded border px-2 py-1 text-xs bg-white"
                      />
                      <button type="button" onClick={() => removeOption(gi, oi)} aria-label={`Remove option ${oi + 1}`} className="text-muted-foreground hover:text-red-600">
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
              {createItemMutation.isPending ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating...</span>
              ) : "Create Combo"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
          </div>
        </form>
      )}

      {/* Existing combos */}
      {comboList.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-semibold">Existing combos ({comboList.length})</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {comboList.map(combo => (
              <div key={combo.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{combo.name}</p>
                  <p className="text-sm font-extrabold">₹{(combo.pricePaise / 100).toLocaleString("en-IN")}</p>
                </div>
                {combo.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{combo.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : !showForm && (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <UtensilsCrossed className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Combo meals appear as customizable menu items</p>
          <p className="text-sm text-muted-foreground mt-1">
            After creating a combo, use the Menu panel to further configure addon groups and preview how it appears on the storefront.
          </p>
        </div>
      )}
    </div>
  );
}
