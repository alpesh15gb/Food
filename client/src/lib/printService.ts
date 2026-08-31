/**
 * Browser-based thermal printer service using Web Serial API.
 * Falls back to window.print() with thermal-optimized CSS.
 */

declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: { filters?: Array<{ usbVendorId?: number; usbProductId?: number }> }): Promise<SerialPort>;
      getPorts(): Promise<SerialPort[]>;
    };
  }
  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    writable: WritableStream<Uint8Array> | null;
    readable: ReadableStream | null;
  }
}

let activePort: SerialPort | null = null;

export async function connectPrinter(): Promise<boolean> {
  if (!navigator.serial) return false;
  try {
    activePort = await navigator.serial.requestPort();
    await activePort.open({ baudRate: 9600 });
    return true;
  } catch {
    activePort = null;
    return false;
  }
}

export async function disconnectPrinter(): Promise<void> {
  if (activePort) {
    try { await activePort.close(); } catch { /* already closed */ }
    activePort = null;
  }
}

export function isPrinterConnected(): boolean {
  return activePort !== null;
}

export function hasWebSerial(): boolean {
  return typeof navigator !== "undefined" && !!navigator.serial;
}

export async function printRaw(data: Uint8Array): Promise<boolean> {
  if (!activePort?.writable) return false;
  try {
    const writer = activePort.writable.getWriter();
    await writer.write(data);
    writer.releaseLock();
    return true;
  } catch {
    return false;
  }
}

export function printFallback(htmlContent: string): void {
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><style>
    @page { size: 80mm auto; margin: 2mm; }
    body { font-family: monospace; font-size: 12px; width: 76mm; margin: 0; padding: 2mm; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .separator { border-bottom: 1px dashed #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; }
    td:last-child { text-align: right; }
  </style></head><body>${htmlContent}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 500);
}
