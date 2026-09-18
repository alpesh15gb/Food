import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChefHat, Clock, Flame, LoaderCircle, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AdminError } from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";

type Station = "all" | "grill" | "fry" | "assembly" | "drinks";
const STATIONS: { id: Station; label: string }[] = [
  { id: "all", label: "All Stations" },
  { id: "grill", label: "Grill / Tandoor" },
  { id: "fry", label: "Fry Station" },
  { id: "assembly", label: "Assembly" },
  { id: "drinks", label: "Drinks" },
];

function ElapsedTimer({ since, now }: { since: string; now: number }) {
  const ms = now - new Date(since).getTime();
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return <span>{mins}:{secs.toString().padStart(2, "0")}</span>;
}

function urgencyColor(since: string): string {
  const mins = (Date.now() - new Date(since).getTime()) / 60000;
  if (mins < 10) return "border-green-500/40 bg-green-950/20";
  if (mins < 20) return "border-yellow-500/40 bg-yellow-950/20";
  return "border-red-500/40 bg-red-950/20";
}

function urgencyText(since: string): string {
  const mins = (Date.now() - new Date(since).getTime()) / 60000;
  if (mins < 10) return "text-green-300";
  if (mins < 20) return "text-yellow-300";
  return "text-red-300";
}

function urgencyLabel(since: string): string {
  const mins = (Date.now() - new Date(since).getTime()) / 60000;
  if (mins < 10) return "On time";
  if (mins < 20) return "Running late";
  return "Delayed";
}

export default function KDSPage({ slug, restaurantId }: { slug?: string; restaurantId?: string }) {
  const [station, setStation] = useState<Station>("all");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [pausedOnError, setPausedOnError] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // null = feed not loaded yet: the first load must not chime for old orders.
  const prevIdsRef = useRef<Set<string> | null>(null);

  if (!slug) {
    return (
      <div className="min-h-dvh bg-[#1a1a1a] text-white flex flex-col items-center justify-center p-6 text-center">
        <ChefHat className="w-12 h-12 mb-4 opacity-40" aria-hidden />
        <p className="text-lg font-bold">No restaurant selected</p>
        <p className="text-sm mt-1 text-gray-300">Open the kitchen display from a restaurant workspace (e.g. /admin/your-slug/kds).</p>
      </div>
    );
  }
  void restaurantId;

  return <KDSBoard slug={slug} station={station} setStation={setStation} soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled} audioCtxRef={audioCtxRef} prevIdsRef={prevIdsRef} pausedOnError={pausedOnError} setPausedOnError={setPausedOnError} />;
}

