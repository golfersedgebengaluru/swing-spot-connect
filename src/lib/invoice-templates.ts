import type { InvoiceTemplate, InvoiceSettings } from "@/hooks/useInvoiceSettings";
import { isGstRegistered } from "@/lib/gst-utils";

/**
 * Optional city invoice profile fields. When provided they render as
 * extra blocks (contact line, bank details, signature, declaration,
 * jurisdiction). When absent, templates fall back to the legacy minimal
 * layout — guaranteeing backwards compatibility.
 */
export interface InvoiceProfileExtras {
  phone?: string;
  email?: string;
  website?: string;
  pan?: string;
  cin?: string;
  msme_no?: string;
  address_line2?: string;
  pincode?: string;
  country?: string;
  bank_name?: string;
  bank_account_holder?: string;
  bank_account_no?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  bank_swift?: string;
  upi_id?: string;
  show_upi_qr?: boolean;
  signature_url?: string;
  authorised_signatory_name?: string;
  show_signature?: boolean;
  declaration?: string;
  jurisdiction?: string;
  payment_terms_label?: string;
  payment_instructions?: string;
  brand_color?: string;
}

export type EffectiveInvoiceSettings = InvoiceSettings & InvoiceProfileExtras;

interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  invoice_type: string;
  invoice_category?: string;
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
  payment_reference?: string;
  notes?: string;
  due_date?: string;
  line_items: any[];
  booking?: {
    start_time: string;
    end_time: string;
    bay_name?: string;
    session_type?: string;
  } | null;
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

