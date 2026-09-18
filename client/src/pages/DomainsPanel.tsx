import { useState } from "react";
import { CheckCircle2, CircleAlert, Globe, LoaderCircle, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export default function DomainsPanel({ restaurantId }: { restaurantId: string }) {
  const utils = trpc.useUtils();
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);

  const domains = trpc.admin.listDomains.useQuery({ restaurantId });
  const addDomain = trpc.admin.addDomain.useMutation({
    onSuccess: () => {
      toast.success("Domain added. Configure the CNAME record to verify.");
      setNewDomain("");
      setAdding(false);
      utils.admin.listDomains.invalidate({ restaurantId });
    },
    onError: (err) => toast.error(err.message),
  });
  const verifyDomain = trpc.admin.verifyDomain.useMutation({
    onSuccess: (result) => {
      if (result.verified) {
        toast.success("Domain verified successfully!");
      } else {
        toast.error(result.message ?? "Verification failed");
      }
      utils.admin.listDomains.invalidate({ restaurantId });
    },
    onError: (err) => toast.error(err.message),
  });
  const removeDomain = trpc.admin.removeDomain.useMutation({
    onSuccess: () => {
      toast.success("Domain removed.");
      utils.admin.listDomains.invalidate({ restaurantId });
    },
    onError: (err) => toast.error(err.message),
  });
  const setPrimary = trpc.admin.setPrimaryDomain.useMutation({
    onSuccess: () => {
      toast.success("Primary domain updated.");
      utils.admin.listDomains.invalidate({ restaurantId });
    },
    onError: (err) => toast.error(err.message),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const clean = newDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!clean) return;
    addDomain.mutate({ restaurantId, domain: clean });
  }

  const list = domains.data ?? [];

  if (domains.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-20">
        <LoaderCircle className="h-6 w-6 animate-spin text-gray-500" />
        <span className="ml-2 text-sm font-bold text-gray-500">Loading domains…</span>
      </div>
    );
  }

  if (domains.isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-bold text-red-700">We couldn't load custom domains. Please retry.</p>
        <Button onClick={() => domains.refetch()} variant="outline" className="mt-3 h-11 min-h-[44px] cursor-pointer rounded-xl transition-colors">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900">Custom Domains</h2>
        <p className="text-sm text-gray-500 mt-1">Point your own domain to your storefront. Add a CNAME record at your DNS provider.</p>
      </div>

      {!adding ? (
        <Button onClick={() => setAdding(true)} className="h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] font-extrabold text-white transition-colors hover:bg-[#b03a28] gap-2">
          <Plus className="w-4 h-4" /> Add Domain
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="flex gap-2 items-end bg-white p-4 rounded-2xl border border-gray-200">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-bold text-gray-500">Domain Name</label>
            <Input placeholder="order.yourrestaurant.com" value={newDomain} onChange={e => setNewDomain(e.target.value)} autoFocus className="h-11 rounded-xl border-gray-200" />
          </div>
          <Button type="submit" disabled={addDomain.isPending} className="h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] font-extrabold text-white transition-colors hover:bg-[#b03a28] disabled:opacity-50">
            {addDomain.isPending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : "Add"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setAdding(false); setNewDomain(""); }} className="h-11 min-h-[44px] cursor-pointer rounded-xl transition-colors">
            <X className="w-4 h-4" />
          </Button>
        </form>
      )}

      {list.length === 0 && !adding && (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center">
          <Globe className="w-12 h-12 mx-auto mb-3 text-gray-500 opacity-40" />
          <p className="text-sm font-extrabold text-gray-900">No custom domains configured yet.</p>
          <p className="mt-1 text-xs text-gray-500">Add your store domain to serve the storefront on your own URL.</p>
          <Button onClick={() => setAdding(true)} className="mt-4 h-11 min-h-[44px] cursor-pointer rounded-xl bg-[#c84630] font-extrabold text-white transition-colors hover:bg-[#b03a28]">
            <Plus className="w-4 h-4 mr-1" /> Add Domain
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {list.map(domain => (
          <div key={domain.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between gap-4 transition-colors hover:bg-gray-50">
            <div className="flex items-center gap-3 min-w-0">
              {domain.isVerified ? (
                <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
              ) : (
                <CircleAlert className="w-5 h-5 text-amber-600 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 truncate">{domain.domain}</span>
                  {domain.isPrimary && (
                    <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">Primary</span>
                  )}
                </div>
                <p className="text-xs tabular-nums text-gray-500">
                  {domain.isVerified
                    ? `SSL: ${domain.sslStatus} • Verified ${domain.verifiedAt ? new Date(domain.verifiedAt).toLocaleDateString() : ""}`
                    : `CNAME → cname.yourdomain.com`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!domain.isVerified && (
                <Button size="sm" variant="outline" onClick={() => verifyDomain.mutate({ domainId: domain.id })} disabled={verifyDomain.isPending} className="cursor-pointer transition-colors disabled:opacity-50">
                  {verifyDomain.isPending ? <LoaderCircle className="w-3 h-3 animate-spin" /> : "Verify"}
                </Button>
              )}
              {domain.isVerified && !domain.isPrimary && (
                <Button size="sm" variant="outline" onClick={() => setPrimary.mutate({ domainId: domain.id, restaurantId })} disabled={setPrimary.isPending} className="cursor-pointer transition-colors disabled:opacity-50">
                  Set Primary
                </Button>
              )}
              {domain.isVerified && (
                <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center justify-center h-8 px-3 text-xs font-bold rounded-xl border border-gray-200 transition-colors hover:bg-gray-50">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Visit
                </a>
              )}
              <Button size="sm" variant="ghost" className="cursor-pointer text-red-600 transition-colors hover:text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={removeDomain.isPending} onClick={() => removeDomain.mutate({ domainId: domain.id })}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
