/** Legal + trust pages (MP-005, payment-gateway compliance).
 * Static, no PII beyond the business's own published support contacts.
 * Refund wording matches the actual order state machine. */
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const BUSINESS = {
  name: "9 House Kitchen",
  format: "Cloud kitchen (delivery only — no dine-in)",
  addressLines: [
    "8-2-338/6, 1st Floor, Road No. 3, Banjara Hills,",
    "Hyderabad, Telangana 500034",
  ],
  phones: ["+91 92814 17664", "+91 85007 27277"],
  phoneHrefs: ["tel:+919281417664", "tel:+918500727277"],
  hours: "Open daily, 11:00 AM – 11:55 PM. Phone support during kitchen hours.",
  cuisines:
    "South Indian, Andhra, Mughlai, Biryani, Chinese, Pasta, Desserts and Beverages.",
} as const;

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
        <Link href="/about" className="min-h-[44px] px-2 py-3 hover:text-[#c84630]">About</Link>
        <Link href="/terms" className="min-h-[44px] px-2 py-3 hover:text-[#c84630]">Terms</Link>
        <Link href="/privacy" className="min-h-[44px] px-2 py-3 hover:text-[#c84630]">Privacy</Link>
        <Link href="/refund" className="min-h-[44px] px-2 py-3 hover:text-[#c84630]">Refunds & Cancellation</Link>
        <Link href="/contact" className="min-h-[44px] px-2 py-3 hover:text-[#c84630]">Contact</Link>
      </footer>
    </main>
  );
}

export function About() {
  return (
    <Shell title={`About ${BUSINESS.name}`} updated="September 2026">
      <p>{BUSINESS.name} is a cloud kitchen in Banjara Hills, Hyderabad — a delivery-only kitchen serving hygienic, freshly prepared home-style and multi-cuisine food. There is no dine-in seating; every dish is cooked to order and delivered to your doorstep.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">What we serve</h2>
      <p>Over 100 dishes across {BUSINESS.cuisines} Average cost is about ₹499 for two people. The full menu with live prices is published on this website — the price you see on a dish is what the kitchen charges before checkout additions.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">How ordering & pricing work</h2>
      <p>Pick dishes, confirm your delivery location on the map, and pay online. Your bill is: dish prices + packaging + delivery fee + GST, minus any coupon discount. GST applies as shown; the exact payable is confirmed server-side at payment and shown before you authorize anything in Razorpay. Fully discounted (₹0) coupon orders confirm immediately with no payment step.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Hours & area</h2>
      <p>{BUSINESS.hours} Delivery is available within the kitchen's serviceable radius around Banjara Hills — enter your address at checkout and the website verifies serviceability before accepting payment.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Reach us</h2>
      <p>{BUSINESS.addressLines.join(" ")} Phone: {BUSINESS.phones.join(" / ")}.</p>
    </Shell>
  );
}

export function Terms() {
  return (
    <Shell title="Terms of Service" updated="September 2026">
      <p>These terms govern direct food ordering from {BUSINESS.name} (“Kitchen”, “we”, “us”) at {BUSINESS.addressLines.join(" ")} through this website, operated on the MunchPro direct-ordering platform. By placing an order you agree to these terms. These terms are governed by the laws of India; courts at Hyderabad, Telangana shall have jurisdiction.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">1. What we sell</h2>
      <p>Freshly prepared food for delivery only ({BUSINESS.format}). {BUSINESS.cuisines} Menu, prices, availability, packaging and delivery fees, taxes, minimum order, hours and delivery areas are set by the Kitchen and repriced server-side at checkout. In case of a difference between any estimate shown while browsing and the checkout total, the checkout total prevails.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">2. Payments</h2>
      <p>Online payments are processed securely by Razorpay (UPI, cards, netbanking, wallets as offered at checkout). We never see or store your card/UPI credentials. An order is confirmed only after server-side payment verification. The amount you authorize in Razorpay is the final amount charged — no additional charges are added afterwards. If payment succeeds but confirmation fails, contact support with your order number — do not pay twice. Free (₹0) coupon orders skip Razorpay and confirm immediately.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">3. Preparation & delivery</h2>
      <p>Preparation starts after the Kitchen accepts your order; ETAs shown are estimates, not guarantees. The Kitchen may reject an order (item sold out, closure, undeliverable address); rejected paid orders move to refund (see Refunds & Cancellation).</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">4. Your responsibilities</h2>
      <p>Provide a reachable 10-digit Indian mobile number and a precise delivery address with map pin. Ensure someone is available to receive the order. Wrong addresses/phones or unavailability at the door may cause failed delivery without refund of delivery/packaging fees.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">5. Misuse</h2>
      <p>Coupon abuse, fake orders, delivery fraud or payment fraud may lead to order cancellation and blocking from the platform.</p>
    </Shell>
  );
}