function buildBookingInfo(inv: InvoiceData) {
  if (inv.invoice_category !== "booking" || !inv.booking) return "";
  try {
    const start = new Date(inv.booking.start_time);
    const end = new Date(inv.booking.end_time);
    const dateStr = start.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const startTime = start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const endTime = end.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    let info = `<div style="margin-bottom:16px;padding:10px 14px;background:#f0f7ff;border-radius:6px;border:1px solid #d0e3f7;">
      <p style="font-size:10px;font-weight:600;text-transform:uppercase;color:#4a7ab5;margin:0 0 4px;">Booking Details</p>
      <p style="font-size:12px;margin:2px 0;"><strong>Date:</strong> ${dateStr}</p>
      <p style="font-size:12px;margin:2px 0;"><strong>Time:</strong> ${startTime} – ${endTime}</p>`;
    if (inv.booking.bay_name) {
      info += `<p style="font-size:12px;margin:2px 0;"><strong>Location:</strong> ${inv.booking.bay_name}</p>`;
    }
    info += `</div>`;
    return info;
  } catch {
    return "";
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildBusinessContactLine(s: EffectiveInvoiceSettings) {
  const bits: string[] = [];
  if (s.phone) bits.push(`Tel: ${escapeHtml(s.phone)}`);
  if (s.email) bits.push(`Email: ${escapeHtml(s.email)}`);
  if (s.website) bits.push(`Web: ${escapeHtml(s.website)}`);
  if (!bits.length) return "";
  return `<p style="font-size:11px;color:#666;margin:2px 0;">${bits.join(" · ")}</p>`;
}

function buildIdentityIds(s: EffectiveInvoiceSettings) {
  const bits: string[] = [];
  if (s.pan) bits.push(`PAN: ${escapeHtml(s.pan)}`);
  if (s.cin) bits.push(`CIN: ${escapeHtml(s.cin)}`);
  if (s.msme_no) bits.push(`MSME/Udyam: ${escapeHtml(s.msme_no)}`);
  if (!bits.length) return "";
  return `<p style="font-size:11px;color:#666;margin:2px 0;">${bits.join(" · ")}</p>`;
}

function buildBankBlock(s: EffectiveInvoiceSettings) {
  const hasBank = s.bank_name || s.bank_account_no || s.bank_ifsc || s.upi_id;
  if (!hasBank) return "";
  const rows: string[] = [];
  if (s.bank_name) rows.push(`<strong>Bank:</strong> ${escapeHtml(s.bank_name)}`);
  if (s.bank_account_holder) rows.push(`<strong>A/C Holder:</strong> ${escapeHtml(s.bank_account_holder)}`);
  if (s.bank_account_no) rows.push(`<strong>A/C No:</strong> ${escapeHtml(s.bank_account_no)}`);
  if (s.bank_ifsc) rows.push(`<strong>IFSC:</strong> ${escapeHtml(s.bank_ifsc)}`);
  if (s.bank_branch) rows.push(`<strong>Branch:</strong> ${escapeHtml(s.bank_branch)}`);
  if (s.bank_swift) rows.push(`<strong>SWIFT:</strong> ${escapeHtml(s.bank_swift)}`);
  if (s.upi_id) rows.push(`<strong>UPI:</strong> ${escapeHtml(s.upi_id)}`);
  return `<div style="margin-top:14px;padding:10px 12px;background:#fafafa;border:1px solid #eee;border-radius:6px;">
    <p style="font-size:10px;font-weight:600;text-transform:uppercase;color:#666;margin:0 0 6px;">Payment Details</p>
    <p style="font-size:11px;color:#333;line-height:1.6;margin:0;">${rows.join(" &middot; ")}</p>
  </div>`;
}

function buildSignatureBlock(s: EffectiveInvoiceSettings) {
  if (!s.show_signature) return "";
  const hasAny = s.signature_url || s.authorised_signatory_name;
  if (!hasAny) return "";
  return `<div style="margin-top:24px;text-align:right;">
    ${s.signature_url ? `<img src="${escapeHtml(s.signature_url)}" alt="Signature" style="max-height:48px;max-width:160px;object-fit:contain;margin-bottom:4px;" />` : ""}
    <p style="font-size:11px;color:#444;margin:0;border-top:1px solid #999;padding-top:4px;display:inline-block;min-width:160px;">
      ${s.authorised_signatory_name ? escapeHtml(s.authorised_signatory_name) : "Authorised Signatory"}
    </p>
  </div>`;
}

function buildDeclarationJurisdiction(s: EffectiveInvoiceSettings) {
  let html = "";
  if (s.declaration) {
    html += `<p style="margin-top:14px;font-size:10px;color:#666;font-style:italic;">${escapeHtml(s.declaration)}</p>`;
  }
  if (s.jurisdiction) {
    html += `<p style="margin-top:6px;font-size:10px;color:#666;">${escapeHtml(s.jurisdiction)}</p>`;
  }
  return html;
}

function buildPaymentTermsLine(inv: InvoiceData, s: EffectiveInvoiceSettings) {
  const bits: string[] = [];
  if (s.payment_terms_label) bits.push(`<strong>Terms:</strong> ${escapeHtml(s.payment_terms_label)}`);
  if (inv.due_date) bits.push(`<strong>Due:</strong> ${formatDate(inv.due_date)}`);
  if (s.payment_instructions) bits.push(escapeHtml(s.payment_instructions));
  if (!bits.length) return "";
  return `<p style="margin-top:10px;font-size:11px;color:#444;">${bits.join(" · ")}</p>`;
}

function buildFooter(settings: EffectiveInvoiceSettings, inv: InvoiceData) {
  let html = "";
  const paymentBits: string[] = [];
  if (inv.payment_method) paymentBits.push(`Method: ${escapeHtml(inv.payment_method)}`);
  if (inv.payment_reference) paymentBits.push(`Reference: ${escapeHtml(inv.payment_reference)}`);
  if (paymentBits.length) {
    html += `<p style="margin-top:16px;font-size:12px;color:#444;"><strong>Payment</strong> — ${paymentBits.join(" · ")}</p>`;
  }
  html += buildPaymentTermsLine(inv, settings);
  html += buildBankBlock(settings);
  if (inv.notes && inv.notes.trim()) {
    html += `<div style="margin-top:14px;padding:10px 12px;background:#fafafa;border:1px solid #eee;border-radius:6px;">
      <p style="font-size:10px;font-weight:600;text-transform:uppercase;color:#666;margin:0 0 4px;">Notes / Comments</p>
      <p style="font-size:12px;color:#333;white-space:pre-line;margin:0;">${escapeHtml(inv.notes)}</p>
    </div>`;
  }
  if (settings.terms) {
    html += `<div style="margin-top:20px;padding-top:12px;border-top:1px solid #eee;"><p style="font-size:10px;font-weight:600;text-transform:uppercase;color:#888;margin-bottom:4px;">Terms & Conditions</p><p style="font-size:11px;color:#666;white-space:pre-line;">${escapeHtml(settings.terms)}</p></div>`;
  }
  html += buildSignatureBlock(settings);
  html += buildDeclarationJurisdiction(settings);
  if (settings.footer_note) {
    html += `<p style="margin-top:20px;text-align:center;font-size:12px;color:#666;font-style:italic;">${escapeHtml(settings.footer_note)}</p>`;
  }
  return html;
}

function logoImg(url: string, maxH = 60) {
  if (!url) return "";
  return `<img src="${url}" alt="Logo" style="max-height:${maxH}px;max-width:180px;object-fit:contain;" />`;
}

// ─── CLASSIC TEMPLATE ──────────────────────
function classicTemplate(inv: InvoiceData, settings: EffectiveInvoiceSettings, currency: FormatCurrency) {
  const isIgst = Number(inv.igst_total) > 0;
  const docType = inv.invoice_type === "credit_note" ? "Credit Note" : "Tax Invoice";
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        ${settings.logo_url ? `<div style="margin-bottom:8px;">${logoImg(settings.logo_url)}</div>` : ""}
        <h1 style="font-size:18px;font-weight:700;margin:0;">${escapeHtml(inv.business_name)}</h1>
        ${isGstRegistered(inv.business_gstin) ? `<p style="font-size:12px;color:#666;margin:2px 0;">GSTIN: ${escapeHtml(inv.business_gstin)}</p>` : ""}
        ${buildIdentityIds(settings)}
        ${inv.business_address ? `<p style="font-size:12px;color:#666;margin:2px 0;">${escapeHtml(inv.business_address)}</p>` : ""}
        ${inv.business_state ? `<p style="font-size:12px;color:#666;margin:2px 0;">${escapeHtml(inv.business_state)} (${escapeHtml(inv.business_state_code || "")})</p>` : ""}
        ${buildBusinessContactLine(settings)}
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
    ${buildBookingInfo(inv)}
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
function modernTemplate(inv: InvoiceData, settings: EffectiveInvoiceSettings, currency: FormatCurrency) {
  const isIgst = Number(inv.igst_total) > 0;
  const docType = inv.invoice_type === "credit_note" ? "CREDIT NOTE" : "TAX INVOICE";
  const accent = settings.brand_color ? escapeHtml(settings.brand_color) : "#2563eb";
  return `
    <div style="border-top:4px solid ${accent};padding-top:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:12px;">
          ${settings.logo_url ? logoImg(settings.logo_url, 48) : ""}
          <div>
            <h1 style="font-size:20px;font-weight:800;margin:0;color:#111;">${inv.business_name}</h1>
            ${isGstRegistered(inv.business_gstin) ? `<p style="font-size:11px;color:#888;margin:0;">${inv.business_gstin}</p>` : ""}
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
          ${inv.business_address ? `<p style="font-size:12px;color:#666;margin:2px 0;">${escapeHtml(inv.business_address)}</p>` : ""}
          ${inv.business_state ? `<p style="font-size:12px;color:#666;margin:2px 0;">${escapeHtml(inv.business_state)}</p>` : ""}
          ${buildBusinessContactLine(settings)}
          ${buildIdentityIds(settings)}
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
      ${buildBookingInfo(inv)}
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
function compactTemplate(inv: InvoiceData, settings: EffectiveInvoiceSettings, currency: FormatCurrency) {
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
          <span style="font-weight:600;">From:</span> ${inv.business_name}${isGstRegistered(inv.business_gstin) ? ` · GSTIN: ${inv.business_gstin}` : ""}
          ${inv.business_address ? ` · ${inv.business_address}` : ""}
        </div>
        <div style="flex:1;">
          <span style="font-weight:600;">To:</span> ${inv.customer_name || "—"}
          ${inv.customer_email ? ` · ${inv.customer_email}` : ""}
          ${inv.customer_gstin ? ` · GSTIN: ${inv.customer_gstin}` : ""}
        </div>
      </div>
      ${buildBookingInfo(inv)}
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
  settings: EffectiveInvoiceSettings,
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
  // Wait for all images (incl. remote logo) to finish loading before calling
  // window.print(). Otherwise the print dialog opens before the logo network
  // fetch completes and the logo prints blank. Fallback: 2.5s per image.
  printWindow.document.write(`
    <html><head><title>${title}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111; padding: 24px; }
      @media print { body { padding: 0; } }
      img { max-width: 100%; }
    </style></head><body>
    ${html}
    <script>
      (function(){
        function ready(){
          var imgs = Array.prototype.slice.call(document.images || []);
          if (imgs.length === 0) return Promise.resolve();
          return Promise.all(imgs.map(function(img){
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(function(res){
              var done = false;
              function finish(){ if (done) return; done = true; res(); }
              img.addEventListener('load', finish);
              img.addEventListener('error', finish);
              setTimeout(finish, 2500);
            });
          }));
        }
        window.addEventListener('load', function(){
          ready().then(function(){ setTimeout(function(){ window.print(); }, 50); });
        });
      })();
    <\/script>
    </body></html>
  `);
  printWindow.document.close();
}
