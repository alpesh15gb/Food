import { trpc } from "@/lib/trpc";
import { Award, Loader2, Save, Star, Trophy, Users } from "lucide-react";
import { useEffect, useState } from "react";

export default function LoyaltyPanel({ restaurantId }: { restaurantId: string }) {
  const { data: program, isLoading, refetch } = trpc.loyalty.getProgram.useQuery({ restaurantId });
  const { data: stats } = trpc.loyalty.getMemberStats.useQuery({ restaurantId });
  const upsertMutation = trpc.loyalty.upsertProgram.useMutation({ onSuccess: () => refetch() });

  const [form, setForm] = useState({
    name: "Rewards",
    pointsPerRupee: "1",
    redemptionRatePaise: 100,
    maxRedemptionPercent: 50,
    pointsExpiryDays: 365,
    isActive: true,
  });

  useEffect(() => {
    if (program) {
      setForm({
        name: program.name,
        pointsPerRupee: String(program.pointsPerRupee),
        redemptionRatePaise: program.redemptionRatePaise,
        maxRedemptionPercent: program.maxRedemptionPercent,
        pointsExpiryDays: program.pointsExpiryDays,
        isActive: program.isActive,
      });
    }
  }, [program]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsertMutation.mutateAsync({ restaurantId, ...form });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Loyalty Program</h1>
        <p className="mt-1 text-sm text-muted-foreground">Reward repeat customers with points they can redeem on future orders</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.totalMembers ?? 0}</p>
              <p className="text-xs text-muted-foreground">Members</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100 text-yellow-700">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{(stats?.totalPointsIssued ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Points Issued</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.tierBreakdown?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Active Tiers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tier Breakdown */}
      {stats?.tierBreakdown && stats.tierBreakdown.length > 0 && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 font-semibold">Tier Distribution</h2>
          <div className="flex gap-4">
            {(stats.tierBreakdown as Array<{ tier: string; count: number }>).map(t => (
              <div key={t.tier} className="flex-1 rounded-lg bg-muted/50 p-4 text-center">
                <p className="text-lg font-bold capitalize">{t.tier}</p>
                <p className="text-2xl font-extrabold mt-1">{t.count}</p>
                <p className="text-xs text-muted-foreground">members</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Program Config */}
      <form onSubmit={handleSave} className="rounded-xl border bg-card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Award className="h-5 w-5 text-[#9d3727]" />
          <h2 className="font-semibold">Program Configuration</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Program Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Points per Rupee Spent</label>
            <input value={form.pointsPerRupee} onChange={e => setForm(f => ({ ...f, pointsPerRupee: e.target.value }))} className="w-full rounded-md border px-3 py-2 text-sm" />
            <p className="mt-1 text-[10px] text-muted-foreground">e.g., 1 = 1 point per rupee, 0.5 = 1 point per 2 rupees</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Redemption Rate (paise per point)</label>
            <input type="number" min="1" value={form.redemptionRatePaise} onChange={e => setForm(f => ({ ...f, redemptionRatePaise: parseInt(e.target.value) || 100 }))} className="w-full rounded-md border px-3 py-2 text-sm" />
            <p className="mt-1 text-[10px] text-muted-foreground">100 = 1 point = 1 rupee discount</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Max Redemption (% of order)</label>
            <input type="number" min="1" max="100" value={form.maxRedemptionPercent} onChange={e => setForm(f => ({ ...f, maxRedemptionPercent: parseInt(e.target.value) || 50 }))} className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Points Expiry (days)</label>
            <input type="number" min="1" value={form.pointsExpiryDays} onChange={e => setForm(f => ({ ...f, pointsExpiryDays: parseInt(e.target.value) || 365 }))} className="w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded" />
              <span className="text-sm font-medium">Program Active</span>
            </label>
          </div>
        </div>

        <button type="submit" disabled={upsertMutation.isPending} className="flex items-center gap-2 rounded-lg bg-[#9d3727] px-4 py-2 text-sm font-bold text-white hover:bg-[#7c2b1e] disabled:opacity-50">
          <Save className="h-4 w-4" />
          {upsertMutation.isPending ? "Saving..." : "Save Configuration"}
        </button>
      </form>
    </div>
  );
}
