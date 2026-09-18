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
      className={`inline-flex touch-manipulation items-center rounded-[var(--sf-radius-btn)] border [-webkit-tap-highlight-color:transparent] ${
        compact ? "h-9 min-h-[44px]" : "h-11 min-h-[44px]"
      }`}
      style={{ borderColor: "var(--sf-primary)", background: "var(--sf-surface)" }}
    >
      <button
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="grid h-full min-h-[44px] w-9 min-w-[44px] cursor-pointer touch-manipulation place-items-center rounded-l-[var(--sf-radius-btn)] outline-none transition-colors duration-150 hover:bg-[var(--sf-primary-soft)] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-inset [-webkit-tap-highlight-color:transparent]"
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
        className="grid h-full min-h-[44px] w-9 min-w-[44px] cursor-pointer touch-manipulation place-items-center rounded-r-[var(--sf-radius-btn)] outline-none transition-colors duration-150 hover:bg-[var(--sf-primary-soft)] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-inset [-webkit-tap-highlight-color:transparent]"
        style={{ color: "var(--sf-primary)" }}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
