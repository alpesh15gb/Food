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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Custom Domains</h2>
        <p className="text-sm text-gray-600 mt-1">Point your own domain to your storefront. Add a CNAME record at your DNS provider.</p>
      </div>

      {!adding ? (
        <Button onClick={() => setAdding(true)} className="bg-gray-900 hover:bg-gray-800 text-white gap-2">
          <Plus className="w-4 h-4" /> Add Domain
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="flex gap-2 items-end bg-white p-4 rounded-xl border border-gray-200">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-gray-600">Domain Name</label>
            <Input placeholder="order.yourrestaurant.com" value={newDomain} onChange={e => setNewDomain(e.target.value)} autoFocus />
          </div>
          <Button type="submit" disabled={addDomain.isPending} className="bg-gray-900 hover:bg-gray-800 text-white">
            {addDomain.isPending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : "Add"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setAdding(false); setNewDomain(""); }}>
            <X className="w-4 h-4" />
          </Button>
        </form>
      )}

      {list.length === 0 && !adding && (
        <div className="text-center py-12 text-gray-400">
          <Globe className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No custom domains configured yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {list.map(domain => (
          <div key={domain.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {domain.isVerified ? (
                <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
              ) : (
                <CircleAlert className="w-5 h-5 text-amber-500 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{domain.domain}</span>
                  {domain.isPrimary && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-900 text-white px-1.5 py-0.5 rounded">Primary</span>
                  )}
                </div>
                <p className="text-xs text-gray-600">
                  {domain.isVerified
                    ? `SSL: ${domain.sslStatus} • Verified ${domain.verifiedAt ? new Date(domain.verifiedAt).toLocaleDateString() : ""}`
                    : `CNAME → cname.yourdomain.com`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!domain.isVerified && (
                <Button size="sm" variant="outline" onClick={() => verifyDomain.mutate({ domainId: domain.id })} disabled={verifyDomain.isPending}>
                  {verifyDomain.isPending ? <LoaderCircle className="w-3 h-3 animate-spin" /> : "Verify"}
                </Button>
              )}
              {domain.isVerified && !domain.isPrimary && (
                <Button size="sm" variant="outline" onClick={() => setPrimary.mutate({ domainId: domain.id, restaurantId })}>
                  Set Primary
                </Button>
              )}
              {domain.isVerified && (
                <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-md border border-gray-200 hover:bg-gray-50">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Visit
                </a>
              )}
              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeDomain.mutate({ domainId: domain.id })}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
