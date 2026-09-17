/** Secure integration workspace: owner admins can add values over HTTPS; the server encrypts and never returns them. */
import { useState } from "react";
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, Split } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

type Provider = "razorpay" | "otp" | "delivery";
type SecretDrafts = Record<string, string>;

export default function IntegrationPanel({ restaurantId }: { restaurantId?: string }) {
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<SecretDrafts>({});
  const [openProvider, setOpenProvider] = useState<Provider | null>(null);
  const rid = restaurantId || "";

  // Never fire with an empty id: the server rejects restaurantId < 4 chars,
  // and the resulting 400 wedges the whole panel into its error state.
  const integrationQuery = trpc.admin.integrationStatus.useQuery(
    { restaurantId: rid },
    { enabled: !!rid, retry: false }
  );
  const routeStatusQuery = trpc.admin.getRazorpayRouteStatus.useQuery(
    { restaurantId: rid },
    { enabled: !!rid, retry: false }
  );

  const verifySecret = trpc.admin.verifyIntegrationSecret.useMutation({
    onSuccess: result => toast.success(
      result.readable ? "Encrypted value is readable by the server" : "The server could not read this value",
      { description: result.readable ? "The plaintext remains hidden from the browser." : "Save the value again before using this provider." },
    ),
    onError: error => toast.error(error.message),
  });

  const saveSecret = trpc.admin.saveIntegrationSecret.useMutation({
    onSuccess: (_result, value) => {
      setDrafts(current => ({ ...current, [value.keyName]: "" }));
      utils.admin.integrationStatus.invalidate();
      toast.success(`${value.keyName} saved securely`, { description: "The value is encrypted on the server and will not be shown again." });
    },
    onError: error => toast.error(error.message),
  });

  const setupRoute = trpc.admin.setupRazorpayRoute.useMutation({
    onSuccess: () => {
      utils.admin.getRazorpayRouteStatus.invalidate();
      toast.success("Razorpay Route account linked", { description: "Payments will now auto-split to the restaurant account." });
    },
    onError: error => toast.error(error.message),
  });

  const updateFee = trpc.admin.updatePlatformFee.useMutation({
    onSuccess: () => {
      utils.admin.getRazorpayRouteStatus.invalidate();
      toast.success("Platform fee updated");
    },
    onError: error => toast.error(error.message),
  });

  // Live provider credential checks (read-only; secrets never leave the server).
  const [deliveryPincodes, setDeliveryPincodes] = useState({ pickup: "", delivery: "" });
  const [connResult, setConnResult] = useState<Record<string, { ok: boolean; text: string }>>({});

  const testRazorpay = trpc.admin.testRazorpayConnection.useMutation({
    onSuccess: result => {
      const text = result.ok
        ? `Connected in ${result.mode} mode (key ${result.keyPrefix}…)`
        : (result.error ?? "Connection failed");
      setConnResult(current => ({ ...current, razorpay: { ok: result.ok, text } }));
      if (result.ok) toast.success(`Razorpay connected (${result.mode} mode)`);
      else toast.error(result.error ?? "Razorpay connection failed");
    },
    onError: error => toast.error(error.message),
  });

  const testDelivery = trpc.admin.testDeliveryConnection.useMutation({
    onSuccess: result => {
      const text = result.ok
        ? (result.serviceable === undefined
            ? `Token valid on Shadowfax ${result.environment}`
            : result.serviceable
              ? `Pincodes serviceable on Shadowfax ${result.environment}`
              : `Token valid, but pincodes NOT serviceable (${result.environment})`)
        : (result.error ?? "Connection failed");
      setConnResult(current => ({ ...current, delivery: { ok: result.ok, text } }));
      if (result.ok) toast.success("Shadowfax token valid", { description: text });
      else toast.error(result.error ?? "Shadowfax connection failed");
    },
    onError: error => toast.error(error.message),
  });

  const [routeForm, setRouteForm] = useState({ contactEmail: "", contactPhone: "", legalBusinessName: "", pan: "", gstin: "" });
  const [feeInput, setFeeInput] = useState("");

  if (!restaurantId) {
    return <div className="rounded-2xl bg-red-50 p-5 text-sm font-bold text-red-600">We couldn't determine which restaurant these integrations belong to.</div>;
  }

  if (integrationQuery.isLoading) {
    return <div className="grid min-h-72 place-items-center rounded-2xl bg-white text-sm font-bold text-gray-500"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Checking connection readiness…</div>;
  }

  if (!integrationQuery.data) {
    return <div className="rounded-2xl bg-red-50 p-5 text-sm font-bold text-red-600">We couldn't read the integration status. Please refresh the workspace.</div>;
  }

  const services = Object.values(integrationQuery.data);
  const routeData = routeStatusQuery.data;
  const isRouteActive = routeData?.status === "active";

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl bg-gray-900 p-6 text-white shadow-sm">
        <div className="absolute -right-6 -top-10 h-36 w-36 rounded-full border-[18px] border-[#c84630]/30" />
        <div className="relative grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-gray-300">Owner configuration</p>
            <h2 className="font-extrabold tracking-tight mt-2 text-3xl">Secure connection vault</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
              Save provider values through this owner-only panel. Each value is encrypted before database storage, never rendered again, and only used by the server when a provider call is required.
            </p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-gray-300">
            <ShieldCheck className="h-6 w-6" />
          </span>
        </div>
      </section>

      {/* Provider Cards */}
      <section className="grid gap-4 xl:grid-cols-3">
        {services.map(service => {
          const isOpen = openProvider === service.provider;
          return (
            <article key={service.provider} className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${service.ready ? "bg-[#e5f1e5] text-[#42774b]" : "bg-gray-50 text-[#c84630]"}`}>
                  {service.ready ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${service.ready ? "bg-[#e5f1e5] text-[#42774b]" : "bg-gray-50 text-[#c84630]"}`}>
                    {service.ready ? "Configured" : "Needs setup"}
                  </span>
                  {"mode" in service && (service as { mode?: string }).mode !== "unknown" && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-gray-600">
                      {(service as { mode?: string }).mode === "test" ? "Test mode" : "Live mode"}
                    </span>
                  )}
                  {"environment" in service && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-gray-600">
                      {(service as { environment?: string }).environment === "staging" ? "Staging" : "Production"}
                    </span>
                  )}
                </span>
              </div>
              <h3 className="mt-5 text-base font-extrabold text-gray-900">{service.name}</h3>
              <p className="mt-2 min-h-10 text-xs leading-relaxed text-gray-500">{service.detail}</p>
              <Button onClick={() => setOpenProvider(isOpen ? null : service.provider as Provider)} variant="outline" className="mt-5 h-10 w-full rounded-xl border-gray-200 bg-white text-xs font-extrabold text-gray-600">
                <KeyRound className="mr-2 h-4 w-4" />
                {isOpen ? "Close secure fields" : service.ready ? "Replace secure values" : "Add secure values"}
              </Button>
              {isOpen && (
                <div className="mt-4 space-y-3 border-t border-dashed border-gray-200 pt-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500">Values are masked after save</p>
                  {service.requiredSecrets.map(keyName => (
                    <div key={keyName}>
                      <label className="text-xs font-extrabold text-gray-700">
                        {keyName}
                        {keyName === "SHADOWFAX_API_BASE_URL" && (
                          <span className="ml-1.5 font-bold text-gray-500">(optional — staging override, e.g. https://dale.staging.shadowfax.in/api)</span>
                        )}
                      </label>
                      <div className="mt-1.5 flex gap-2">
                        <Input value={drafts[keyName] ?? ""} onChange={event => setDrafts(current => ({ ...current, [keyName]: event.target.value }))} type="password" autoComplete="off" placeholder="Paste secure value" className="h-10 rounded-xl border-gray-200 text-xs" />
                        <Button aria-label={`Save ${keyName}`} disabled={!rid || !drafts[keyName]?.trim() || saveSecret.isPending} onClick={() => saveSecret.mutate({ restaurantId: rid, provider: service.provider as Provider, keyName, value: drafts[keyName] })} className="h-10 shrink-0 rounded-xl bg-[#c84630] px-3 font-extrabold hover:bg-[#b03a28]">
                          {saveSecret.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                        <Button aria-label={`Verify ${keyName}`} variant="outline" disabled={verifySecret.isPending} onClick={() => verifySecret.mutate({ restaurantId: rid, provider: service.provider as Provider, keyName })} className="h-10 shrink-0 rounded-xl border-gray-200 px-3 text-xs font-extrabold text-gray-600">Check</Button>
                      </div>
                    </div>
                  ))}
                  {(service.provider === "razorpay" || service.provider === "delivery") && (
                    <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500">Live connection test (read-only)</p>
                      {service.provider === "delivery" && (
                        <div className="grid grid-cols-2 gap-2">
                          <Input value={deliveryPincodes.pickup} onChange={e => setDeliveryPincodes(p => ({ ...p, pickup: e.target.value.replace(/\D/g, "").slice(0, 6) }))} inputMode="numeric" placeholder="Pickup pincode" className="h-9 rounded-xl border-gray-200 text-xs" />
                          <Input value={deliveryPincodes.delivery} onChange={e => setDeliveryPincodes(p => ({ ...p, delivery: e.target.value.replace(/\D/g, "").slice(0, 6) }))} inputMode="numeric" placeholder="Delivery pincode" className="h-9 rounded-xl border-gray-200 text-xs" />
                        </div>
                      )}
                      <Button
                        variant="outline"
                        disabled={!rid || testRazorpay.isPending || testDelivery.isPending}
                        onClick={() => {
                          if (service.provider === "razorpay") {
                            testRazorpay.mutate({ restaurantId: rid });
                          } else {
                            const six = (v: string) => (/^\d{6}$/.test(v) ? v : undefined);
                            testDelivery.mutate({
                              restaurantId: rid,
                              pickupPincode: six(deliveryPincodes.pickup),
                              deliveryPincode: six(deliveryPincodes.delivery),
                            });
                          }
                        }}
                        className="h-9 w-full rounded-xl border-gray-200 text-xs font-extrabold text-gray-600"
                      >
                        {(testRazorpay.isPending || testDelivery.isPending) && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        Test live connection
                      </Button>
                      {connResult[service.provider] && (
                        <p className={`text-xs font-bold ${connResult[service.provider].ok ? "text-[#42774b]" : "text-[#c84630]"}`}>
                          {connResult[service.provider].ok ? "✓ " : "✗ "}{connResult[service.provider].text}
                        </p>
                      )}
                    </div>
                  )}
                  {"webhookConfigured" in service && (
                    <p className="text-[11px] leading-relaxed text-gray-500">
                      Webhook secret (server env <code className="rounded bg-gray-100 px-1 py-0.5 font-bold text-gray-700">{service.provider === "razorpay" ? "RAZORPAY_WEBHOOK_SECRET" : "SHADOWFAX_WEBHOOK_SECRET"}</code>):{" "}
                      {(service as { webhookConfigured?: boolean }).webhookConfigured
                        ? <span className="font-extrabold text-[#42774b]">set ✓</span>
                        : <span className="font-extrabold text-[#c84630]">missing — webhooks will be rejected until it is set on the server</span>}
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {/* Razorpay Route — Split Settlement */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${isRouteActive ? "bg-[#e5f1e5] text-[#42774b]" : "bg-gray-50 text-[#c84630]"}`}>
              <Split className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-gray-900">Razorpay Route</h3>
              <p className="text-xs text-gray-500">Auto-split payments between platform and restaurant</p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${
            isRouteActive ? "bg-[#e5f1e5] text-[#42774b]" :
            routeData?.status === "pending" ? "bg-[#fef3cd] text-[#856404]" :
            "bg-gray-50 text-[#c84630]"
          }`}>
            {isRouteActive ? "Active" : routeData?.status ?? "Not linked"}
          </span>
        </div>

        {!isRouteActive && (
          <div className="mt-5 space-y-3 border-t border-dashed border-gray-200 pt-5">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-gray-500">Link a Razorpay sub-account for automatic settlement</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-extrabold text-gray-700">Contact email</label>
                <Input value={routeForm.contactEmail} onChange={e => setRouteForm(f => ({ ...f, contactEmail: e.target.value }))} type="email" placeholder="restaurant@example.com" className="mt-1.5 h-10 rounded-xl border-gray-200 text-xs" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700">Contact phone</label>
                <Input value={routeForm.contactPhone} onChange={e => setRouteForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="+91 98765 43210" className="mt-1.5 h-10 rounded-xl border-gray-200 text-xs" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700">Legal business name</label>
                <Input value={routeForm.legalBusinessName} onChange={e => setRouteForm(f => ({ ...f, legalBusinessName: e.target.value }))} placeholder="Optional" className="mt-1.5 h-10 rounded-xl border-gray-200 text-xs" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700">PAN</label>
                <Input value={routeForm.pan} onChange={e => setRouteForm(f => ({ ...f, pan: e.target.value }))} placeholder="ABCDE1234F" className="mt-1.5 h-10 rounded-xl border-gray-200 text-xs" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-gray-700">GSTIN</label>
                <Input value={routeForm.gstin} onChange={e => setRouteForm(f => ({ ...f, gstin: e.target.value }))} placeholder="29ABCDE1234F1Z5" className="mt-1.5 h-10 rounded-xl border-gray-200 text-xs" />
              </div>
            </div>
            <Button
              disabled={!routeForm.contactEmail || !routeForm.contactPhone || setupRoute.isPending}
              onClick={() => setupRoute.mutate({ restaurantId: rid, ...routeForm })}
              className="mt-2 h-10 rounded-xl bg-[#c84630] px-5 font-extrabold hover:bg-[#b03a28]"
            >
              {setupRoute.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              Link Razorpay Route Account
            </Button>
          </div>
        )}

        {isRouteActive && (
          <div className="mt-5 space-y-3 border-t border-dashed border-gray-200 pt-5">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs font-extrabold text-gray-700">Platform fee (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={feeInput || String(routeData?.platformFeePercent ?? 0)}
                  onChange={e => setFeeInput(e.target.value)}
                  className="mt-1.5 h-10 rounded-xl border-gray-200 text-xs"
                />
              </div>
              <Button
                disabled={updateFee.isPending}
                onClick={() => {
                  const pct = parseFloat(feeInput);
                  if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
                    updateFee.mutate({ restaurantId: rid, percent: pct });
                  } else {
                    toast.error("Enter a valid percentage (0–100)");
                  }
                }}
                className="h-10 rounded-xl bg-[#c84630] px-5 font-extrabold hover:bg-[#b03a28]"
              >
                {updateFee.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Update fee"}
              </Button>
            </div>
            <p className="text-[10px] text-gray-500">
              Linked account: <code className="rounded bg-gray-50 px-1.5 py-0.5 text-[10px] font-bold text-gray-700">{routeData?.accountId}</code>
            </p>
          </div>
        )}
      </section>

      {/* Security notice */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[#c84630]"><LockKeyhole className="h-5 w-5" /></span>
          <p className="text-xs leading-relaxed text-gray-600">
            <strong>Security boundary.</strong> Do not use this panel for passwords intended for people. Use it only for provider API values. Saved values are encrypted, withheld from all API responses and logs, and unavailable to standard staff accounts.
          </p>
        </div>
      </section>
    </div>
  );
}
