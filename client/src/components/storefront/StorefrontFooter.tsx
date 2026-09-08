import { Link } from "wouter";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund", label: "Refund & Cancellation" },
  { href: "/contact", label: "Contact" },
];

export default function StorefrontFooter({
  restaurantName,
  address,
  contactPhone,
}: {
  restaurantName: string;
  address?: string;
  contactPhone?: string | null;
}) {
  return (
    <footer
      className="mt-4 border-t pb-24 lg:pb-10"
      style={{ borderColor: "var(--sf-border-subtle)" }}
    >
      <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="sf-serif text-2xl font-bold" style={{ color: "var(--sf-text)" }}>
              {restaurantName}
            </p>
            {address && (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--sf-text-secondary)" }}>
                {address}
              </p>
            )}
            {contactPhone && (
              <a
                href={`tel:${contactPhone}`}
                className="mt-1 inline-block text-sm font-semibold hover:underline"
                style={{ color: "var(--sf-primary)" }}
              >
                {contactPhone}
              </a>
            )}
          </div>

          <nav aria-label="Policies" className="flex flex-col gap-1">
            <p
              className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--sf-text-muted)" }}
            >
              Policies
            </p>
            {LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="min-h-[44px] py-2.5 text-sm font-semibold hover:underline md:min-h-0 md:py-1"
                style={{ color: "var(--sf-text-secondary)" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div
          className="mt-8 flex flex-col gap-2 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--sf-border-subtle)", color: "var(--sf-text-muted)" }}
        >
          <span>
            © {new Date().getFullYear()} {restaurantName}. All rights reserved.
          </span>
          <span>Powered by 9House Kitchen</span>
        </div>
      </div>
    </footer>
  );
}
