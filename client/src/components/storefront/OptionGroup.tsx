import { Check } from "lucide-react";

export default function OptionGroup({
  title,
  required,
  values,
  selected,
  onSelect,
  mode = "radio",
}: {
  title: string;
  required?: boolean;
  values: string[];
  selected: string | string[];
  onSelect: (value: string) => void;
  mode?: "radio" | "checkbox";
}) {
  const isSelected = (value: string) => {
    const key = value.split(" ")[0];
    if (Array.isArray(selected)) return selected.includes(key);
    return selected === key;
  };

  return (
    <div className="mt-6">
      <p className="sf-heading text-sm" style={{ color: "var(--sf-text)" }}>
        {title}{" "}
        {required && (
          <span className="font-medium text-[var(--sf-red)]">Required</span>
        )}
      </p>
      <div className="mt-3 grid gap-2">
        {values.map((value) => {
          const active = isSelected(value);
          return (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className={`flex items-center gap-3 rounded-[var(--sf-radius-btn)] border px-3.5 py-3 text-left text-sm font-semibold transition-colors ${
                active
                  ? "bg-[var(--sf-primary-soft)]"
                  : "bg-white"
              }`}
              style={{
                borderColor: active
                  ? "var(--sf-primary)"
                  : "var(--sf-border)",
                color: active ? "var(--sf-text)" : "var(--sf-text-secondary)",
              }}
            >
              {mode === "radio" ? (
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
              ) : (
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border"
                  style={{
                    borderColor: active
                      ? "var(--sf-primary)"
                      : "var(--sf-border)",
                    background: active ? "var(--sf-primary)" : "transparent",
                  }}
                >
                  {active && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
              )}
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
