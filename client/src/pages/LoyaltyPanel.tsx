import { trpc } from "@/lib/trpc";
import { Award, Loader2, Save, Star, Trophy, Users } from "lucide-react";
import { useEffect, useState } from "react";

export default function LoyaltyPanel({ restaurantId }: { restaurantId: string }) {
  const programQuery = trpc.loyalty.getProgram.useQuery({ restaurantId });
  const { data: program, isLoading, refetch } = programQuery;
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
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        <span className="ml-2 text-sm font-bold text-gray-500">Loading loyalty program…</span>
      </div>
    );
  }

  if (programQuery.isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-bold text-red-700">We couldn't load the loyalty program. Please retry.</p>
        <button
          onClick={() => programQuery.refetch()}
          className="mt-3 h-11 min-h-[44px] cursor-pointer rounded-xl border border-gray-200 bg-white px-4 text-xs font-extrabold text-gray-700 transition-colors hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Loyalty Program</h1>
        <p className="mt-1 text-sm text-gray-500">Reward repeat customers with points they can redeem on future orders</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold tabular-nums text-gray-900">{stats?.totalMembers ?? 0}</p>
              <p className="text-xs font-bold text-gray-500">Members</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Star className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold tabular-nums text-gray-900">{(stats?.totalPointsIssued ?? 0).toLocaleString("en-IN")}</p>
              <p className="text-xs font-bold text-gray-500">Total Points Issued</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold tabular-nums text-gray-900">{stats?.tierBreakdown?.length ?? 0}</p>
              <p className="text-xs font-bold text-gray-500">Active Tiers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tier Breakdown */}
      {stats?.tierBreakdown && stats.tierBreakdown.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 font-extrabold text-gray-900">Tier Distribution</h2>
          <div className="flex gap-4">
            {(stats.tierBreakdown as Array<{ tier: string; count: number }>).map(t => (
              <div key={t.tier} className="flex-1 rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-lg font-extrabold capitalize text-gray-900">{t.tier}</p>
                <p className="text-2xl font-extrabold tabular-nums mt-1 text-gray-900">{t.count}</p>
                <p className="text-xs text-gray-500">members</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Program Config */}
      <form onSubmit={handleSave} className="rounded-2xl border border-gray-200 bg-white p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Award className="h-5 w-5 text-[#c84630]" />
          <h2 className="font-extrabold text-gray-900">Program Configuration</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-500">Program Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-500">Points per Rupee Spent</label>
            <input value={form.pointsPerRupee} onChange={e => setForm(f => ({ ...f, pointsPerRupee: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums" />
            <p className="mt-1 text-xs text-gray-500">e.g., 1 = 1 point per rupee, 0.5 = 1 point per 2 rupees</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-500">Redemption Rate (paise per point)</label>
            <input type="number" min="1" value={form.redemptionRatePaise} onChange={e => setForm(f => ({ ...f, redemptionRatePaise: parseInt(e.target.value) || 100 }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums" />
            <p className="mt-1 text-xs text-gray-500">100 = 1 point = 1 rupee discount</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-500">Max Redemption (% of order)</label>
            <input type="number" min="1" max="100" value={form.maxRedemptionPercent} onChange={e => setForm(f => ({ ...f, maxRedemptionPercent: parseInt(e.target.value) || 50 }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-500">Points Expiry (days)</label>
            <input type="number" min="1" value={form.pointsExpiryDays} onChange={e => setForm(f => ({ ...f, pointsExpiryDays: parseInt(e.target.value) || 365 }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 rounded accent-[#c84630]" />
              <span className="text-sm font-bold text-gray-900">Program Active</span>
            </label>
          </div>
        </div>

        <button type="submit" disabled={upsertMutation.isPending} className="flex h-11 min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-[#c84630] px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-[#b03a28] disabled:opacity-50">
          <Save className="h-4 w-4" />
          {upsertMutation.isPending ? "Saving..." : "Save Configuration"}
        </button>
      </form>
    </div>
  );
}
