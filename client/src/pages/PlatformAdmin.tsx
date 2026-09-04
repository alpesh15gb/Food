/** MunchPro platform operations — restaurant registry (platform host only). */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { ExternalLink, Globe, Plus, Store, Wrench } from "lucide-react";
import { AdminError, adminPath } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type RegistryRow = {
  id: string;
  slug: string;
  name: string;
  isOpen?: boolean | null;
};

export default function PlatformAdmin() {
  const [, setLocation] = useLocation();
  const restaurants = trpc.admin.restaurants.useQuery(undefined, { retry: false });

  useEffect(() => {
    const prev = document.title;
    document.title = "MunchPro Operations";
    return () => {
      document.title = prev;
    };
  }, []);

  const list = (restaurants.data ?? []) as RegistryRow[];

  return (
    <main className="min-h-screen bg-[#f7f2eb] text-[#35251b]">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#856653]">
            Munch<span className="text-[#c84630]">Pro</span> Operations
          </p>
          <h1 className="font-display mt-1 text-3xl">Restaurants</h1>
        </div>
        <Button
          onClick={() => setLocation("/signup")}
          className="min-h-[44px] bg-[#c84630] font-extrabold hover:bg-[#ad3627]"
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add restaurant
        </Button>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6" aria-label="Restaurant registry">
        {restaurants.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2" aria-label="Loading restaurants">
            {[1, 2].map((k) => (
              <div key={k} className="h-36 animate-pulse rounded-2xl bg-[#eadfd4]" />
            ))}
          </div>
        ) : restaurants.isError ? (
          <AdminError
            message="We couldn't load your restaurants. Please retry."
            onRetry={() => restaurants.refetch()}
          />
        ) : list.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <Store className="mx-auto h-8 w-8 text-[#c84630]" aria-hidden="true" />
            <p className="font-display mt-3 text-2xl">No restaurants yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#856653]">
              Create the first restaurant to start taking direct orders on the platform.
            </p>
            <Button
              onClick={() => setLocation("/signup")}
              className="mt-5 min-h-[44px] bg-[#c84630] font-extrabold hover:bg-[#ad3627]"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Create restaurant
            </Button>
          </div>
        ) : (
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
            {list.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-4 rounded-2xl border border-[#f0e2d3] bg-[#fffdf9] p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl leading-snug">{r.name}</h2>
                    <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[#856653]">
                      /{r.slug}
                      {r.isOpen ? " · Open" : r.isOpen === false ? " · Closed" : ""}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#faede0] text-[#c84630]"
                  >
                    <Store className="h-5 w-5" />
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => setLocation(adminPath(r.slug, "overview"))}
                    className="min-h-[44px] w-full bg-[#c84630] font-extrabold hover:bg-[#ad3627]"
                  >
                    <Wrench className="mr-2 h-4 w-4" aria-hidden="true" />
                    Open workspace
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      asChild
                      variant="outline"
                      className="min-h-[44px] flex-1 border-[#e7d2bf] bg-white font-bold"
                    >
                      <a href={`/${r.slug}`}>
                        <Globe className="mr-2 h-4 w-4" aria-hidden="true" />
                        Storefront
                      </a>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="min-h-[44px] flex-1 border-[#e7d2bf] bg-white font-bold"
                    >
                      <a href={adminPath(r.slug, "domains")}>
                        <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                        Domains
                      </a>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
