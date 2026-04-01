import type { InvoiceTemplate, InvoiceSettings } from "@/hooks/useInvoiceSettings";
import { isGstRegistered } from "@/lib/gst-utils";

interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  invoice_type: string;
  credit_note_for?: string;
  business_name: string;
  business_gstin: string;
  business_address?: string;
  business_state?: string;
  business_state_code?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_gstin?: string;
  subtotal: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  total: number;
  payment_method?: string;
  line_items: any[];
}

interface FormatCurrency {
  format: (n: number) => string;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function buildLineItemRows(items: any[], isIgst: boolean, currency: FormatCurrency) {
  return items.map((item: any, idx: number) => {
    const inclusiveAmt = Number(item.quantity) * Number(item.unit_price);
    const taxableAmt = Math.round((inclusiveAmt / (1 + Number(item.gst_rate) / 100)) * 100) / 100;
    return `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:6px 8px;">${idx + 1}</td>
        <td style="padding:6px 8px;">${item.item_name} <span style="font-size:9px;padding:1px 4px;border:1px solid #ccc;border-radius:3px;margin-left:4px;">${item.item_type === "service" ? "SVC" : "PRD"}</span></td>
        <td style="padding:6px 8px;font-size:11px;">${item.item_type === "service" ? (item.sac_code || "—") : (item.hsn_code || "—")}</td>
        <td style="padding:6px 8px;text-align:right;">${item.quantity}</td>
        <td style="padding:6px 8px;text-align:right;">${currency.format(taxableAmt)}</td>
        <td style="padding:6px 8px;text-align:right;">${item.gst_rate}%</td>
        ${isIgst
          ? `<td style="padding:6px 8px;text-align:right;">${currency.format(Number(item.igst_amount))}</td>`
          : `<td style="padding:6px 8px;text-align:right;">${currency.format(Number(item.cgst_amount))}</td>
             <td style="padding:6px 8px;text-align:right;">${currency.format(Number(item.sgst_amount))}</td>`
        }
        <td style="padding:6px 8px;text-align:right;font-weight:600;">${currency.format(Number(item.line_total))}</td>
      </tr>`;
  }).join("");
}

function buildTableHeader(isIgst: boolean) {
  return `
    <tr style="background:#f5f5f5;border-bottom:2px solid #ddd;">
      <th style="text-align:left;padding:8px;font-size:11px;font-weight:600;">#</th>
      <th style="text-align:left;padding:8px;font-size:11px;font-weight:600;">Item</th>
      <th style="text-align:left;padding:8px;font-size:11px;font-weight:600;">HSN/SAC</th>
      <th style="text-align:right;padding:8px;font-size:11px;font-weight:600;">Qty</th>
      <th style="text-align:right;padding:8px;font-size:11px;font-weight:600;">Taxable</th>
      <th style="text-align:right;padding:8px;font-size:11px;font-weight:600;">GST%</th>
      ${isIgst
        ? `<th style="text-align:right;padding:8px;font-size:11px;font-weight:600;">IGST</th>`
        : `<th style="text-align:right;padding:8px;font-size:11px;font-weight:600;">CGST</th>
           <th style="text-align:right;padding:8px;font-size:11px;font-weight:600;">SGST</th>`
      }
      <th style="text-align:right;padding:8px;font-size:11px;font-weight:600;">Total</th>
    </tr>`;
}

function buildTotals(inv: InvoiceData, currency: FormatCurrency) {
  const isIgst = Number(inv.igst_total) > 0;
  let rows = `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;"><span style="color:#666;">Taxable Amount</span><span>${currency.format(Number(inv.subtotal))}</span></div>`;
  if (isIgst) {
    rows += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;"><span style="color:#666;">IGST</span><span>${currency.format(Number(inv.igst_total))}</span></div>`;
  } else {
    rows += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;"><span style="color:#666;">CGST</span><span>${currency.format(Number(inv.cgst_total))}</span></div>`;
    rows += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;"><span style="color:#666;">SGST</span><span>${currency.format(Number(inv.sgst_total))}</span></div>`;
  }
  rows += `<div style="border-top:2px solid #111;margin-top:6px;padding-top:8px;display:flex;justify-content:space-between;font-size:14px;font-weight:700;"><span>Total (incl. GST)</span><span>${currency.format(Number(inv.total))}</span></div>`;
  return rows;
}

function buildFooter(settings: InvoiceSettings, inv: InvoiceData) {
  let html = "";
  if (inv.payment_method) {
    html += `<p style="margin-top:16px;font-size:12px;color:#666;">Payment: ${inv.payment_method}</p>`;
  }
  if (settings.terms) {
    html += `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #eee;"><p style="font-size:10px;font-weight:600;text-transform:uppercase;color:#888;margin-bottom:4px;">Terms & Conditions</p><p style="font-size:11px;color:#666;white-space:pre-line;">${settings.terms}</p></div>`;
  }
  if (settings.footer_note) {
    html += `<p style="margin-top:20px;text-align:center;font-size:12px;color:#666;font-style:italic;">${settings.footer_note}</p>`;
  }
  return html;
}

function logoImg(url: string, maxH = 60) {
  if (!url) return "";
  return `<img src="${url}" alt="Logo" style="max-height:${maxH}px;max-width:180px;object-fit:contain;" />`;
}

// ─── CLASSIC TEMPLATE ──────────────────────
function classicTemplate(inv: InvoiceData, settings: InvoiceSettings, currency: FormatCurrency) {
  const isIgst = Number(inv.igst_total) > 0;
  const docType = inv.invoice_type === "credit_note" ? "Credit Note" : "Tax Invoice";
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        ${settings.logo_url ? `<div style="margin-bottom:8px;">${logoImg(settings.logo_url)}</div>` : ""}
        <h1 style="font-size:18px;font-weight:700;margin:0;">${inv.business_name}</h1>
        <p style="font-size:12px;color:#666;margin:2px 0;">GSTIN: ${inv.business_gstin}</p>
        ${inv.business_address ? `<p style="font-size:12px;color:#666;margin:2px 0;">${inv.business_address}</p>` : ""}
        ${inv.business_state ? `<p style="font-size:12px;color:#666;margin:2px 0;">${inv.business_state} (${inv.business_state_code})</p>` : ""}
      </div>
      <div style="text-align:right;">
        <p style="font-size:11px;padding:2px 8px;border:1px solid ${inv.invoice_type === "credit_note" ? "#e11" : "#888"};border-radius:4px;display:inline-block;color:${inv.invoice_type === "credit_note" ? "#e11" : "#444"};font-weight:600;">${docType}</p>
        <p style="font-size:14px;font-weight:600;margin-top:6px;">${inv.invoice_number}</p>
        <p style="font-size:12px;color:#666;">${formatDate(inv.invoice_date)}</p>
        ${inv.credit_note_for ? `<p style="font-size:11px;color:#666;">Against: ${inv.credit_note_for}</p>` : ""}
      </div>
    </div>
    <hr style="border:none;border-top:1px solid #ddd;margin:12px 0;" />
    <div style="margin-bottom:16px;">
      <p style="font-size:10px;font-weight:600;text-transform:uppercase;color:#666;margin-bottom:4px;">Bill To</p>
      <p style="font-weight:600;margin:0;">${inv.customer_name || "—"}</p>
      ${inv.customer_email ? `<p style="font-size:12px;color:#666;margin:2px 0;">${inv.customer_email}</p>` : ""}
      ${inv.customer_phone ? `<p style="font-size:12px;color:#666;margin:2px 0;">${inv.customer_phone}</p>` : ""}
      ${inv.customer_gstin ? `<p style="font-size:12px;color:#666;margin:2px 0;">GSTIN: ${inv.customer_gstin}</p>` : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>${buildTableHeader(isIgst)}</thead>
      <tbody>${buildLineItemRows(inv.line_items || [], isIgst, currency)}</tbody>
    </table>
    <div style="margin-top:16px;margin-left:auto;width:280px;">
      ${buildTotals(inv, currency)}
    </div>
    ${buildFooter(settings, inv)}
  `;
}

// ─── MODERN TEMPLATE ───────────────────────
function modernTemplate(inv: InvoiceData, settings: InvoiceSettings, currency: FormatCurrency) {
  const isIgst = Number(inv.igst_total) > 0;
  const docType = inv.invoice_type === "credit_note" ? "CREDIT NOTE" : "TAX INVOICE";
  const accent = "#2563eb";
  return `
    <div style="border-top:4px solid ${accent};padding-top:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:12px;">
          ${settings.logo_url ? logoImg(settings.logo_url, 48) : ""}
          <div>
            <h1 style="font-size:20px;font-weight:800;margin:0;color:#111;">${inv.business_name}</h1>
            <p style="font-size:11px;color:#888;margin:0;">${inv.business_gstin}</p>
          </div>
        </div>
        <div style="text-align:right;">
          <p style="font-size:18px;font-weight:800;color:${accent};margin:0;letter-spacing:2px;">${docType}</p>
          <p style="font-size:13px;color:#444;margin:4px 0 0;">${inv.invoice_number}</p>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:20px;">
        <div>
          <p style="font-size:10px;text-transform:uppercase;color:#888;font-weight:600;margin:0 0 4px;">From</p>
          <p style="font-weight:600;margin:0;">${inv.business_name}</p>
          ${inv.business_address ? `<p style="font-size:12px;color:#666;margin:2px 0;">${inv.business_address}</p>` : ""}
          ${inv.business_state ? `<p style="font-size:12px;color:#666;margin:2px 0;">${inv.business_state}</p>` : ""}
        </div>
        <div>
          <p style="font-size:10px;text-transform:uppercase;color:#888;font-weight:600;margin:0 0 4px;">Bill To</p>
          <p style="font-weight:600;margin:0;">${inv.customer_name || "—"}</p>
          ${inv.customer_email ? `<p style="font-size:12px;color:#666;margin:2px 0;">${inv.customer_email}</p>` : ""}
          ${inv.customer_phone ? `<p style="font-size:12px;color:#666;margin:2px 0;">${inv.customer_phone}</p>` : ""}
          ${inv.customer_gstin ? `<p style="font-size:12px;color:#666;margin:2px 0;">GSTIN: ${inv.customer_gstin}</p>` : ""}
        </div>
        <div style="text-align:right;">
          <p style="font-size:10px;text-transform:uppercase;color:#888;font-weight:600;margin:0 0 4px;">Details</p>
          <p style="font-size:12px;margin:2px 0;">Date: ${formatDate(inv.invoice_date)}</p>
          ${inv.payment_method ? `<p style="font-size:12px;margin:2px 0;">Payment: ${inv.payment_method}</p>` : ""}
          ${inv.credit_note_for ? `<p style="font-size:12px;margin:2px 0;">Against: ${inv.credit_note_for}</p>` : ""}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:${accent};color:#fff;">
            <th style="text-align:left;padding:10px 8px;font-size:11px;font-weight:600;">#</th>
            <th style="text-align:left;padding:10px 8px;font-size:11px;font-weight:600;">Item</th>
            <th style="text-align:left;padding:10px 8px;font-size:11px;font-weight:600;">HSN/SAC</th>
            <th style="text-align:right;padding:10px 8px;font-size:11px;font-weight:600;">Qty</th>
            <th style="text-align:right;padding:10px 8px;font-size:11px;font-weight:600;">Taxable</th>
            <th style="text-align:right;padding:10px 8px;font-size:11px;font-weight:600;">GST%</th>
            ${isIgst
              ? `<th style="text-align:right;padding:10px 8px;font-size:11px;font-weight:600;">IGST</th>`
              : `<th style="text-align:right;padding:10px 8px;font-size:11px;font-weight:600;">CGST</th>
                 <th style="text-align:right;padding:10px 8px;font-size:11px;font-weight:600;">SGST</th>`
            }
            <th style="text-align:right;padding:10px 8px;font-size:11px;font-weight:600;">Total</th>
          </tr>
        </thead>
        <tbody>${buildLineItemRows(inv.line_items || [], isIgst, currency)}</tbody>
      </table>
      <div style="margin-top:20px;margin-left:auto;width:300px;background:#f8f9fa;border-radius:8px;padding:16px;">
        ${buildTotals(inv, currency)}
      </div>
      ${buildFooter(settings, inv)}
    </div>
  `;
}

// ─── COMPACT TEMPLATE ──────────────────────
function compactTemplate(inv: InvoiceData, settings: InvoiceSettings, currency: FormatCurrency) {
  const isIgst = Number(inv.igst_total) > 0;
  const docType = inv.invoice_type === "credit_note" ? "Credit Note" : "Tax Invoice";
  return `
    <div style="font-size:11px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #111;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${settings.logo_url ? logoImg(settings.logo_url, 36) : ""}
          <span style="font-size:16px;font-weight:700;">${inv.business_name}</span>
        </div>
        <div style="text-align:right;">
          <span style="font-weight:700;">${docType}</span> · ${inv.invoice_number} · ${formatDate(inv.invoice_date)}
        </div>
      </div>
      <div style="display:flex;gap:24px;margin-bottom:12px;font-size:11px;">
        <div style="flex:1;">
          <span style="font-weight:600;">From:</span> ${inv.business_name} · GSTIN: ${inv.business_gstin}
          ${inv.business_address ? ` · ${inv.business_address}` : ""}
        </div>
        <div style="flex:1;">
          <span style="font-weight:600;">To:</span> ${inv.customer_name || "—"}
          ${inv.customer_email ? ` · ${inv.customer_email}` : ""}
          ${inv.customer_gstin ? ` · GSTIN: ${inv.customer_gstin}` : ""}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#f0f0f0;border-bottom:1px solid #ccc;">
            <th style="text-align:left;padding:4px 6px;font-size:10px;">#</th>
            <th style="text-align:left;padding:4px 6px;font-size:10px;">Item</th>
            <th style="text-align:left;padding:4px 6px;font-size:10px;">Code</th>
            <th style="text-align:right;padding:4px 6px;font-size:10px;">Qty</th>
            <th style="text-align:right;padding:4px 6px;font-size:10px;">Taxable</th>
            <th style="text-align:right;padding:4px 6px;font-size:10px;">GST%</th>
            ${isIgst
              ? `<th style="text-align:right;padding:4px 6px;font-size:10px;">IGST</th>`
              : `<th style="text-align:right;padding:4px 6px;font-size:10px;">CGST</th>
                 <th style="text-align:right;padding:4px 6px;font-size:10px;">SGST</th>`
            }
            <th style="text-align:right;padding:4px 6px;font-size:10px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${(inv.line_items || []).map((item: any, idx: number) => {
            const inclusiveAmt = Number(item.quantity) * Number(item.unit_price);
            const taxableAmt = Math.round((inclusiveAmt / (1 + Number(item.gst_rate) / 100)) * 100) / 100;
            return `<tr style="border-bottom:1px solid #eee;">
              <td style="padding:3px 6px;">${idx + 1}</td>
              <td style="padding:3px 6px;">${item.item_name}</td>
              <td style="padding:3px 6px;">${item.item_type === "service" ? (item.sac_code || "—") : (item.hsn_code || "—")}</td>
              <td style="padding:3px 6px;text-align:right;">${item.quantity}</td>
              <td style="padding:3px 6px;text-align:right;">${currency.format(taxableAmt)}</td>
              <td style="padding:3px 6px;text-align:right;">${item.gst_rate}%</td>
              ${isIgst
                ? `<td style="padding:3px 6px;text-align:right;">${currency.format(Number(item.igst_amount))}</td>`
                : `<td style="padding:3px 6px;text-align:right;">${currency.format(Number(item.cgst_amount))}</td>
                   <td style="padding:3px 6px;text-align:right;">${currency.format(Number(item.sgst_amount))}</td>`
              }
              <td style="padding:3px 6px;text-align:right;font-weight:600;">${currency.format(Number(item.line_total))}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <div style="margin-top:8px;margin-left:auto;width:240px;">
        ${buildTotals(inv, currency)}
      </div>
      ${buildFooter(settings, inv)}
    </div>
  `;
}

export function renderInvoiceHtml(
  invoice: InvoiceData,
  settings: InvoiceSettings,
  currency: FormatCurrency,
): string {
  switch (settings.template) {
    case "modern":
      return modernTemplate(invoice, settings, currency);
    case "compact":
      return compactTemplate(invoice, settings, currency);
    case "classic":
    default:
      return classicTemplate(invoice, settings, currency);
  }
}

export function openPrintWindow(html: string, title: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <html><head><title>${title}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111; padding: 24px; }
      @media print { body { padding: 0; } }
    </style></head><body>
    ${html}
    <script>window.onload = function() { window.print(); }<\/script>
    </body></html>
  `);
  printWindow.document.close();
}
