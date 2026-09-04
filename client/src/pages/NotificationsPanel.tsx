import { trpc } from "@/lib/trpc";
import { Bell, Check, Loader2, MessageSquare, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminError } from "@/components/DashboardLayout";

const NOTIFICATION_TYPES = [
  { key: "notifications_order_confirmed", label: "Order Confirmed", description: "Sent when restaurant accepts the order" },
  { key: "notifications_preparing", label: "Preparing", description: "Sent when kitchen starts preparing" },
  { key: "notifications_out_for_delivery", label: "Out for Delivery", description: "Sent when rider picks up the order" },
  { key: "notifications_delivered", label: "Delivered", description: "Sent when order is delivered" },
  { key: "notifications_cancelled", label: "Cancelled", description: "Sent when order is cancelled or rejected" },
];

export default function NotificationsPanel({ restaurantId }: { restaurantId: string }) {
  const settingsQuery = trpc.admin.getNotificationSettings.useQuery({ restaurantId }, { retry: false });
  const { data: settings, isLoading, refetch } = settingsQuery;
  const updateMutation = trpc.admin.updateNotificationSetting.useMutation({
    onSuccess: () => {
      toast.success("Notification setting saved");
      refetch();
    },
    onError: (err) => toast.error(err.message || "Could not save notification setting."),
  });
  const [toggling, setToggling] = useState<string | null>(null);

  const isEnabled = (key: string) => {
    const setting = settings?.find(s => s.key === key);
    return setting ? setting.value !== "false" : true;
  };

  const handleToggle = async (key: string) => {
    setToggling(key);
    try {
      const current = isEnabled(key);
      await updateMutation.mutateAsync({
        restaurantId,
        key,
        value: current ? "false" : "true",
      });
    } catch {
      // Error toast is handled by the mutation's onError.
    } finally {
      setToggling(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <AdminError
        message="We couldn't load notification settings. Please retry."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure WhatsApp and SMS notifications sent to customers at each order stage.
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold">WhatsApp / SMS Alerts</h2>
              <p className="text-xs text-muted-foreground">
                Notifications are sent via WhatsApp Business API with SMS fallback.
                Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID env vars to enable.
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y">
          {NOTIFICATION_TYPES.map((type) => {
            const enabled = isEnabled(type.key);
            const isToggling = toggling === type.key;

            return (
              <div key={type.key} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${enabled ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {enabled ? <Check className="h-4 w-4" /> : <Bell className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <p className="font-medium">{type.label}</p>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleToggle(type.key)}
                  disabled={isToggling}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${type.label} notifications`}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${enabled ? "bg-green-600" : "bg-muted"} ${isToggling ? "opacity-50" : ""}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-dashed p-6">
        <div className="flex items-start gap-3">
          <Phone className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">Provider Configuration</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure notification providers via environment variables on your server:
            </p>
            <ul className="mt-2 space-y-1 text-xs font-mono text-muted-foreground">
              <li>WHATSAPP_ACCESS_TOKEN — Meta Cloud API access token</li>
              <li>WHATSAPP_PHONE_NUMBER_ID — WhatsApp Business phone number ID</li>
              <li>MSG91_AUTH_KEY — MSG91 API key for SMS fallback</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
