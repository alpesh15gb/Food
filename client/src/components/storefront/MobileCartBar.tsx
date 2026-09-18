import { ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatINR } from "@/lib/types";

export default function MobileCartBar({
  quantity,
  total,
  disabled = false,
  onClick,
}: {
  quantity: number;
  total: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <AnimatePresence>
      {quantity > 0 && (
        <motion.button
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
          aria-disabled={disabled}
          className="fixed left-4 right-4 z-30 cursor-pointer touch-manipulation lg:hidden disabled:cursor-not-allowed disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
          style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <div
            className="flex min-w-0 items-center justify-between gap-3 rounded-[var(--sf-radius-pill)] px-5 py-3.5 text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{
              background: "var(--sf-primary)",
              boxShadow: "var(--sf-shadow-fab)",
            }}
          >
            <span className="min-w-0 text-left">
              <span className="block truncate text-xs font-semibold text-white/70">
                {quantity} item{quantity !== 1 ? "s" : ""} in your order
              </span>
              <span className="block truncate text-base font-extrabold tabular-nums">
                {disabled ? "Processing…" : formatINR(total)}
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm font-extrabold">
              {disabled ? "Please wait" : "View cart"}{" "}
              {!disabled && <ArrowRight className="h-4 w-4" />}
            </span>
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
