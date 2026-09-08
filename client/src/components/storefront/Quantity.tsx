import { Minus, Plus } from "lucide-react";

export default function Quantity({
  value,
  onChange,
  compact = false,
}: {
  value: number;
  onChange: (next: number) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-[var(--sf-radius-btn)] border bg-white ${
        compact ? "h-9" : "h-11"
      }`}
      style={{ borderColor: "var(--sf-primary)" }}
    >
      <button
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="grid h-full w-9 place-items-center rounded-l-[var(--sf-radius-btn)] hover:bg-[var(--sf-primary-soft)]"
        style={{ color: "var(--sf-primary)" }}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center text-sm font-bold tabular-nums">
        {value}
      </span>
      <button
        aria-label="Increase quantity"
        onClick={() => onChange(value + 1)}
        className="grid h-full w-9 place-items-center rounded-r-[var(--sf-radius-btn)] hover:bg-[var(--sf-primary-soft)]"
        style={{ color: "var(--sf-primary)" }}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
