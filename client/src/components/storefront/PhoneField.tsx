/** Shared 10-digit contact-number field (checkout page + cart slide-over). */
export function normalizePhoneInput(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

export default function PhoneField({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "" : "sf-card p-5"}
    >
      <label
        htmlFor={compact ? "cart-phone" : "checkout-phone"}
        className="text-[10px] font-extrabold uppercase tracking-[0.16em]"
        style={{ color: "var(--sf-text-muted)" }}
      >
        Mobile number
      </label>
      <input
        id={compact ? "cart-phone" : "checkout-phone"}
        value={value}
        onChange={(e) => onChange(normalizePhoneInput(e.target.value))}
        inputMode="numeric"
        autoComplete="tel"
        placeholder="10-digit mobile number"
        className="mt-2 h-12 w-full rounded-[var(--sf-radius-btn)] border bg-transparent px-4 text-sm font-bold outline-none"
        style={{
          borderColor: "var(--sf-border)",
          color: "var(--sf-text)",
        }}
      />
      {!compact && (
        <p
          className="mt-1.5 text-[11px]"
          style={{ color: "var(--sf-text-muted)" }}
        >
          Order updates and delivery coordination need this number.
        </p>
      )}
    </div>
  );
}
