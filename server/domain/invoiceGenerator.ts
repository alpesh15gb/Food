export interface InvoiceData {
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string;
  restaurantGst: string;
  logoUrl?: string;
  invoiceNumber: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPricePaise: number;
    totalPricePaise: number;
    hsnCode?: string;
  }>;
  subtotalPaise: number;
  discountPaise: number;
  packagingFeePaise: number;
  deliveryFeePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
  paymentMethod: string;
  paymentStatus: string;
}

const money = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function generateInvoiceHtml(data: InvoiceData): string {
  const rows = data.items.map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.name}${item.hsnCode ? `<br><small style="color:#999">HSN: ${item.hsnCode}</small>` : ""}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${money(item.unitPricePaise)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${money(item.totalPricePaise)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Invoice ${data.invoiceNumber}</title>
<style>
  @media print { @page { size: A4; margin: 15mm; } body { -webkit-print-color-adjust: exact; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #333; max-width: 210mm; margin: 0 auto; padding: 20px; font-size: 13px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #9d3727; }
  .brand h1 { font-size: 22px; color: #9d3727; margin-bottom: 4px; }
  .brand p { font-size: 12px; color: #666; }
  .invoice-meta { text-align: right; }
  .invoice-meta h2 { font-size: 18px; color: #333; margin-bottom: 8px; }
  .invoice-meta p { font-size: 12px; color: #666; margin-bottom: 2px; }
  .parties { display: flex; gap: 40px; margin-bottom: 25px; }
  .party { flex: 1; }
  .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
  .party p { font-size: 12px; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f9f5f0; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 2px solid #e0d5c8; }
  th:nth-child(n+2) { text-align: center; }
  th:last-child, td:last-child { text-align: right; }
  .totals { margin-left: auto; width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .total-row.final { border-top: 2px solid #9d3727; padding-top: 12px; margin-top: 8px; font-weight: bold; font-size: 16px; color: #9d3727; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #999; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-paid { background: #dcfce7; color: #166534; }
  .badge-pending { background: #fef3c7; color: #92400e; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      ${data.logoUrl ? `<img src="${data.logoUrl}" alt="Logo" style="height:40px;margin-bottom:8px">` : ""}
      <h1>${data.restaurantName}</h1>
      <p>${data.restaurantAddress}</p>
      <p>Phone: ${data.restaurantPhone}</p>
      ${data.restaurantGst ? `<p>GSTIN: ${data.restaurantGst}</p>` : ""}
    </div>
    <div class="invoice-meta">
      <h2>TAX INVOICE</h2>
      <p>Invoice No: <strong>${data.invoiceNumber}</strong></p>
      <p>Order No: ${data.orderNumber}</p>
      <p>Date: ${data.orderDate}</p>
      <p>Payment: <span class="badge ${data.paymentStatus === "PAID" || data.paymentStatus === "CAPTURED" ? "badge-paid" : "badge-pending"}">${data.paymentStatus}</span></p>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Billed To</h3>
      <p><strong>${data.customerName || "Walk-in Customer"}</strong></p>
      <p>${data.customerPhone || "-"}</p>
      <p>${data.deliveryAddress || "-"}</p>
    </div>
    <div class="party">
      <h3>Payment Details</h3>
      <p>Method: ${data.paymentMethod || "-"}</p>
      <p>Status: ${data.paymentStatus}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Rate</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>Subtotal</span><span>${money(data.subtotalPaise)}</span></div>
    ${data.discountPaise > 0 ? `<div class="total-row"><span>Discount</span><span>-${money(data.discountPaise)}</span></div>` : ""}
    ${data.packagingFeePaise > 0 ? `<div class="total-row"><span>Packaging Fee</span><span>${money(data.packagingFeePaise)}</span></div>` : ""}
    ${data.deliveryFeePaise > 0 ? `<div class="total-row"><span>Delivery Fee</span><span>${money(data.deliveryFeePaise)}</span></div>` : ""}
    <div class="total-row"><span>CGST</span><span>${money(data.cgstPaise)}</span></div>
    <div class="total-row"><span>SGST</span><span>${money(data.sgstPaise)}</span></div>
    <div class="total-row final"><span>Total</span><span>${money(data.totalPaise)}</span></div>
  </div>

  <div class="footer">
    <p>This is a computer-generated invoice. Thank you for your order!</p>
  </div>
</body>
</html>`;
}