function KDSBoard({
  slug, station, setStation, soundEnabled, setSoundEnabled, audioCtxRef, prevIdsRef, pausedOnError, setPausedOnError,
}: {
  slug: string;
  station: Station;
  setStation: (s: Station) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  audioCtxRef: React.MutableRefObject<AudioContext | null>;
  prevIdsRef: React.MutableRefObject<Set<string> | null>;
  pausedOnError: boolean;
  setPausedOnError: (v: boolean) => void;
}) {
  // Single shared 1s timer for all cards (no per-card intervals).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const ordersQuery = trpc.kds.getActiveOrders.useQuery(
    { slug, station: station === "all" ? undefined : station },
    {
      // Pause live refetch while the feed is failing; resume via Retry.
      refetchInterval: pausedOnError ? false : 5000,
      retry: false,
    }
  );

  useEffect(() => {
    if (ordersQuery.isError) {
      setPausedOnError(true);
      toast.error("Kitchen feed failed to load. Live updates paused.");
    } else if (ordersQuery.isSuccess) {
      setPausedOnError(false);
    }
  }, [ordersQuery.isError, ordersQuery.isSuccess, setPausedOnError]);

  const acceptOrder = trpc.kds.acceptOrder.useMutation({
    onSuccess: () => {
      ordersQuery.refetch();
      toast.success("Order accepted");
    },
    onError: (err) => toast.error(err.message || "Could not accept order."),
  });
  const setPreparing = trpc.kds.setOrderPreparing.useMutation({
    onSuccess: () => {
      ordersQuery.refetch();
      toast.success("Order moved to preparing");
    },
    onError: (err) => toast.error(err.message || "Could not start preparing."),
  });
  const bumpOrder = trpc.kds.bumpOrder.useMutation({
    onSuccess: () => {
      ordersQuery.refetch();
      toast.success("Order marked ready");
    },
    onError: (err) => toast.error(err.message || "Could not mark order ready."),
  });
  const cancelUnpaid = trpc.admin.updateOrderStatus.useMutation({
    onSuccess: () => {
      ordersQuery.refetch();
      toast.success("Order cancelled");
    },
    onError: (err) => toast.error(err.message || "Could not cancel order."),
  });
  const rejectUnpaid = trpc.admin.updateOrderStatus.useMutation({
    onSuccess: () => {
      ordersQuery.refetch();
      toast.success("Order rejected");
    },
    onError: (err) => toast.error(err.message || "Could not reject order."),
  });

  function playAlert() {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch { /* audio not available */ }
  }

  useEffect(() => {
    const ids = new Set((ordersQuery.data ?? []).map((o) => o.id));
    if (prevIdsRef.current === null) {
      prevIdsRef.current = ids;
      return;
    }
    let hasNew = false;
    ids.forEach((id) => {
      if (!prevIdsRef.current!.has(id)) hasNew = true;
    });
    if (hasNew) {
      playAlert();
    }
    prevIdsRef.current = ids;
  }, [ordersQuery.data, soundEnabled]);

  function enableSound() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    audioCtxRef.current.resume();
    setSoundEnabled(true);
  }

  const orders = ordersQuery.data ?? [];

  const stats = useMemo(() => {
    const active = orders.length;
    const preparing = orders.filter(o => o.status === "PREPARING").length;
    const ready = orders.filter(o => o.status === "READY_FOR_PICKUP").length;
    return { active, preparing, ready };
  }, [orders]);

  return (
    <div className="min-h-dvh bg-[#1a1a1a] text-white flex flex-col">
      {/* Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 bg-[#222] border-b border-[#333]">
        <div className="flex items-center gap-3">
          <ChefHat className="w-6 h-6 text-orange-400" />
          <h1 className="text-lg font-bold tracking-tight">Kitchen Display</h1>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-gray-300">Active:</span>
            <span className="font-bold tabular-nums">{stats.active}</span>
          </div>
          <div className="hidden items-center gap-2 min-[420px]:flex">
            <Flame className="w-4 h-4 text-orange-300" />
            <span className="text-gray-300">Preparing:</span>
            <span className="font-bold tabular-nums">{stats.preparing}</span>
          </div>
          <div className="hidden items-center gap-2 min-[420px]:flex">
            <CheckCircle2 className="w-4 h-4 text-green-300" />
            <span className="text-gray-300">Ready:</span>
            <span className="font-bold tabular-nums">{stats.ready}</span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          aria-label={soundEnabled ? "Mute new-order alerts" : "Enable new-order alerts"}
          onClick={() => soundEnabled ? setSoundEnabled(false) : enableSound()}
          className={soundEnabled ? "text-green-300 hover:text-green-200" : "text-gray-300 hover:text-gray-100"}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </Button>
      </header>

      {/* Station Tabs */}
      <nav className="flex gap-1 px-4 py-2 bg-[#1e1e1e] overflow-x-auto">
        {STATIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setStation(s.id)}
            className={`min-h-[44px] cursor-pointer px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-orange-400 ${
              station === s.id
                ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                : "text-gray-300 hover:text-gray-100 hover:bg-[#2a2a2a]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Order Grid */}
      <main className="flex-1 p-4 overflow-y-auto">
        {ordersQuery.isLoading ? (
          <div className="flex items-center justify-center h-64">
            <LoaderCircle className="w-8 h-8 animate-spin text-gray-300" />
          </div>
        ) : ordersQuery.isError ? (
          <div className="mx-auto max-w-md [&_main]:min-h-0 [&_main]:bg-transparent [&_main]:p-0 [&>main>div]:!border-red-500/40 [&>main>div]:!bg-[#2a1a1a] [&_p]:!text-red-200 [&_svg]:!text-red-400">
            <AdminError
              message="We couldn't load the kitchen feed. Live updates are paused."
              onRetry={() => {
                setPausedOnError(false);
                ordersQuery.refetch();
              }}
            />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-300">
            <ChefHat className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">No active orders</p>
            <p className="text-xs mt-1 text-gray-300">Orders will appear here when placed</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {orders.map(order => (
              <div key={order.id} className={`rounded-xl border-2 p-4 flex flex-col gap-3 ${urgencyColor(order.createdAt as unknown as string)}`}>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-gray-300">
                      #{order.trackingToken?.slice(-6) ?? order.id.slice(-6)}
                    </span>
                    <div className={`mt-0.5 flex items-center gap-1.5 text-xs font-bold tabular-nums ${urgencyText(order.createdAt as unknown as string)}`}>
                      <Clock className="w-3 h-3 inline" aria-hidden />
                      <ElapsedTimer since={order.createdAt as unknown as string} now={now} />
                      <span className="rounded-full border border-current px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                        {urgencyLabel(order.createdAt as unknown as string)}
                      </span>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                    order.status === "PLACED" ? "bg-blue-500/20 text-blue-300" :
                    order.status === "RESTAURANT_ACCEPTED" ? "bg-purple-500/20 text-purple-300" :
                    order.status === "PREPARING" ? "bg-orange-500/20 text-orange-300" :
                    "bg-green-500/20 text-green-300"
                  }`}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                </div>

                {/* Items */}
                <div className="space-y-1.5 flex-1">
                  {(order as any).items?.map((item: any) => (
                    <div key={item.id} className="flex items-start gap-2 text-sm">
                      <span className="font-bold tabular-nums text-white w-5 shrink-0">{item.quantity}x</span>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-100 truncate">{item.itemNameSnapshot}</p>
                        {item.variantNameSnapshot && (
                          <p className="text-xs text-gray-300">{item.variantNameSnapshot}</p>
                        )}
                        {item.selectedModifiers?.length > 0 && (
                          <p className="text-xs text-gray-300 italic">
                            + {item.selectedModifiers.map((m: any) => m.optionName).join(", ")}
                          </p>
                        )}
                        {item.specialInstructions && (
                          <p className="text-xs text-yellow-300 font-semibold mt-0.5">
                            Note: {item.specialInstructions}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions — one legal step at a time, mirroring the server
                    state machine (PLACED → ACCEPTED → PREPARING → READY).
                    Skipping a step fails server-side with
                    InvalidTransitionError, so it is never offered. */}
                <div className="flex gap-2 pt-2 border-t border-white/10">
                  {(order as any).paymentStatus !== "PAID" ? (
                    <div className="flex flex-col gap-2 flex-1">
                      <div className="text-center text-[10px] font-extrabold uppercase tracking-wide text-amber-300 py-1">
                        Awaiting payment
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 min-h-9 cursor-pointer border-red-500/40 text-red-300 transition-colors hover:bg-red-500/10 text-xs font-bold disabled:opacity-50"
                          onClick={() => cancelUnpaid.mutate({ orderId: order.id, status: "CANCELLED" as never, note: "Cancelled stuck unpaid order from KDS" })}
                          disabled={cancelUnpaid.isPending || rejectUnpaid.isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 min-h-9 cursor-pointer border-red-500/40 text-red-300 transition-colors hover:bg-red-500/10 text-xs font-bold disabled:opacity-50"
                          onClick={() => rejectUnpaid.mutate({ orderId: order.id, status: "REJECTED" as never, note: "Rejected stuck unpaid order from KDS" })}
                          disabled={cancelUnpaid.isPending || rejectUnpaid.isPending}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {order.status === "PLACED" && (
                        <Button
                          size="sm"
                          className="flex-1 min-h-11 cursor-pointer bg-purple-600 text-white text-xs font-bold transition-colors hover:bg-purple-700 disabled:opacity-50"
                          onClick={() => acceptOrder.mutate({ orderId: order.id, slug })}
                          disabled={acceptOrder.isPending}
                        >
                          Accept
                        </Button>
                      )}
                      {order.status === "RESTAURANT_ACCEPTED" && (
                        <Button
                          size="sm"
                          className="flex-1 min-h-11 cursor-pointer bg-orange-600 text-white text-xs font-bold transition-colors hover:bg-orange-700 disabled:opacity-50"
                          onClick={() => setPreparing.mutate({ orderId: order.id, slug })}
                          disabled={setPreparing.isPending}
                        >
                          <Flame className="w-3 h-3 mr-1" /> Start
                        </Button>
                      )}
                      {order.status === "PREPARING" && (
                        <Button
                          size="sm"
                          className="flex-1 min-h-11 cursor-pointer bg-green-600 text-white text-xs font-bold transition-colors hover:bg-green-700 disabled:opacity-50"
                          onClick={() => bumpOrder.mutate({ orderId: order.id, slug })}
                          disabled={bumpOrder.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
                        </Button>
                      )}
                      {order.status === "READY_FOR_PICKUP" && (
                        <div className="flex-1 py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-green-300">
                          Ready for pickup
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
