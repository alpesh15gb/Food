/** MunchPro platform landing — served on the platform domain (no restaurant slug). */
import { Link } from "wouter";
import { ArrowRight, Store, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlatformLanding({
  featuredName,
  featuredUrl,
}: {
  featuredName: string;
  featuredUrl: string;
}) {
  const hasFeatured = featuredName.trim().length > 0 && featuredUrl.trim().length > 0;
  return (
    <main className="min-h-screen bg-[#fffaf3] text-[#382719]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="font-display text-2xl font-bold tracking-tight">
          Munch<span className="text-[#c84630]">Pro</span>
        </span>
        <nav aria-label="Platform" className="flex items-center gap-2">
          <Button asChild variant="ghost" className="min-h-[44px]">
            <Link href="/admin">Admin sign in</Link>
          </Button>
          <Button asChild className="min-h-[44px] bg-[#c84630] font-extrabold hover:bg-[#ad3627]">
            <Link href="/signup">Run your kitchen here</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-16 pt-10 text-center sm:px-6 sm:pt-16">
        <p className="mx-auto inline-block rounded-full border border-[#e7d2bf] bg-[#fffdf9] px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[#856653]">
          Direct ordering for independent kitchens
        </p>
        <h1 className="font-display mx-auto mt-6 max-w-3xl text-4xl leading-tight sm:text-6xl">
          Your usual, <span className="text-[#c84630]">without the detour.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#856653]">
          MunchPro gives local kitchens their own ordering counter — no marketplace
          commission, no lost customer list. Dinner's in good hands.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {hasFeatured ? (
            <Button
              asChild
              className="min-h-[48px] w-full bg-[#c84630] px-7 text-base font-extrabold hover:bg-[#ad3627] sm:w-auto"
            >
              <a href={featuredUrl}>
                <UtensilsCrossed className="mr-2 h-5 w-5" aria-hidden="true" />
                Order from {featuredName}
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </a>
            </Button>
          ) : null}
          <Button
            asChild
            variant={hasFeatured ? "outline" : "default"}
            className={`min-h-[48px] w-full px-7 text-base font-extrabold sm:w-auto ${
              hasFeatured
                ? "border-[#e7d2bf] bg-[#fffdf9]"
                : "bg-[#c84630] hover:bg-[#ad3627]"
            }`}
          >
            <Link href="/signup">
              <Store className="mr-2 h-5 w-5" aria-hidden="true" />
              List your restaurant
            </Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-[#f0e2d3] bg-[#fffdf9]">
        <div className="mx-auto grid max-w-5xl gap-4 px-4 py-12 sm:grid-cols-3 sm:px-6">
          {[
            { title: "Your brand, your link", body: "A direct storefront on your own domain with live menu, hours and pricing you control." },
            { title: "Kitchen-ready operations", body: "Order queue, preparation flow, delivery dispatch and refunds with a full audit trail." },
            { title: "Payments that settle", body: "Razorpay checkout with server-verified payments — an order is confirmed only when money moves." },
          ].map((f) => (
            <article key={f.title} className="rounded-2xl border border-[#f0e2d3] p-6">
              <h2 className="font-display text-xl">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#856653]">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-[#856653] sm:flex-row sm:px-6">
        <span className="font-display text-base font-bold text-[#382719]">
          Munch<span className="text-[#c84630]">Pro</span>
        </span>
        <span>Direct ordering for independent kitchens.</span>
      </footer>
    </main>
  );
}