export function Privacy() {
  return (
    <Shell title="Privacy Policy" updated="September 2026">
      <p>{BUSINESS.name} (“we”) collects only what food delivery needs: your phone number, delivery address (including map coordinates), order items, and payment references. Payment credentials (card/UPI/bank details) go directly to Razorpay and are never visible to or stored by us.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">What we store</h2>
      <p>Phone number, delivery addresses, order history, support correspondence, device preferences (e.g. low-data mode), and admin audit logs. Order-tracking links use unguessable tokens — keep your confirmation link private.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">How we use it</h2>
      <p>To prepare and deliver your order, verify payment, arrange delivery riders, provide order updates and support, prevent fraud, and meet tax/accounting obligations. Analytics events carry no phone numbers or addresses.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Sharing</h2>
      <p>Your order details are shared only with (a) the Kitchen fulfilling it, (b) Razorpay for payment processing, and (c) the delivery provider/rider fulfilling the delivery. We do not sell personal data and do not share it for marketing.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Retention & your rights</h2>
      <p>Order records are kept as required for tax/audit compliance. You may ask for correction of your details at any time. Deletion requests are honoured except where records must be retained by law (e.g. issued tax invoices).</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Grievances</h2>
      <p>For privacy questions or requests, contact us at {BUSINESS.phones.join(" / ")} ({BUSINESS.hours}).</p>
    </Shell>
  );
}

export function Refund() {
  return (
    <Shell title="Refunds & Cancellation" updated="September 2026">
      <p>How money moves when things go wrong at {BUSINESS.name}. Order statuses you may see while tracking: PLACED → ACCEPTED → PREPARING → READY → DELIVERED, or CANCELLED / REJECTED → REFUND_PENDING → REFUNDED.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Cancelling your order</h2>
      <p>Before the Kitchen accepts your order: cancel free by calling support at {BUSINESS.phones.join(" / ")} with your order number; paid orders go to REFUND_PENDING immediately. After acceptance/preparing: cancellation is at the Kitchen's discretion because food may already be on the flame. Rejected-by-kitchen paid orders are always refunded in full.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">How refunds settle</h2>
      <p>Refunds go back to the original payment method via Razorpay: UPI and cards typically within 2–5 business days of initiation, netbanking and wallets per your provider's timelines. Partial refunds (e.g. one missing item) keep the order status; only full refunds move it to REFUNDED. You can follow payment status (PAID → REFUND_PENDING → REFUNDED) on your tracking page.</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Non-refundable</h2>
      <p>Successfully delivered orders with correct items are not refunded. Report wrong/missing items within 24 hours at {BUSINESS.phones.join(" / ")} with photos and your order number.</p>
    </Shell>
  );
}

export function Contact() {
  return (
    <Shell title="Contact & Support" updated="September 2026">
      <p>For order help, keep your order number (ORD-…) ready and call us during kitchen hours. {BUSINESS.hours}</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">{BUSINESS.name}</h2>
      <p>{BUSINESS.addressLines.map((line, i) => (<span key={i}>{line}<br /></span>))}</p>
      <p>Phone: {BUSINESS.phoneHrefs.map((href, i) => (
        <span key={href}><a className="font-bold text-[#B95509] hover:underline" href={href}>{BUSINESS.phones[i]}</a>{i < BUSINESS.phoneHrefs.length - 1 ? " / " : ""}</span>
      ))}</p>
      <h2 className="font-display text-xl text-[#2A3A0C]">Payment disputes</h2>
      <p>Share your order number, amount charged, date, and Razorpay payment ID (from your bank/UPI statement) on either number above and we will reconcile it against our payment ledger. Do not pay twice for the same order.</p>
    </Shell>
  );
}
