/** Legal + trust pages (MP-005). Static, no PII, matches actual order state machine. */
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

function Shell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#fffaf3] text-[#382719]">
      <header className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5 sm:px-6">
        <Button asChild variant="ghost" className="min-h-[44px] px-2">
          <Link href="/"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
        <span className="font-display text-xl font-bold">Munch<span className="text-[#c84630]">Pro</span></span>
      </header>
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#f0e2d3] bg-[#fffdf9] px-5 py-8 sm:px-8">
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-[#856653]">Last updated: {updated}</p>
        <div className="prose-sm mt-6 space-y-4 text-sm leading-relaxed text-[#4c3424]">{children}</div>
      </article>
      <footer className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-8 text-xs font-bold text-[#856653]">
        <Link href="/terms" className="min-h-[44px] px-2 py-3 hover:text-[#c84630]">Terms</Link>
        <Link href="/privacy" className="min-h-[44px] px-2 py-3 hover:text-[#c84630]">Privacy</Link>
        <Link href="/refund" className="min-h-[44px] px-2 py-3 hover:text-[#c84630]">Refunds & Cancellation</Link>
        <Link href="/contact" className="min-h-[44px] px-2 py-3 hover:text-[#c84630]">Contact</Link>
      </footer>
    </main>
  );
}

export function Terms() {
  return (
    <Shell title="Terms of Service" updated="September 2026">
      <p>These terms govern direct food ordering through MunchPro-powered restaurant storefronts (“Kitchen”, “we”). By placing an order you agree to these terms.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">1. Ordering</h2>
      <p>Menus, prices, fees, taxes, minimum order, hours and delivery areas are set by each Kitchen and repriced server-side at checkout. The amount you authorize in Razorpay is the authoritative total; any client estimate is labeled as such.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">2. Payments</h2>
      <p>Online payments are processed by Razorpay. An order is confirmed only after server-side signature verification. If payment succeeds but confirmation fails, contact support with your order number — do not pay twice. Free (₹0) coupon orders skip Razorpay and confirm immediately.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">3. Preparation & delivery</h2>
      <p>ETAs are estimates. The Kitchen may reject an order (item sold out, closure); rejected paid orders move to refund (see Refunds page).</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">4. Your responsibilities</h2>
      <p>Provide a reachable 10-digit Indian mobile number and a precise delivery address with map pin. Wrong addresses/phones may cause failed delivery without refund of delivery fees.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">5. Misuse</h2>
      <p>Coupon abuse, fake orders, or payment fraud may lead to order cancellation and account blocking.</p>
    </Shell>
  );
}

export function Privacy() {
  return (
    <Shell title="Privacy Policy" updated="September 2026">
      <p>We collect only what delivery needs: phone, address (with map coordinates), order items, and payment references. We never store card/UPI credentials — those go to Razorpay directly.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">What we store</h2>
      <p>Phone (verified via OTP where required), delivery addresses, order history, device-low-data preference, and admin audit logs. Tracking links use unguessable tokens — keep your confirmation link private.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Sharing</h2>
      <p>Your order details go to the Kitchen fulfilling it and to Razorpay (payment) / Shadowfax or manual rider (delivery). No sale of personal data. Analytics events carry no phone/address.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Retention & rights</h2>
      <p>Order records are kept for tax/audit compliance. Ask for correction/deletion via the Contact page; tax invoices already issued cannot be deleted.</p>
    </Shell>
  );
}

export function Refund() {
  return (
    <Shell title="Refunds & Cancellation" updated="September 2026">
      <p>How money moves when things go wrong. Statuses you may see: PLACED → ACCEPTED → PREPARING → READY → DELIVERED, or CANCELLED / REJECTED → REFUND_PENDING → REFUNDED.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Before acceptance</h2>
      <p>Cancel free via support; paid orders go to REFUND_PENDING immediately.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">After acceptance / preparing</h2>
      <p>Cancellation is at the Kitchen’s discretion (food may already be fired). Rejected-by-kitchen paid orders are always refunded in full.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">How refunds settle</h2>
      <p>Refunds go to the original Razorpay method (UPI/cards typically 2–5 business days; netbanking/wallets per provider). Partial refunds keep the order status; only full refunds move it to REFUNDED. You’ll see payment status PAID → REFUND_PENDING → REFUNDED on tracking.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Non-refundable</h2>
      <p>Successfully delivered orders with correct items are not refunded; report wrong/missing items within 24 hours with photos.</p>
    </Shell>
  );
}

export function Contact() {
  return (
    <Shell title="Contact & Support" updated="September 2026">
      <p>For order help, keep your order number (ORD-…) ready. Support hours follow each Kitchen’s opening hours.</p>
      <p>Platform: MunchPro — direct ordering for independent kitchens.<br />Restaurant support contacts appear on your confirmation/tracking page and invoice once the Kitchen configures them.</p>
      <p>Payment disputes: share order number, amount charged, date, and Razorpay payment ID (from your bank/UPI statement) so we can reconcile against our payment ledger.</p>
    </Shell>
  );
}
