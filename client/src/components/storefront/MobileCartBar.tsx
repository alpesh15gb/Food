import { ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatINR } from "@/lib/types";

export default function MobileCartBar({
  quantity,
  total,
  onClick,
}: {
  quantity: number;
  total: number;
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
          onClick={onClick}
          className="fixed bottom-4 left-4 right-4 z-40 lg:hidden"
        >
          <div
            className="flex items-center justify-between rounded-[var(--sf-radius-pill)] px-5 py-3.5 text-white"
            style={{
              background: "var(--sf-primary)",
              boxShadow: "var(--sf-shadow-fab)",
            }}
          >
            <span>
              <span className="block text-xs font-semibold text-white/70">
                {quantity} item{quantity !== 1 ? "s" : ""} in your order
              </span>
              <span className="text-base font-extrabold">
                {formatINR(total)}
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm font-extrabold">
              View cart <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
