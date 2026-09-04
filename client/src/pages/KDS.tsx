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

function ElapsedTimer({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
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
  if (mins < 10) return "text-green-400";
  if (mins < 20) return "text-yellow-400";
  return "text-red-400";
}

export default function KDSPage({ slug, restaurantId }: { slug?: string; restaurantId?: string }) {
  const [station, setStation] = useState<Station>("all");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [pausedOnError, setPausedOnError] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevCountRef = useRef(0);

  if (!slug) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] text-white flex flex-col items-center justify-center p-6 text-center">
        <ChefHat className="w-12 h-12 mb-4 opacity-40" aria-hidden />
        <p className="text-lg font-bold">No restaurant selected</p>
        <p className="text-sm mt-1 text-gray-400">Open the kitchen display from a restaurant workspace (e.g. /admin/your-slug/kds).</p>
      </div>
    );
  }
  void restaurantId;

  return <KDSBoard slug={slug} station={station} setStation={setStation} soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled} audioCtxRef={audioCtxRef} prevCountRef={prevCountRef} pausedOnError={pausedOnError} setPausedOnError={setPausedOnError} />;
}

function KDSBoard({
  slug, station, setStation, soundEnabled, setSoundEnabled, audioCtxRef, prevCountRef, pausedOnError, setPausedOnError,
}: {
  slug: string;
  station: Station;
  setStation: (s: Station) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  audioCtxRef: React.MutableRefObject<AudioContext | null>;
  prevCountRef: React.MutableRefObject<number>;
  pausedOnError: boolean;
  setPausedOnError: (v: boolean) => void;
}) {

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
    const count = ordersQuery.data?.length ?? 0;
    if (count > prevCountRef.current && prevCountRef.current >= 0) {
      playAlert();
    }
    prevCountRef.current = count;
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
    <div className="min-h-screen bg-[#1a1a1a] text-white flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#222] border-b border-[#333]">
        <div className="flex items-center gap-3">
          <ChefHat className="w-6 h-6 text-orange-400" />
          <h1 className="text-lg font-bold tracking-tight">Kitchen Display</h1>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-gray-400">Active:</span>
            <span className="font-bold">{stats.active}</span>
          </div>
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-gray-400">Preparing:</span>
            <span className="font-bold">{stats.preparing}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-gray-400">Ready:</span>
            <span className="font-bold">{stats.ready}</span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          aria-label={soundEnabled ? "Mute new-order alerts" : "Enable new-order alerts"}
          onClick={() => soundEnabled ? setSoundEnabled(false) : enableSound()}
          className={soundEnabled ? "text-green-400 hover:text-green-300" : "text-gray-500 hover:text-gray-300"}
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
            className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              station === s.id
                ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-[#2a2a2a]"
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
            <LoaderCircle className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : ordersQuery.isError ? (
          <div className="mx-auto max-w-md [&_main]:min-h-0 [&_main]:bg-transparent [&_main]:p-0">
            <AdminError
              message="We couldn't load the kitchen feed. Live updates are paused."
              onRetry={() => {
                setPausedOnError(false);
                ordersQuery.refetch();
              }}
            />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <ChefHat className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">No active orders</p>
            <p className="text-sm mt-1">Orders will appear here when placed</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {orders.map(order => (
              <div key={order.id} className={`rounded-xl border-2 p-4 flex flex-col gap-3 ${urgencyColor(order.createdAt as unknown as string)}`}>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      #{order.trackingToken?.slice(-6) ?? order.id.slice(-6)}
                    </span>
                    <div className={`text-sm font-bold mt-0.5 ${urgencyText(order.createdAt as unknown as string)}`}>
                      <Clock className="w-3 h-3 inline mr-1" />
                      <ElapsedTimer since={order.createdAt as unknown as string} />
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    order.status === "PLACED" ? "bg-blue-500/20 text-blue-400" :
                    order.status === "RESTAURANT_ACCEPTED" ? "bg-purple-500/20 text-purple-400" :
                    order.status === "PREPARING" ? "bg-orange-500/20 text-orange-400" :
                    "bg-green-500/20 text-green-400"
                  }`}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                </div>

                {/* Items */}
                <div className="space-y-1.5 flex-1">
                  {(order as any).items?.map((item: any) => (
                    <div key={item.id} className="flex items-start gap-2 text-sm">
                      <span className="font-bold text-white/90 w-5 shrink-0">{item.quantity}x</span>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.itemNameSnapshot}</p>
                        {item.variantNameSnapshot && (
                          <p className="text-xs text-gray-400">{item.variantNameSnapshot}</p>
                        )}
                        {item.selectedModifiers?.length > 0 && (
                          <p className="text-xs text-gray-500 italic">
                            + {item.selectedModifiers.map((m: any) => m.optionName).join(", ")}
                          </p>
                        )}
                        {item.specialInstructions && (
                          <p className="text-xs text-yellow-400 font-semibold mt-0.5">
                            Note: {item.specialInstructions}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-white/10">
                  {order.status === "PLACED" && (
                    <Button
                      size="sm"
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
                      onClick={() => acceptOrder.mutate({ orderId: order.id, slug })}
                      disabled={acceptOrder.isPending}
                    >
                      Accept
                    </Button>
                  )}
                  {(order.status === "PLACED" || order.status === "RESTAURANT_ACCEPTED") && (
                    <Button
                      size="sm"
                      className="flex-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold"
                      onClick={() => setPreparing.mutate({ orderId: order.id, slug })}
                      disabled={setPreparing.isPending}
                    >
                      <Flame className="w-3 h-3 mr-1" /> Start
                    </Button>
                  )}
                  {order.status !== "READY_FOR_PICKUP" && (
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold"
                      onClick={() => bumpOrder.mutate({ orderId: order.id, slug })}
                      disabled={bumpOrder.isPending}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
                    </Button>
                  )}
                  {order.status === "READY_FOR_PICKUP" && (
                    <div className="flex-1 text-center text-xs font-bold text-green-400 py-1.5">
                      READY FOR PICKUP
                    </div>
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
