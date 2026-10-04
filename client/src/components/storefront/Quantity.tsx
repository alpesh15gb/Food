import { Minus, Plus, Trash2 } from "lucide-react";

export default function Quantity({
  value,
  onChange,
  compact = false,
  min = 1,
  max,
  removable = true,
  canIncrease = true,
  removeLabel = "Remove item",
}: {
  value: number;
  onChange: (next: number) => void;
  compact?: boolean;
  /**
   * Smallest quantity this control can rest at. Defaults to 1, the natural floor
   * for a menu line.
   *
   * The old control clamped with `Math.max(1, value - 1)` and had no removal path
   * at all, so decrementing a single-item line did nothing — the cart slide-over
   * simply could not remove a dish.
   */
  min?: number;
  /**
   * Hard ceiling for this line. The server rejects a quantity above
   * `maxQuantityPerOrder` by THROWING, which errors the whole cart quote — so
   * without a ceiling, tapping "+" past the limit bricked the cart with a
   * permanent "We could not price your cart". Omit for no client-side ceiling.
   */
  max?: number;
  /**
   * Whether 0 may be emitted. At the floor the decrement button becomes an
   * explicit remove and reports 0, which `OrderingApp.changeQty` treats as
   * "drop this line". Pass false where 0 is not a valid state (the customisation
   * drawer adds a new line rather than editing one, so a 0 there would put a
   * zero-quantity line in the cart).
   */
  removable?: boolean;
  /** False freezes "+" only — minus/remove stay live so a line is never stuck. */
  canIncrease?: boolean;
  removeLabel?: string;
}) {
  const atFloor = value <= min;
  const canRemove = removable && min <= 1 && atFloor;
  const atCeiling = max != null && value >= max;
  const plusDisabled = !canIncrease || atCeiling;

  return (
    <div
      className={`inline-flex touch-manipulation items-center rounded-[var(--sf-radius-btn)] border [-webkit-tap-highlight-color:transparent] ${
        compact ? "h-9 min-h-[44px]" : "h-11 min-h-[44px]"
      }`}
      style={{ borderColor: "var(--sf-primary)", background: "var(--sf-surface)" }}
      role="group"
      aria-label="Quantity"
    >
      <button
        type="button"
        aria-label={canRemove ? removeLabel : "Decrease quantity"}
        disabled={atFloor && !canRemove}
        onClick={() => onChange(canRemove ? 0 : Math.max(min, value - 1))}
        className="grid h-full min-h-[44px] w-9 min-w-[44px] cursor-pointer touch-manipulation place-items-center rounded-l-[var(--sf-radius-btn)] outline-none transition-colors duration-150 hover:bg-[var(--sf-primary-soft)] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent [-webkit-tap-highlight-color:transparent]"
        style={{ color: canRemove ? "var(--sf-red)" : "var(--sf-primary)" }}
      >
        {canRemove ? (
          <Trash2 className="h-3.5 w-3.5" />
        ) : (
          <Minus className="h-3.5 w-3.5" />
        )}
      </button>
      <span
        className="min-w-6 px-1 text-center text-sm font-bold tabular-nums"
        style={{ color: "var(--sf-text)" }}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={plusDisabled}
        title={atCeiling ? `Maximum ${max} per order` : undefined}
        onClick={() => onChange(value + 1)}
        className="grid h-full min-h-[44px] w-9 min-w-[44px] cursor-pointer touch-manipulation place-items-center rounded-r-[var(--sf-radius-btn)] outline-none transition-colors duration-150 hover:bg-[var(--sf-primary-soft)] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent [-webkit-tap-highlight-color:transparent]"
        style={{ color: "var(--sf-primary)" }}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
