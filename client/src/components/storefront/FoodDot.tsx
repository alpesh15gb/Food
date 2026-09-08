import type { FoodKind } from "./types";
import { kindCopy } from "./types";

export default function FoodDot({ kind }: { kind: FoodKind }) {
  const colour =
    kind === "veg"
      ? "var(--sf-green)"
      : kind === "egg"
      ? "var(--sf-gold)"
      : "var(--sf-red)";

  return (
    <span
      aria-label={kindCopy[kind]}
      title={kindCopy[kind]}
      className="relative inline-flex h-4 w-4 items-center justify-center rounded-[2px]"
      style={{ border: `1.5px solid ${colour}` }}
    >
      {kind === "nonveg" ? (
        <span
          className="block"
          style={{
            width: 0,
            height: 0,
            borderLeft: "3.5px solid transparent",
            borderRight: "3.5px solid transparent",
            borderBottom: `6px solid ${colour}`,
          }}
        />
      ) : (
        <span
          className="block rounded-full"
          style={{ width: 6, height: 6, background: colour }}
        />
      )}
    </span>
  );
}
