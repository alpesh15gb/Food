import { trpc } from "@/lib/trpc";
import { BarChart3, CalendarDays, Loader2, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const COLORS = ["#9d3727", "#c97a4e", "#e9bda2", "#6d5140", "#a06e53", "#d4956b", "#8b5e3c", "#f0d4be"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatCurrency(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function getDefaultRange() {
  const end = new Date();
  const start = new Date(Date.now() - 30 * 86400000);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

export default function AnalyticsPanel({ restaurantId }: { restaurantId: string }) {
  const [range, setRange] = useState(getDefaultRange);

  const { data: summary, isLoading: summaryLoading } = trpc.analytics.summaryStats.useQuery({
    restaurantId, startDate: range.start, endDate: range.end,
  });
  const { data: revenueData, isLoading: revenueLoading } = trpc.analytics.revenueTrend.useQuery({
    restaurantId, startDate: range.start, endDate: range.end, granularity: "daily",
  });
  const { data: itemData } = trpc.analytics.itemPerformance.useQuery({
    restaurantId, startDate: range.start, endDate: range.end, limit: 10,
  });
  const { data: heatmapData } = trpc.analytics.hourlyHeatmap.useQuery({
    restaurantId, days: 30,
  });
  const { data: categoryData } = trpc.analytics.categoryBreakdown.useQuery({
    restaurantId, startDate: range.start, endDate: range.end,
  });
  const { data: retentionData } = trpc.analytics.customerRetention.useQuery({
    restaurantId, startDate: range.start, endDate: range.end,
  });

  const heatmapGrid = useMemo(() => {
    if (!heatmapData) return [];
    const grid: { day: string; hour: number; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const entry = heatmapData.find((e: { dayOfWeek: number; hourOfDay: number }) => e.dayOfWeek === d && e.hourOfDay === h);
        grid.push({ day: DAY_NAMES[d], hour: h, count: entry?.orderCount ?? 0 });
      }
    }
    return grid;
  }, [heatmapData]);

  const maxHeatmap = Math.max(...heatmapGrid.map(g => g.count), 1);

  if (summaryLoading || revenueLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Revenue, orders, and customer insights</p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={range.start}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRange(r => ({ ...r, start: e.target.value }))}
            className="rounded-md border px-2 py-1.5 text-sm"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={range.end}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRange(r => ({ ...r, end: e.target.value }))}
            className="rounded-md border px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Revenue"
          value={formatCurrency(summary?.totalRevenuePaise ?? 0)}
          icon={TrendingUp}
          color="text-green-700"
          bg="bg-green-100"
        />
        <SummaryCard
          label="Total Orders"
          value={String(summary?.totalOrders ?? 0)}
          icon={BarChart3}
          color="text-blue-700"
          bg="bg-blue-100"
        />
        <SummaryCard
          label="Avg Order Value"
          value={formatCurrency(summary?.avgOrderValuePaise ?? 0)}
          icon={CalendarDays}
          color="text-purple-700"
          bg="bg-purple-100"
        />
        <SummaryCard
          label="Repeat Customers"
          value={`${retentionData?.retentionRate ?? 0}%`}
          subtitle={`${retentionData?.repeatCustomers ?? 0} of ${((retentionData?.newCustomers ?? 0) + (retentionData?.repeatCustomers ?? 0))} customers`}
          icon={Users}
          color="text-orange-700"
          bg="bg-orange-100"
        />
      </div>

      {/* Revenue Trend Chart */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 font-semibold">Revenue Trend</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData ?? []}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#9d3727" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#9d3727" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis
                dataKey="period"
                tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                fontSize={11}
              />
              <YAxis tickFormatter={(v: number) => `₹${(v / 100).toLocaleString("en-IN")}`} fontSize={11} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                labelFormatter={(label: string) => new Date(label).toLocaleDateString("en-IN")}
              />
              <Area type="monotone" dataKey="totalRevenuePaise" stroke="#9d3727" fill="url(#revGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Items */}
        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 font-semibold">Top Performing Items</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={itemData ?? []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => `₹${(v / 100).toLocaleString("en-IN")}`} fontSize={11} />
                <YAxis dataKey="itemName" type="category" width={100} fontSize={11} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), "Revenue"]} />
                <Bar dataKey="totalRevenuePaise" radius={[0, 4, 4, 0]}>
                  {(itemData ?? []).map((_: unknown, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 font-semibold">Sales by Category</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData ?? []}
                  dataKey="totalRevenuePaise"
                  nameKey="categoryName"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {(categoryData ?? []).map((_: unknown, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [formatCurrency(value), "Revenue"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Hourly Heatmap */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 font-semibold">Order Volume Heatmap (Last 30 Days)</h2>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="flex">
              <div className="w-10 shrink-0" />
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">{h}</div>
              ))}
            </div>
            {DAY_NAMES.map((day, di) => (
              <div key={day} className="flex items-center">
                <div className="w-10 shrink-0 text-xs font-medium text-muted-foreground">{day}</div>
                {Array.from({ length: 24 }, (_, h) => {
                  const cell = heatmapGrid.find(g => g.day === day && g.hour === h);
                  const intensity = (cell?.count ?? 0) / maxHeatmap;
                  return (
                    <div
                      key={h}
                      className="flex-1 aspect-square rounded-sm mx-px transition-colors"
                      style={{
                        backgroundColor: intensity > 0
                          ? `rgba(157, 55, 39, ${0.15 + intensity * 0.85})`
                          : "rgba(0,0,0,0.03)",
                      }}
                      title={`${day} ${h}:00 — ${cell?.count ?? 0} orders`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Customer Retention */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 font-semibold">Customer Retention</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-green-50 p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{retentionData?.newCustomers ?? 0}</p>
            <p className="text-xs text-green-600 mt-1">New Customers</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{retentionData?.repeatCustomers ?? 0}</p>
            <p className="text-xs text-blue-600 mt-1">Repeat Customers</p>
          </div>
          <div className="rounded-lg bg-purple-50 p-4 text-center">
            <p className="text-2xl font-bold text-purple-700">{retentionData?.retentionRate ?? 0}%</p>
            <p className="text-xs text-purple-600 mt-1">Retention Rate</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, subtitle, icon: Icon, color, bg }: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
    </div>
  );
}
