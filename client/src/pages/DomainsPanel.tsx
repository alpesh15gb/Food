import { useState } from "react";
import { CheckCircle2, CircleAlert, Copy, Globe, LoaderCircle, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminError } from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";

export default function DomainsPanel({ restaurantId }: { restaurantId: string }) {
  const utils = trpc.useUtils();
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [cnameTarget, setCnameTarget] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const domains = trpc.admin.listDomains.useQuery({ restaurantId }, { retry: false });
  const addDomain = trpc.admin.addDomain.useMutation({
    onSuccess: (result) => {
      // Render the server-provided CNAME target so DNS is configured correctly.
      setCnameTarget((result as { cnameTarget?: string })?.cnameTarget ?? null);
      toast.success("Domain added. Configure the CNAME record to verify.");
      setNewDomain("");
      setAdding(false);
      utils.admin.listDomains.invalidate({ restaurantId });
    },
    onError: (err) => toast.error(err.message || "Could not add domain."),
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
    onError: (err) => toast.error(err.message || "Verification failed."),
  });
  const removeDomain = trpc.admin.removeDomain.useMutation({
    onSuccess: () => {
      toast.success("Domain removed.");
      setDeleteId(null);
      utils.admin.listDomains.invalidate({ restaurantId });
    },
    onError: (err) => toast.error(err.message || "Could not remove domain."),
  });
  const setPrimary = trpc.admin.setPrimaryDomain.useMutation({
    onSuccess: () => {
      toast.success("Primary domain updated.");
      utils.admin.listDomains.invalidate({ restaurantId });
    },
    onError: (err) => toast.error(err.message || "Could not update primary domain."),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const noProto = newDomain.trim().toLowerCase().replace(/^https?:\/\//, "");
    const clean = noProto.split("/")[0].split(":")[0].replace(/\.+$/, "");
    if (!clean) return;
    if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(clean) || clean.length < 4 || clean.length > 253 || !clean.includes(".")) {
      toast.error("Enter a valid domain name (e.g. order.yourrestaurant.com).");
      return;
    }
    addDomain.mutate({ restaurantId, domain: clean });
  }

  async function copyCname(target: string) {
    try {
      await navigator.clipboard.writeText(target);
      toast.success("CNAME target copied.");
    } catch {
      toast.error("Could not copy. Select and copy the value manually.");
    }
  }

  const list = domains.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#38271F]" style={{ fontFamily: "var(--font-display)" }}>Custom Domains</h2>
        <p className="text-sm text-[#6b5c52] mt-1">Point your own domain to your storefront. Add a CNAME record at your DNS provider.</p>
      </div>

      {cnameTarget && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e8ddd0] bg-white p-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#6b5c52]">Point your CNAME record to</p>
            <code className="mt-1 block truncate rounded bg-[#f7f2eb] px-2 py-1 text-sm font-bold text-[#38271F]">{cnameTarget}</code>
          </div>
          <Button size="sm" variant="outline" onClick={() => copyCname(cnameTarget)} aria-label="Copy CNAME target">
            <Copy className="w-3 h-3 mr-1" /> Copy
          </Button>
        </div>
      )}

      {!adding ? (
        <Button onClick={() => setAdding(true)} className="bg-[#38271F] hover:bg-[#2a1d17] text-white gap-2">
          <Plus className="w-4 h-4" /> Add Domain
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="flex gap-2 items-end bg-white p-4 rounded-xl border border-[#e8ddd0]">
          <div className="flex-1 space-y-1">
            <label htmlFor="new-domain" className="text-xs font-medium text-[#6b5c52]">Domain Name</label>
            <Input id="new-domain" placeholder="order.yourrestaurant.com" value={newDomain} onChange={e => setNewDomain(e.target.value)} autoFocus />
          </div>
          <Button type="submit" disabled={addDomain.isPending} className="bg-[#38271F] hover:bg-[#2a1d17] text-white">
            {addDomain.isPending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : "Add"}
          </Button>
          <Button type="button" variant="ghost" aria-label="Cancel adding domain" onClick={() => { setAdding(false); setNewDomain(""); }}>
            <X className="w-4 h-4" />
          </Button>
        </form>
      )}

      {domains.isLoading ? (
        <div className="space-y-3" aria-label="Loading domains">
          {[1, 2].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-[#eadfd4]" />
          ))}
        </div>
      ) : domains.isError ? (
        <AdminError
          message="We couldn't load your domains. Please retry."
          onRetry={() => domains.refetch()}
        />
      ) : null}

      {domains.isSuccess && list.length === 0 && !adding && (
        <div className="text-center py-12 text-[#a09080]">
          <Globe className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No custom domains configured yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {list.map(domain => (
          <div key={domain.id} className="bg-white rounded-xl border border-[#e8ddd0] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-[#38271F] text-white px-1.5 py-0.5 rounded">Primary</span>
                  )}
                </div>
                <p className="text-xs text-[#6b5c52]">
                  {domain.isVerified
                    ? `SSL: ${domain.sslStatus} • Verified ${domain.verifiedAt && !Number.isNaN(new Date(domain.verifiedAt).getTime()) ? new Date(domain.verifiedAt).toLocaleDateString() : ""}`
                    : cnameTarget
                      ? `CNAME → ${cnameTarget}`
                      : "Add a CNAME record — the target is shown after adding a domain."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 shrink-0">
              {!domain.isVerified && (
                <Button size="sm" variant="outline" onClick={() => verifyDomain.mutate({ domainId: domain.id, restaurantId })} disabled={verifyDomain.isPending}>
                  {verifyDomain.isPending ? <LoaderCircle className="w-3 h-3 animate-spin" /> : "Verify"}
                </Button>
              )}
              {domain.isVerified && !domain.isPrimary && (
                <Button size="sm" variant="outline" onClick={() => setPrimary.mutate({ domainId: domain.id, restaurantId })} disabled={setPrimary.isPending}>
                  Set Primary
                </Button>
              )}
              {domain.isVerified && (
                <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-md border border-[#e8ddd0] hover:bg-[#f7f2eb]">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Visit
                </a>
              )}
              <Button size="sm" variant="ghost" aria-label={`Delete domain ${domain.domain}`} className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteId(domain.id)} disabled={removeDomain.isPending || verifyDomain.isPending || setPrimary.isPending}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this domain?</AlertDialogTitle>
            <AlertDialogDescription>
              The domain will stop serving your storefront immediately. DNS records at your
              provider are left untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep domain</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) removeDomain.mutate({ domainId: deleteId, restaurantId }); }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
