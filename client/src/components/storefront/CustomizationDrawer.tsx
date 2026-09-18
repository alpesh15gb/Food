import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { formatINR } from "@/lib/types";
import type {
  StorefrontAddonGroup,
  StorefrontMenuItem,
} from "@/lib/storefrontAdapter";
import FoodDot from "./FoodDot";
import Quantity from "./Quantity";
import { Check } from "lucide-react";

const rupees = (paise: number): number =>
  Number.isFinite(paise) ? paise / 100 : 0;

export default function CustomizationDrawer({
  item,
  quantity,
  variantId,
  optionIds,
  note,
  onClose,
  onQuantity,
  onVariant,
  onOptions,
  onNote,
  onAdd,
}: {
  item: StorefrontMenuItem | null;
  quantity: number;
  variantId: string | null;
  optionIds: string[];
  note: string;
  onClose: () => void;
  onQuantity: (value: number) => void;
  onVariant: (id: string | null) => void;
  onOptions: (value: string[]) => void;
  onNote: (value: string) => void;
  onAdd: () => void;
}) {
  if (!item) return null;

  const variants = item.variants ?? [];
  const groups: StorefrontAddonGroup[] = item.addonGroups ?? [];

  const selectedVariant = variants.find((v) => v.id === variantId) ?? null;
  const variantUpcharge = selectedVariant
    ? rupees(selectedVariant.pricePaise)
    : 0;

  const selectedSet = new Set(optionIds);
  let optionsUpcharge = 0;
  for (const group of groups) {
    for (const opt of group.options) {
      if (selectedSet.has(opt.id)) optionsUpcharge += rupees(opt.pricePaise);
    }
  }
  const displayTotal = (item.price + variantUpcharge + optionsUpcharge) * quantity;

  const toggleOption = (group: StorefrontAddonGroup, optionId: string) => {
    const inGroup = new Set(
      group.options.map((o) => o.id).filter((id) => selectedSet.has(id))
    );
    if (group.selectionType === "single") {
      // Single-select: replace the group's pick (or deselect unless required).
      const next = optionIds.filter(
        (id) => !group.options.some((o) => o.id === id)
      );
      if (!inGroup.has(optionId)) next.push(optionId);
      else if (group.isRequired) next.push(optionId);
      onOptions(next);
      return;
    }
    const max = group.maxSelections ?? group.options.length;
    if (selectedSet.has(optionId)) {
      onOptions(optionIds.filter((id) => id !== optionId));
      return;
    }
    if (inGroup.size >= Math.max(max, 1)) return;
    onOptions([...optionIds, optionId]);
  };

  // Required groups missing a pick block Add (server would reject anyway).
  const missingRequired = groups.filter((group) => {
    const count = group.options.filter((o) => selectedSet.has(o.id)).length;
    const min = Math.max(group.isRequired ? 1 : 0, group.minSelections ?? 0);
    return count < min;
  });

  return (
    <Drawer open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent
        className="storefront max-h-[92dvh]"
        style={{ background: "var(--sf-bg)" }}
      >
        <div className="mx-auto w-full max-w-xl overflow-y-auto px-5 pb-3">
          <DrawerHeader className="px-0 text-left">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FoodDot kind={item.kind} />
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                    style={{
                      background: "var(--sf-gold-soft)",
                      color: "var(--sf-gold)",
                    }}
                  >
                    CUSTOMIZE
                  </span>
                </div>
                <DrawerTitle
                  className="sf-heading mt-2 text-2xl"
                  style={{ color: "var(--sf-text)" }}
                >
                  {item.name}
                </DrawerTitle>
                <DrawerDescription
                  className="mt-1 max-w-md text-sm leading-relaxed"
                  style={{ color: "var(--sf-text-secondary)" }}
                >
                  {item.description}
                </DrawerDescription>
              </div>
              <button
                onClick={onClose}
                className="grid h-9 min-h-[44px] w-9 min-w-[44px] shrink-0 cursor-pointer touch-manipulation place-items-center rounded-full transition-colors duration-200 hover:bg-white/10 active:scale-95 [-webkit-tap-highlight-color:transparent]"
                style={{ color: "var(--sf-text-secondary)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DrawerHeader>

          {/* Real variants from the storefront payload (DB prices, DB IDs) */}
          {variants.length > 0 && (
            <div className="mt-6">
              <p className="sf-heading text-sm" style={{ color: "var(--sf-text)" }}>
                Choose variant{" "}
                <span className="font-medium text-[var(--sf-red)]">Required</span>
              </p>
              <div className="mt-3 grid gap-2">
                {variants
                  .filter((v) => v.isAvailable)
                  .map((v) => {
                    const active = variantId === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => onVariant(active ? null : v.id)}
                        className="flex min-w-0 cursor-pointer touch-manipulation items-center justify-between gap-3 rounded-[var(--sf-radius-btn)] border px-3.5 py-3 text-left text-sm font-semibold transition-colors duration-200 active:scale-[0.99] [-webkit-tap-highlight-color:transparent]"
                        style={{
                          borderColor: active
                            ? "var(--sf-primary)"
                            : "var(--sf-border)",
                          background: active
                            ? "var(--sf-primary-soft)"
                            : "var(--sf-surface)",
                          color: active
                            ? "var(--sf-text)"
                            : "var(--sf-text-secondary)",
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className="grid h-5 w-5 shrink-0 place-items-center rounded-full border"
                            style={{
                              borderColor: active
                                ? "var(--sf-primary)"
                                : "var(--sf-border)",
                            }}
                          >
                            {active && (
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ background: "var(--sf-primary)" }}
                              />
                            )}
                          </span>
                          <span className="line-clamp-2 min-w-0">{v.name}</span>
                        </span>
                        <span
                          className="shrink-0 text-xs tabular-nums"
                          style={{ color: "var(--sf-text-muted)" }}
                        >
                          {v.pricePaise > 0
                            ? `+${formatINR(rupees(v.pricePaise))}`
                            : "Included"}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Real addon groups from the storefront payload (DB prices, DB IDs) */}
          {groups.map((group) => (
            <div key={group.id} className="mt-6">
              <p className="sf-heading text-sm" style={{ color: "var(--sf-text)" }}>
                {group.name}{" "}
                {group.isRequired ? (
                  <span className="font-medium text-[var(--sf-red)]">Required</span>
                ) : (
                  <span
                    className="font-medium"
                    style={{ color: "var(--sf-text-muted)" }}
                  >
                    (optional)
                  </span>
                )}
              </p>
              <div className="mt-3 grid gap-2">
                {group.options
                  .filter((opt) => opt.isAvailable)
                  .map((opt) => {
                    const active = selectedSet.has(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggleOption(group, opt.id)}
                        className="flex min-w-0 cursor-pointer touch-manipulation items-center justify-between gap-3 rounded-[var(--sf-radius-btn)] border px-3.5 py-3 text-left text-sm font-semibold transition-colors duration-200 active:scale-[0.99] [-webkit-tap-highlight-color:transparent]"
                        style={{
                          borderColor: active
                            ? "var(--sf-primary)"
                            : "var(--sf-border)",
                          background: active
                            ? "var(--sf-primary-soft)"
                            : "var(--sf-surface)",
                          color: active
                            ? "var(--sf-text)"
                            : "var(--sf-text-secondary)",
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center border ${
                              group.selectionType === "single"
                                ? "rounded-full"
                                : "rounded-[5px]"
                            }`}
                            style={{
                              borderColor: active
                                ? "var(--sf-primary)"
                                : "var(--sf-border)",
                              background:
                                active && group.selectionType !== "single"
                                  ? "var(--sf-primary)"
                                  : "transparent",
                            }}
                          >
                            {active &&
                              (group.selectionType === "single" ? (
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ background: "var(--sf-primary)" }}
                                />
                              ) : (
                                <Check className="h-3.5 w-3.5 text-white" />
                              ))}
                          </span>
                          <span className="line-clamp-2 min-w-0">{opt.name}</span>
                        </span>
                        <span
                          className="shrink-0 text-xs tabular-nums"
                          style={{ color: "var(--sf-text-muted)" }}
                        >
                          {opt.pricePaise > 0
                            ? `+${formatINR(rupees(opt.pricePaise))}`
                            : "Included"}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}

          {variants.length === 0 && groups.length === 0 && (
            <p
              className="mt-6 text-sm"
              style={{ color: "var(--sf-text-secondary)" }}
            >
              No customizations available for this dish — add a note below if
              needed.
            </p>
          )}

          {missingRequired.length > 0 && (
            <p
              className="mt-4 text-xs font-bold"
              style={{ color: "var(--sf-red)" }}
            >
              Please choose: {missingRequired.map((g) => g.name).join(", ")}
            </p>
          )}

          {/* Special instructions */}
          <div className="mt-6">
            <label
              className="sf-heading text-sm"
              htmlFor="special-note"
              style={{ color: "var(--sf-text)" }}
            >
              Special instructions
            </label>
            <textarea
              id="special-note"
              value={note}
              onChange={(event) => onNote(event.target.value)}
              placeholder="Less spicy, no onions..."
              className="mt-2 min-h-20 w-full resize-none rounded-[var(--sf-radius-btn)] border p-3 text-sm outline-none focus:ring-2"
              style={{
                borderColor: "var(--sf-border)",
                background: "var(--sf-surface)",
                color: "var(--sf-text)",
                // @ts-ignore CSS custom property
                "--tw-ring-color": "var(--sf-primary)",
              }}
            />
          </div>

          {/* Quantity */}
          <div className="mt-5">
            <Quantity value={quantity} onChange={onQuantity} />
          </div>
        </div>

        <DrawerFooter
          className="border-t px-5 pb-5 pt-4"
          style={{ borderColor: "var(--sf-border-subtle)" }}
        >
          <Button
            onClick={onAdd}
            disabled={missingRequired.length > 0}
            className="h-13 w-full cursor-pointer touch-manipulation rounded-[var(--sf-radius-btn)] text-sm font-extrabold tabular-nums text-white transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed [-webkit-tap-highlight-color:transparent]"
            style={{ background: "var(--sf-primary)" }}
          >
            Add item{" "}
            <span className="ml-auto">{formatINR(displayTotal)}</span>
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
