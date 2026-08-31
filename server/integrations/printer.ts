/**
 * ESC/POS thermal printer command builder for KOT and receipt printing.
 * Supports Epson TM-T82, TVS RP320, and compatible printers.
 */

const ESC = 0x1B;
const GS = 0x1D;

export class EscPosBuilder {
  private commands: number[] = [];

  initialize() {
    this.commands.push(ESC, 0x40);
    return this;
  }

  alignLeft() { this.commands.push(ESC, 0x61, 0); return this; }
  alignCenter() { this.commands.push(ESC, 0x61, 1); return this; }
  alignRight() { this.commands.push(ESC, 0x61, 2); return this; }

  bold(on: boolean) { this.commands.push(ESC, 0x45, on ? 1 : 0); return this; }
  underline(on: boolean) { this.commands.push(ESC, 0x2D, on ? 1 : 0); return this; }

  textSize(width: 1 | 2, height: 1 | 2) {
    const n = ((width - 1) << 4) | (height - 1);
    this.commands.push(GS, 0x21, n);
    return this;
  }

  text(str: string) {
    for (let i = 0; i < str.length; i++) {
      this.commands.push(str.charCodeAt(i));
    }
    return this;
  }

  line(text?: string) {
    if (text) this.text(text);
    this.commands.push(0x0A);
    return this;
  }

  separator(char = "-") {
    this.line(char.repeat(42));
    return this;
  }

  feedLines(n: number) {
    this.commands.push(ESC, 0x64, n);
    return this;
  }

  cut() {
    this.feedLines(3);
    this.commands.push(GS, 0x56, 0x42, 0);
    return this;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.commands);
  }
}

export interface KotData {
  orderNumber: string;
  type: "DINE-IN" | "TAKEAWAY" | "DELIVERY";
  tableNo?: string;
  items: Array<{
    name: string;
    quantity: number;
    modifiers?: string[];
    specialInstructions?: string;
  }>;
  timestamp: string;
}

export function buildKot(data: KotData): Uint8Array {
  const b = new EscPosBuilder();
  b.initialize()
    .alignCenter()
    .bold(true)
    .textSize(2, 2)
    .line("KOT")
    .textSize(1, 1)
    .bold(false)
    .line(`#${data.orderNumber}`)
    .line(`${data.type}${data.tableNo ? ` | Table ${data.tableNo}` : ""}`)
    .line(data.timestamp)
    .separator("=")
    .alignLeft();

  for (const item of data.items) {
    b.bold(true).line(`  ${item.quantity}x ${item.name}`).bold(false);
    if (item.modifiers?.length) {
      b.line(`      + ${item.modifiers.join(", ")}`);
    }
    if (item.specialInstructions) {
      b.bold(true).line(`      NOTE: ${item.specialInstructions}`).bold(false);
    }
  }

  b.separator("-")
    .feedLines(2)
    .cut();

  return b.toUint8Array();
}

export interface ReceiptData {
  restaurantName: string;
  address: string;
  gstNumber?: string;
  orderNumber: string;
  date: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxes: Array<{ label: string; amount: number }>;
  deliveryFee?: number;
  packagingFee?: number;
  discount?: number;
  grandTotal: number;
  paymentMethod?: string;
}

export function buildReceipt(data: ReceiptData): Uint8Array {
  const b = new EscPosBuilder();
  const fmt = (n: number) => `₹${(n / 100).toFixed(2)}`;

  b.initialize()
    .alignCenter()
    .bold(true)
    .textSize(2, 1)
    .line(data.restaurantName)
    .textSize(1, 1)
    .bold(false)
    .line(data.address)
    .line(data.gstNumber ? `GSTIN: ${data.gstNumber}` : "")
    .separator("=")
    .alignLeft()
    .line(`Order: #${data.orderNumber}`)
    .line(`Date: ${data.date}`)
    .separator("-");

  for (const item of data.items) {
    const name = `${item.quantity}x ${item.name}`;
    const price = fmt(item.total);
    const padding = Math.max(1, 42 - name.length - price.length);
    b.line(`${name}${" ".repeat(padding)}${price}`);
  }

  b.separator("-")
    .line(`Subtotal${" ".repeat(34 - 8)}${fmt(data.subtotal)}`);

  if (data.packagingFee) {
    b.line(`Packaging${" ".repeat(33 - 9)}${fmt(data.packagingFee)}`);
  }
  if (data.deliveryFee) {
    b.line(`Delivery${" ".repeat(34 - 8)}${fmt(data.deliveryFee)}`);
  }
  if (data.discount) {
    b.line(`Discount${" ".repeat(34 - 8)}-${fmt(data.discount)}`);
  }
  for (const tax of data.taxes) {
    b.line(`${tax.label}${" ".repeat(Math.max(1, 42 - tax.label.length - fmt(tax.amount).length))}${fmt(tax.amount)}`);
  }

  b.separator("=")
    .bold(true)
    .line(`TOTAL${" ".repeat(37 - 5)}${fmt(data.grandTotal)}`)
    .bold(false);

  if (data.paymentMethod) {
    b.line(`Payment: ${data.paymentMethod}`);
  }

  b.alignCenter()
    .feedLines(1)
    .line("Thank you for your order!")
    .feedLines(2)
    .cut();

  return b.toUint8Array();
}
