/** Network-quality detection for low-data / slow-network adaptation. */
import { useEffect, useState } from "react";

type ConnectionInfo = {
  saveData?: boolean;
  effectiveType?: string;
};

function readConnection(): ConnectionInfo {
  if (typeof navigator === "undefined") return {};
  const conn = (navigator as unknown as { connection?: ConnectionInfo }).connection;
  if (!conn) return {};
  return { saveData: conn.saveData, effectiveType: conn.effectiveType };
}

function isLowData(info: ConnectionInfo): boolean {
  if (info.saveData) return true;
  const t = (info.effectiveType ?? "").toLowerCase();
  return t === "slow-2g" || t === "2g";
}

/**
 * Reactive low-data flag. True on Save-Data or 2G-class networks.
 * UI uses it to skip decorative imagery and non-essential motion.
 */
export function useNetworkQuality(): { lowData: boolean; effectiveType: string } {
  const [info, setInfo] = useState<ConnectionInfo>(() => readConnection());

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const conn = (navigator as unknown as {
      connection?: ConnectionInfo & { addEventListener?: (t: string, fn: () => void) => void; removeEventListener?: (t: string, fn: () => void) => void };
    }).connection;
    if (!conn?.addEventListener) return;
    const onChange = () => setInfo(readConnection());
    conn.addEventListener("change", onChange);
    return () => conn.removeEventListener?.("change", onChange);
  }, []);

  return { lowData: isLowData(info), effectiveType: info.effectiveType ?? "unknown" };
}

/** Non-reactive one-shot check for use outside components. */
export function isLowDataConnection(): boolean {
  return isLowData(readConnection());
}
