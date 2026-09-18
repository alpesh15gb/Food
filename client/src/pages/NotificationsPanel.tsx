import { trpc } from "@/lib/trpc";
import { Bell, Check, Loader2, MessageSquare, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminError } from "@/components/DashboardLayout";

type NotificationKey =
  | "notifications_order_confirmed"
  | "notifications_preparing"
  | "notifications_out_for_delivery"
  | "notifications_delivered"
  | "notifications_cancelled";

const NOTIFICATION_TYPES: Array<{ key: NotificationKey; label: string; description: string }> = [
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
  const [toggling, setToggling] = useState<NotificationKey | null>(null);

  const isEnabled = (key: NotificationKey) => {
    const setting = settings?.find(s => s.key === key);
    return setting ? setting.value !== "false" : true;
  };

  const handleToggle = async (key: NotificationKey) => {
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
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        <span className="ml-2 text-sm font-bold text-gray-500">Loading notification settings…</span>
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Notifications</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure WhatsApp and SMS notifications sent to customers at each order stage.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50 text-green-700">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-extrabold text-gray-900">WhatsApp / SMS Alerts</h2>
              <p className="text-xs text-gray-500">
                Notifications are sent via WhatsApp Business API with SMS fallback.
                Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID env vars to enable.
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {NOTIFICATION_TYPES.map((type) => {
            const enabled = isEnabled(type.key);
            const isToggling = toggling === type.key;

            return (
              <div key={type.key} className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50">
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {enabled ? <Check className="h-4 w-4" /> : <Bell className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{type.label}</p>
                    <p className="text-xs text-gray-500">{type.description}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleToggle(type.key)}
                  disabled={isToggling}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${type.label} notifications`}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${enabled ? "bg-green-600" : "bg-gray-200"} ${isToggling ? "opacity-50" : ""}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <Phone className="mt-0.5 h-5 w-5 text-gray-500" />
          <div>
            <h3 className="font-extrabold text-gray-900">Provider Configuration</h3>
            <p className="mt-1 text-sm text-gray-500">
              Configure notification providers via environment variables on your server:
            </p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-gray-500">
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
