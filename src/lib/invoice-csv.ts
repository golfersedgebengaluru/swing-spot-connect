/**
 * Invoice CSV export.
 *
 * Rules:
 *  - Every field is RFC-4180 escaped (commas, quotes, newlines are safe).
 *  - A UTF-8 BOM is prefixed so Excel renders non-ASCII names correctly.
 *  - Credit notes are exported with NEGATIVE money columns so a plain
 *    sum of the file ties back to net revenue.
 *  - Cancelled invoices keep their own amounts but are flagged in `Status`;
 *    they are excluded from the totals row (their credit note carries the
 *    reversal).
 *  - A single TOTAL row closes the file for quick reconciliation.
 */

export interface InvoiceCsvRow {
  invoice_number: string;
  invoice_date: string;
  city?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_gstin?: string | null;
  invoice_type: string;
  invoice_category?: string | null;
  subtotal?: number | string | null;
  discount_type?: string | null;
  discount_value?: number | string | null;
  discount_amount?: number | string | null;
  cgst_total?: number | string | null;
  sgst_total?: number | string | null;
  igst_total?: number | string | null;
  total?: number | string | null;
  amount_paid?: number | string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  due_date?: string | null;
  status: string;
  credit_note_for?: string | null;
  notes?: string | null;
}

export const INVOICE_CSV_HEADERS = [
  "Invoice #",
  "Date",
  "City",
  "Customer",
  "Email",
  "Phone",
  "GSTIN",
  "B2B/B2C",
  "Document Type",
  "Category",
  "Subtotal",
  "Discount Type",
  "Discount Value",
  "Discount Amount",
  "CGST",
  "SGST",
  "IGST",
  "Total",
  "Amount Paid",
  "Balance Due",
  "Payment Status",
  "Payment Method",
  "Payment Reference",
  "Due Date",
  "Status",
  "Credit Note For",
  "Notes",
] as const;

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(escapeCsvValue).join(",")).join("\r\n");
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sort by invoice number so sequence gaps are obvious. */
export function sortInvoicesForExport<T extends { invoice_number: string; invoice_date: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) =>
    a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true, sensitivity: "base" }),
  );
}

export function buildInvoiceCsv(invoices: InvoiceCsvRow[]): string {
  const sorted = sortInvoicesForExport(invoices);

  let tSubtotal = 0, tDiscount = 0, tCgst = 0, tSgst = 0, tIgst = 0, tTotal = 0, tPaid = 0, tDue = 0;

  const body = sorted.map((inv) => {
    const isCreditNote = inv.invoice_type === "credit_note";
    const sign = isCreditNote ? -1 : 1;
    const subtotal = round2(sign * num(inv.subtotal));
    const discount = round2(sign * num(inv.discount_amount));
    const cgst = round2(sign * num(inv.cgst_total));
    const sgst = round2(sign * num(inv.sgst_total));
    const igst = round2(sign * num(inv.igst_total));
    const total = round2(sign * num(inv.total));
    const paid = round2(sign * num(inv.amount_paid));
    const due = round2(total - paid);

    // Cancelled invoices are reversed by their credit note; excluding them
    // keeps the totals row equal to net revenue for the period.
    if (inv.status !== "cancelled") {
      tSubtotal += subtotal;
      tDiscount += discount;
      tCgst += cgst;
      tSgst += sgst;
      tIgst += igst;
      tTotal += total;
      tPaid += paid;
      tDue += due;
    }

    return [
      inv.invoice_number,
      inv.invoice_date,
      inv.city ?? "",
      inv.customer_name ?? "",
      inv.customer_email ?? "",
      inv.customer_phone ?? "",
      inv.customer_gstin ?? "",
      inv.customer_gstin ? "B2B" : "B2C",
      isCreditNote ? "Credit Note" : "Invoice",
      inv.invoice_category ?? "",
      subtotal,
      inv.discount_type ?? "",
      inv.discount_value != null ? num(inv.discount_value) : "",
      discount,
      cgst,
      sgst,
      igst,
      total,
      paid,
      due,
      inv.payment_status ?? "",
      inv.payment_method ?? "",
      inv.payment_reference ?? "",
      inv.due_date ?? "",
      inv.status,
      inv.credit_note_for ?? "",
      inv.notes ?? "",
    ];
  });

  const totalsRow: (string | number)[] = new Array(INVOICE_CSV_HEADERS.length).fill("");
  totalsRow[0] = `TOTAL (${sorted.length} documents)`;
  totalsRow[10] = round2(tSubtotal);
  totalsRow[13] = round2(tDiscount);
  totalsRow[14] = round2(tCgst);
  totalsRow[15] = round2(tSgst);
  totalsRow[16] = round2(tIgst);
  totalsRow[17] = round2(tTotal);
  totalsRow[18] = round2(tPaid);
  totalsRow[19] = round2(tDue);

  return "\uFEFF" + toCsv([[...INVOICE_CSV_HEADERS], ...body, totalsRow]);
}

export function invoiceCsvFileName(opts: {
  city?: string | null;
  startDate?: string;
  endDate?: string;
}): string {
  const city = (opts.city || "all-cities").replace(/[^a-z0-9]+/gi, "_");
  const range =
    opts.startDate || opts.endDate
      ? `_${opts.startDate || "start"}_to_${opts.endDate || "today"}`
      : `_${new Date().toISOString().split("T")[0]}`;
  return `invoices_${city}${range}.csv`;
}

export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
