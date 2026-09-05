/** Secure integration workspace: owner admins can add values over HTTPS; the server encrypts and never returns them. */
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, Split } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminError } from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";

type Provider = "razorpay" | "otp" | "delivery";
type SecretDrafts = Record<string, string>;

// The status feed labels the delivery service "delivery", but the vault
// mutations canonically use "shadowfax" — map before saving/verifying.
function toMutationProvider(provider: string): "razorpay" | "otp" | "shadowfax" {
  return provider === "delivery" ? "shadowfax" : (provider as "razorpay" | "otp" | "shadowfax");
}

export default function IntegrationPanel({ restaurantId }: { restaurantId?: string }) {
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<SecretDrafts>({});
  const [openProvider, setOpenProvider] = useState<Provider | null>(null);
  const [routeForm, setRouteForm] = useState({ contactEmail: "", contactPhone: "", legalBusinessName: "", pan: "", gstin: "" });
  const [feeInput, setFeeInput] = useState("");
  const rid = restaurantId || "";

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
      utils.admin.integrationStatus.invalidate({ restaurantId: rid });
      toast.success(`${value.keyName} saved securely`, { description: "The value is encrypted on the server and will not be shown again." });
    },
    onError: error => toast.error(error.message),
  });

  const setupRoute = trpc.admin.setupRazorpayRoute.useMutation({
    onSuccess: () => {
      utils.admin.getRazorpayRouteStatus.invalidate({ restaurantId: rid });
      toast.success("Razorpay Route account linked", { description: "Payments will now auto-split to the restaurant account." });
    },
    onError: error => toast.error(error.message),
  });

  const updateFee = trpc.admin.updatePlatformFee.useMutation({
    onSuccess: () => {
      utils.admin.getRazorpayRouteStatus.invalidate({ restaurantId: rid });
      toast.success("Platform fee updated");
    },
    onError: error => toast.error(error.message),
  });

  const routeData = routeStatusQuery.data;
  useEffect(() => {
    if (routeData && feeInput === "") {
      setFeeInput(String(routeData.platformFeePercent ?? 0));
    }
  }, [routeData, feeInput]);

  if (!restaurantId) {
    return (
      <AdminError message="We couldn't determine which restaurant these integrations belong to." />
    );
  }

  if (integrationQuery.isLoading) {
    return <div className="grid min-h-72 place-items-center rounded-2xl bg-[#fffdf9] text-sm font-bold text-[#8a6a56]"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Checking connection readiness…</div>;
  }

  if (integrationQuery.isError || !integrationQuery.data) {
    return (
      <AdminError
        message="We couldn't read the integration status. Please refresh the workspace."
        onRetry={() => integrationQuery.refetch()}
      />
    );
  }

  const services = Object.values(integrationQuery.data);
  const isRouteActive = routeData?.status === "active";

  return (
    <div className="space-y-5">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl bg-[#2A3A0C] p-6 text-white shadow-sm">
        <div className="absolute -right-6 -top-10 h-36 w-36 rounded-full border-[18px] border-[#B95509]/30" />
        <div className="relative grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#e7b99d]">Owner configuration</p>
            <h2 className="font-display mt-2 text-3xl">Secure connection vault</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
              Save provider values through this owner-only panel. Each value is encrypted before database storage, never rendered again, and only used by the server when a provider call is required.
            </p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[#f8d7be]">
            <ShieldCheck className="h-6 w-6" />
          </span>
        </div>
      </section>

      {/* Provider Cards */}
      <section className="grid gap-4 xl:grid-cols-3">
        {services.map(service => {
          const isOpen = openProvider === service.provider;
          return (
            <article key={service.provider} className="rounded-2xl bg-[#fffdf9] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${service.ready ? "bg-[#e5f1e5] text-[#42774b]" : "bg-[#E9EFD6] text-[#B95509]"}`}>
                  {service.ready ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${service.ready ? "bg-[#e5f1e5] text-[#42774b]" : "bg-[#f8e9dd] text-[#a54c34]"}`}>
                  {service.ready ? "Configured" : "Needs setup"}
                </span>
              </div>
              <h3 className="mt-5 text-base font-extrabold text-[#39281e]">{service.name}</h3>
              <p className="mt-2 min-h-10 text-xs leading-relaxed text-[#886956]">{service.detail}</p>
              <Button onClick={() => setOpenProvider(isOpen ? null : service.provider as Provider)} variant="outline" className="mt-5 h-10 w-full rounded-xl border-[#dcc2ae] bg-[#E9EFD6] text-xs font-extrabold text-[#3F4C1E]">
                <KeyRound className="mr-2 h-4 w-4" />
                {isOpen ? "Close secure fields" : service.ready ? "Replace secure values" : "Add secure values"}
              </Button>
              {isOpen && (
                <div className="mt-4 space-y-3 border-t border-dashed border-[#e6d6c8] pt-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#5F6B3C]">Values are masked after save</p>
                  {service.requiredSecrets.map(keyName => (
                    <div key={keyName}>
                      <label className="text-xs font-extrabold text-[#2A3A0C]">{keyName}</label>
                      <div className="mt-1.5 flex gap-2">
                        <Input value={drafts[keyName] ?? ""} onChange={event => setDrafts(current => ({ ...current, [keyName]: event.target.value }))} type="password" autoComplete="off" placeholder="Paste secure value" className="h-10 rounded-xl border-[#D8DFC0] text-xs" />
                        <Button aria-label={`Save ${keyName}`} disabled={!rid || !drafts[keyName]?.trim() || saveSecret.isPending} onClick={() => saveSecret.mutate({ restaurantId: rid, provider: toMutationProvider(service.provider), keyName, value: drafts[keyName] })} className="h-10 shrink-0 rounded-xl bg-[#B95509] px-3 font-extrabold hover:bg-[#9C4A07]">
                          {saveSecret.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                        <Button aria-label={`Verify ${keyName}`} variant="outline" disabled={!rid || verifySecret.isPending} onClick={() => verifySecret.mutate({ restaurantId: rid, provider: toMutationProvider(service.provider), keyName })} className="h-10 shrink-0 rounded-xl border-[#D8DFC0] px-3 text-xs font-extrabold text-[#3F4C1E]">Check</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {/* Razorpay Route — Split Settlement */}
      <section className="rounded-2xl bg-[#fffdf9] p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${isRouteActive ? "bg-[#e5f1e5] text-[#42774b]" : "bg-[#E9EFD6] text-[#B95509]"}`}>
              <Split className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-[#39281e]">Razorpay Route</h3>
              <p className="text-xs text-[#886956]">Auto-split payments between platform and restaurant</p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${
            isRouteActive ? "bg-[#e5f1e5] text-[#42774b]" :
            routeData?.status === "pending" ? "bg-[#fef3cd] text-[#856404]" :
            "bg-[#f8e9dd] text-[#a54c34]"
          }`}>
            {isRouteActive ? "Active" : routeData?.status ?? "Not linked"}
          </span>
        </div>

        {!isRouteActive && (
          <div className="mt-5 space-y-3 border-t border-dashed border-[#e6d6c8] pt-5">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#5F6B3C]">Link a Razorpay sub-account for automatic settlement</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-extrabold text-[#2A3A0C]">Contact email</label>
                <Input value={routeForm.contactEmail} onChange={e => setRouteForm(f => ({ ...f, contactEmail: e.target.value }))} type="email" placeholder="restaurant@example.com" className="mt-1.5 h-10 rounded-xl border-[#D8DFC0] text-xs" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-[#2A3A0C]">Contact phone</label>
                <Input value={routeForm.contactPhone} onChange={e => setRouteForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="+91 98765 43210" className="mt-1.5 h-10 rounded-xl border-[#D8DFC0] text-xs" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-[#2A3A0C]">Legal business name</label>
                <Input value={routeForm.legalBusinessName} onChange={e => setRouteForm(f => ({ ...f, legalBusinessName: e.target.value }))} placeholder="Optional" className="mt-1.5 h-10 rounded-xl border-[#D8DFC0] text-xs" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-[#2A3A0C]">PAN</label>
                <Input value={routeForm.pan} onChange={e => setRouteForm(f => ({ ...f, pan: e.target.value }))} placeholder="ABCDE1234F" className="mt-1.5 h-10 rounded-xl border-[#D8DFC0] text-xs" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-[#2A3A0C]">GSTIN</label>
                <Input value={routeForm.gstin} onChange={e => setRouteForm(f => ({ ...f, gstin: e.target.value }))} placeholder="29ABCDE1234F1Z5" className="mt-1.5 h-10 rounded-xl border-[#D8DFC0] text-xs" />
              </div>
            </div>
            <Button
              disabled={!rid || !routeForm.contactEmail || !routeForm.contactPhone || setupRoute.isPending}
              onClick={() => setupRoute.mutate({ restaurantId: rid, ...routeForm })}
              className="mt-2 h-10 rounded-xl bg-[#B95509] px-5 font-extrabold hover:bg-[#9C4A07]"
            >
              {setupRoute.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
              Link Razorpay Route Account
            </Button>
          </div>
        )}

        {isRouteActive && (
          <div className="mt-5 space-y-3 border-t border-dashed border-[#e6d6c8] pt-5">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs font-extrabold text-[#2A3A0C]">Platform fee (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder={String(routeData?.platformFeePercent ?? 0)}
                  value={feeInput}
                  onChange={e => setFeeInput(e.target.value)}
                  className="mt-1.5 h-10 rounded-xl border-[#D8DFC0] text-xs"
                />
              </div>
              <Button
                disabled={!rid || updateFee.isPending}
                onClick={() => {
                  const pct = parseFloat(feeInput);
                  if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
                    updateFee.mutate({ restaurantId: rid, percent: pct });
                  } else {
                    toast.error("Enter a valid percentage (0–100)");
                  }
                }}
                className="h-10 rounded-xl bg-[#B95509] px-5 font-extrabold hover:bg-[#9C4A07]"
              >
                {updateFee.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Update fee"}
              </Button>
            </div>
            <p className="text-[10px] text-[#886956]">
              Linked account: <code className="rounded bg-[#E9EFD6] px-1.5 py-0.5 text-[10px] font-bold text-[#2A3A0C]">{routeData?.accountId}</code>
            </p>
          </div>
        )}
      </section>

      {/* Security notice */}
      <section className="rounded-2xl border border-[#D8DFC0] bg-[#E9EFD6] p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[#aa432e]"><LockKeyhole className="h-5 w-5" /></span>
          <p className="text-xs leading-relaxed text-[#73513e]">
            <strong>Security boundary.</strong> Do not use this panel for passwords intended for people. Use it only for provider API values. Saved values are encrypted, withheld from all API responses and logs, and unavailable to standard staff accounts.
          </p>
        </div>
      </section>
    </div>
  );
}
