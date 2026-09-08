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
import { formatINR, type MenuItem } from "@/lib/types";
import FoodDot from "./FoodDot";
import OptionGroup from "./OptionGroup";
import Quantity from "./Quantity";
import { Check } from "lucide-react";

export default function CustomizationDrawer({
  item,
  quantity,
  size,
  extras,
  note,
  onClose,
  onQuantity,
  onSize,
  onExtras,
  onNote,
  onAdd,
}: {
  item: MenuItem | null;
  quantity: number;
  size: string;
  extras: string[];
  note: string;
  onClose: () => void;
  onQuantity: (value: number) => void;
  onSize: (value: string) => void;
  onExtras: (value: string[]) => void;
  onNote: (value: string) => void;
  onAdd: () => void;
}) {
  if (!item) return null;

  const sizeUpcharge = size === "Medium" ? 100 : size === "Large" ? 200 : 0;
  const extraUpcharge = extras.reduce(
    (sum, extra) =>
      sum + (extra === "Extra cheese" ? 70 : extra === "Jalapeño" ? 40 : 50),
    0
  );
  const displayTotal = (item.price + sizeUpcharge + extraUpcharge) * quantity;

  const toggleExtra = (extra: string) =>
    onExtras(
      extras.includes(extra)
        ? extras.filter((choice) => choice !== extra)
        : [...extras, extra]
    );

  return (
    <Drawer open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent
        className="max-h-[92dvh]"
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
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-white/10"
                style={{ color: "var(--sf-text-secondary)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DrawerHeader>

          {/* Size options */}
          <OptionGroup
            title="Choose size"
            required
            values={["Regular", "Medium +₹100", "Large +₹200"]}
            selected={size}
            onSelect={(value) => onSize(value.split(" ")[0])}
          />

          {/* Extras */}
          <div className="mt-6">
            <p className="sf-heading text-sm" style={{ color: "var(--sf-text)" }}>
              Add extras{" "}
              <span className="font-medium" style={{ color: "var(--sf-text-muted)" }}>
                (optional)
              </span>
            </p>
            <div className="mt-3 grid gap-2">
              {["Extra cheese", "Jalapeño"].map((extra) => {
                const active = extras.includes(extra);
                return (
                  <button
                    key={extra}
                    onClick={() => toggleExtra(extra)}
                    className={`flex items-center justify-between rounded-[var(--sf-radius-btn)] border px-3.5 py-3 text-left text-sm font-semibold transition-colors`}
                    style={{
                      borderColor: active
                        ? "var(--sf-primary)"
                        : "var(--sf-border)",
                      background: active ? "var(--sf-primary-soft)" : "var(--sf-surface)",
                      color: active
                        ? "var(--sf-text)"
                        : "var(--sf-text-secondary)",
                    }}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className="grid h-5 w-5 place-items-center rounded-[5px] border"
                        style={{
                          borderColor: active
                            ? "var(--sf-primary)"
                            : "var(--sf-border)",
                          background: active ? "var(--sf-primary)" : "transparent",
                        }}
                      >
                        {active && <Check className="h-3.5 w-3.5 text-white" />}
                      </span>
                      {extra}
                    </span>
                    <span className="text-xs" style={{ color: "var(--sf-text-muted)" }}>
                      +₹{extra === "Extra cheese" ? 70 : 40}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

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
            className="h-13 w-full rounded-[var(--sf-radius-btn)] text-sm font-extrabold text-white"
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
