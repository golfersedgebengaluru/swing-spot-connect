import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { isProfileGstRegistered } from "@/lib/gst-utils";
import { buildHsnAudit } from "@/lib/gstr1-hsn";

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  invoice_type: string;
  invoice_category: string;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_state: string | null;
  customer_state_code: string | null;
  business_gstin: string;
  business_state: string | null;
  business_state_code: string | null;
  subtotal: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  total: number;
  credit_note_for: string | null;
  status: string;
  city: string | null;
}

export interface LineItem {
  id?: string;
  item_type?: string;
  invoice_id: string;
  item_name: string;
  hsn_code: string | null;
  sac_code: string | null;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  line_total: number;
  product_id: string | null;
}

/**
 * GSTR-1 export.
 *
 * Invariant: in this system, `unit_price` and `line_total` on
 * `invoice_line_items` are GST-INCLUSIVE (gross). The taxable
 * (exclusive) value is reverse-computed per line as
 *   taxable = line_total - (cgst + sgst + igst)
 *
 * Every per-line GST rate is honoured (we never assume a single
 * rate per invoice). Both B2B/CDNR (per-invoice) and B2CS/CDNUR
 * (aggregated) sheets are split by GST rate, and the HSN summary
 * is keyed by (B2B/B2C, HSN/SAC, rate, UQC). Audit sheets expose
 * missing historical metadata; this is not a GST portal upload file.
 */
export async function generateGSTR1Excel(city: string, year: number, month: number) {
  const monthStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  // Fetch GST profile
  const { data: gstProfile, error: profileError } = await supabase.from("gst_profiles")
    .select("*")
    .eq("city", city)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!gstProfile) throw new Error("GST profile not found for this city.");
  const gst = gstProfile as unknown as {
    state_code: string;
    state: string;
    gstin: string | null;
    is_gst_registered?: boolean | null;
  };
  // Only GST-registered cities file GSTR-1. An unregistered city (e.g. Chennai)
  // issues plain invoices with no tax component and must never appear in a return.
  if (!isProfileGstRegistered(gst)) {
    throw new Error(
      `${city} is not GST registered, so it has no GSTR-1 filing. ` +
      `Update Finance → GST Settings if this is wrong.`
    );
  }


  // Fetch invoices for the month. Paged explicitly: a bare select is capped at
  // 1000 rows by the API, which would silently drop invoices in a busy month.
  const allInvoices: Invoice[] = [];
  const invChunk = 1000;
  for (let from = 0; ; from += invChunk) {
    const { data: invoices, error: invErr } = await supabase.from("invoices")
      .select("*")
      .eq("city", city)
      .gte("invoice_date", monthStart)
      .lte("invoice_date", monthEnd)
      .in("status", ["issued", "paid", "cancelled"])
      .order("invoice_date")
      .order("id")
      .range(from, from + invChunk - 1);
    if (invErr) throw invErr;
    const batch = (invoices ?? []) as unknown as Invoice[];
    allInvoices.push(...batch);
    if (batch.length < invChunk) break;
  }


  // Fetch line items (chunked by invoice, and paged inside each chunk so a
  // chunk with many lines is never truncated at the API row cap).
  const invoiceIds = allInvoices.map((i) => i.id);
  let allLineItems: LineItem[] = [];
  const liPage = 1000;
  for (let i = 0; i < invoiceIds.length; i += 50) {
    const chunk = invoiceIds.slice(i, i + 50);
    for (let from = 0; ; from += liPage) {
      const { data: items, error: liErr } = await supabase.from("invoice_line_items")
        .select("*")
        .in("invoice_id", chunk)
        .order("invoice_id")
        .order("id")
        .range(from, from + liPage - 1);
      if (liErr) throw liErr;
      const batch = (items ?? []) as unknown as LineItem[];
      allLineItems = allLineItems.concat(batch);
      if (batch.length < liPage) break;
    }
  }


  // Catalogue metadata is review-only for rates/codes; UQC is not snapshotted
  // on invoice lines, so its current source is explicitly disclosed in the audit.
  const productIds = Array.from(
    new Set(allLineItems.map((li) => li.product_id).filter(Boolean) as string[])
  );
  const products = [];
  for (let i = 0; i < productIds.length; i += 100) {
    const { data: prods, error } = await supabase.from("products_public")
      .select("id, unit_of_measure, hsn_code, sac_code, gst_rate")
      .in("id", productIds.slice(i, i + 100));
    if (error) throw error;
    products.push(...(prods ?? []));
  }

  const lineItemsByInvoice = new Map<string, LineItem[]>();
  allLineItems.forEach((li) => {
    const arr = lineItemsByInvoice.get(li.invoice_id) || [];
    arr.push(li);
    lineItemsByInvoice.set(li.invoice_id, arr);
  });

  // A cancelled invoice may have an issued credit note (even in a later period).
  // Preserve the original supply in that case, otherwise the note double-reduces it.
  const creditedOriginals = new Set<string>();
  const cancelledIds = allInvoices.filter((i) => i.status === "cancelled" && i.invoice_type === "invoice").map((i) => i.id);
  for (let i = 0; i < cancelledIds.length; i += 100) {
    const { data, error } = await supabase.from("invoices")
      .select("credit_note_for").in("credit_note_for", cancelledIds.slice(i, i + 100))
      .in("status", ["issued", "paid"]);
    if (error) throw error;
    for (const note of data ?? []) if (note.credit_note_for) creditedOriginals.add(note.credit_note_for);
  }
  const reportInvoices = allInvoices.filter((i) => i.status !== "cancelled" || creditedOriginals.has(i.id));
  const regularInvoices = reportInvoices.filter((i) => i.invoice_type === "invoice");
  const creditNotes = reportInvoices.filter((i) => i.invoice_type === "credit_note");

  const b2bInvoices = regularInvoices.filter((i) => i.customer_gstin);
  const b2csInvoices = regularInvoices.filter((i) => !i.customer_gstin);
  const cdnrNotes = creditNotes.filter((cn) => cn.customer_gstin);
  const cdnurNotes = creditNotes.filter((cn) => !cn.customer_gstin);

  const placeOfSupply = `${gst.state_code}-${gst.state}`;

  // ── B2B Sheet (one row per invoice × GST rate) ──
  const b2bRows: any[] = [];
  b2bInvoices.forEach((inv) => {
    const lines = lineItemsByInvoice.get(inv.id) || [];
    const byRate = groupLinesByRate(lines);
    byRate.forEach((vals, rate) => {
      b2bRows.push({
        "GSTIN/UIN of Recipient": inv.customer_gstin,
        "Receiver Name": inv.customer_name || "",
        "Invoice Number": inv.invoice_number,
        "Invoice Date": inv.invoice_date,
        "Invoice Value": round2(inv.total),
        "Place Of Supply": placeOfSupply,
        "Reverse Charge": "N",
        "Invoice Type": "Regular",
        "Rate": rate,
        "Taxable Value": round2(vals.taxable),
        "CGST Amount": round2(vals.cgst),
        "SGST Amount": round2(vals.sgst),
        "IGST Amount": round2(vals.igst),
        "Cess Amount": 0,
      });
    });
  });

  // ── B2CS Sheet (aggregated by rate across invoices) ──
  const b2csMap = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  b2csInvoices.forEach((inv) => {
    const lines = lineItemsByInvoice.get(inv.id) || [];
    const byRate = groupLinesByRate(lines);
    byRate.forEach((vals, rate) => {
      const e = b2csMap.get(rate) || { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      e.taxable += vals.taxable;
      e.cgst += vals.cgst;
      e.sgst += vals.sgst;
      e.igst += vals.igst;
      b2csMap.set(rate, e);
    });
  });
  const b2csRows = Array.from(b2csMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, vals]) => ({
      "Type": "OE",
      "Place Of Supply": placeOfSupply,
      "Rate": rate,
      "Taxable Value": round2(vals.taxable),
      "CGST Amount": round2(vals.cgst),
      "SGST/UTGST Amount": round2(vals.sgst),
      "Cess Amount": 0,
    }));

  // ── CDNR Sheet (one row per note × rate) ──
  const cdnrRows: any[] = [];
  cdnrNotes.forEach((cn) => {
    const lines = lineItemsByInvoice.get(cn.id) || [];
    const byRate = groupLinesByRate(lines);
    byRate.forEach((vals, rate) => {
      cdnrRows.push({
        "GSTIN/UIN of Recipient": cn.customer_gstin,
        "Receiver Name": cn.customer_name || "",
        "Note Number": cn.invoice_number,
        "Note Date": cn.invoice_date,
        "Note Type": "C",
        "Place Of Supply": placeOfSupply,
        "Reverse Charge": "N",
        "Note Supply Type": "Regular",
        "Note Value": round2(cn.total),
        "Rate": rate,
        "Taxable Value": round2(vals.taxable),
        "CGST Amount": round2(vals.cgst),
        "SGST Amount": round2(vals.sgst),
        "IGST Amount": round2(vals.igst),
        "Cess Amount": 0,
      });
    });
  });

  // ── CDNUR Sheet (one row per note × rate) ──
  const cdnurRows: any[] = [];
  cdnurNotes.forEach((cn) => {
    const lines = lineItemsByInvoice.get(cn.id) || [];
    const byRate = groupLinesByRate(lines);
    byRate.forEach((vals, rate) => {
      cdnurRows.push({
        "Note Number": cn.invoice_number,
        "Note Date": cn.invoice_date,
        "Note Type": "C",
        "Place Of Supply": placeOfSupply,
        "Note Value": round2(cn.total),
        "Rate": rate,
        "Taxable Value": round2(vals.taxable),
        "CGST Amount": round2(vals.cgst),
        "SGST/UTGST Amount": round2(vals.sgst),
        "Cess Amount": 0,
      });
    });
  });

  const audit = buildHsnAudit(reportInvoices, allLineItems, products);

  // ── Document Summary ──
  const docRows = buildDocumentSummary(allInvoices, creditedOriginals);

  const wb = XLSX.utils.book_new();
  appendSheet(wb, b2bRows, "B2B");
  appendSheet(wb, b2csRows, "B2CS");
  appendSheet(wb, cdnrRows, "CDNR");
  appendSheet(wb, cdnurRows, "CDNUR");
  appendSheet(wb, audit.hsnRows, "HSN");
  appendSheet(wb, audit.hsnRows.filter((r) => r["Supply Type"] === "B2B"), "HSN B2B");
  appendSheet(wb, audit.hsnRows.filter((r) => r["Supply Type"] === "B2C"), "HSN B2C");
  appendSheet(wb, audit.breakdownRows, "Product Breakdown");
  appendSheet(wb, audit.reviewRows, "Review Exceptions");
  appendSheet(wb, audit.reconciliationRows, "Reconciliation");
  appendSheet(wb, [
    { Item: "Purpose", Detail: "Auditor review workbook; not GST portal JSON or an upload template. Resolve review exceptions before filing." },
    { Item: "Registration / period", Detail: `${gst.gstin} / ${city} / ${monthStart} to ${monthEnd}; invoice business dates, INR values.` },
    { Item: "HSN grouping", Detail: "B2B/B2C × invoice HSN/SAC × rate × UQC; credit notes subtract once. Product names are only in Product Breakdown." },
    { Item: "Descriptions", Detail: "No verified HSN master is stored. Description is blank pending auditor selection of the official GST master description; no product name is substituted." },
    { Item: "UQC source", Detail: "Invoice lines do not store historical units. Current catalogue units are disclosed and require confirmation; unavailable units remain UNKNOWN, never assumed NOS." },
    { Item: "Tax codes", Detail: "Check official HSN master and preceding-year turnover requirements (4 digits up to INR 5 crore; 6 digits above). Turnover is not stored here." },
    { Item: "Scope", Detail: "Existing domestic invoice/credit-note data only. Exports, SEZ, deemed exports, reverse charge, e-commerce, advances, amendments, debit notes and nil/exempt/non-GST Table 8 classification are not fully modelled; confirm applicability separately. This workbook does not certify a complete return." },
    { Item: "Documents", Detail: "Separate recorded series/ranges with cancelled and net counts. Original supplies reversed by credit notes remain supplies; no inference of missing serial numbers or unrecorded documents." },
    { Item: "Official guidance", Detail: "https://tutorial.gst.gov.in/downloads/news/updated_advisory_hsn_table12_25042025.pdf" },
  ], "Filing Notes");
  appendSheet(wb, docRows, "Docs");

  const monthLabel = format(new Date(year, month - 1), "MMM-yyyy");
  const fileName = `GSTR1_${city}_${monthLabel}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { reviewCount: audit.reviewRows.length };
}

function appendSheet(wb: XLSX.WorkBook, rows: any[], name: string) {
  if (rows.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([["No data for this section"]]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  } else {
    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0]).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
}

/** Reverse-calc taxable per line; aggregate by GST rate. */
export function groupLinesByRate(
  items: LineItem[]
): Map<number, { taxable: number; cgst: number; sgst: number; igst: number; gross: number }> {
  const map = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number; gross: number }>();
  items.forEach((li) => {
    const rate = Number(li.gst_rate) || 0;
    const gross = Number(li.line_total);
    const cgst = Number(li.cgst_amount) || 0;
    const sgst = Number(li.sgst_amount) || 0;
    const igst = Number(li.igst_amount) || 0;
    const taxable = gross - cgst - sgst - igst;
    const e = map.get(rate) || { taxable: 0, cgst: 0, sgst: 0, igst: 0, gross: 0 };
    e.taxable += taxable;
    e.cgst += cgst;
    e.sgst += sgst;
    e.igst += igst;
    e.gross += gross;
    map.set(rate, e);
  });
  return map;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Map product units to GST UQC codes (best-effort; falls back to NOS). */
export function normalizeUqc(unit: string | null | undefined): string {
  if (!unit) return "UNKNOWN";
  const u = unit.trim().toLowerCase();
  const map: Record<string, string> = {
    "each": "NOS", "nos": "NOS", "number": "NOS", "pcs": "PCS", "piece": "PCS",
    "hour": "HRS", "hours": "HRS", "hr": "HRS", "hrs": "HRS",
    "kg": "KGS", "kgs": "KGS", "kilogram": "KGS",
    "gram": "GMS", "g": "GMS", "gms": "GMS",
    "litre": "LTR", "liter": "LTR", "ltr": "LTR", "l": "LTR",
    "ml": "MLT",
    "metre": "MTR", "meter": "MTR", "m": "MTR",
    "box": "BOX", "pack": "PAC", "set": "SET", "dozen": "DOZ",
  };
  return map[u] || "UNKNOWN";
}

export function buildDocumentSummary(invoices: Invoice[], creditedOriginals = new Set<string>()) {
  const series = new Map<string, Invoice[]>();
  for (const invoice of invoices) {
    const match = invoice.invoice_number.match(/^(.*?)(\d+)$/);
    const prefix = match?.[1] ?? invoice.invoice_number;
    const key = `${invoice.invoice_type}|${prefix}`;
    const rows = series.get(key) ?? [];
    rows.push(invoice);
    series.set(key, rows);
  }
  return Array.from(series.values()).flatMap((rows) => {
    rows.sort((a, b) => a.invoice_number.localeCompare(b.invoice_number, undefined, { numeric: true }));
    // Split gaps rather than imply that unrecorded documents were issued.
    const runs: Invoice[][] = [];
    for (const row of rows) {
      const run = runs[runs.length - 1];
      const prev = run?.[run.length - 1];
      const number = Number(row.invoice_number.match(/\d+$/)?.[0]);
      const previous = Number(prev?.invoice_number.match(/\d+$/)?.[0]);
      if (run && prev && Number.isFinite(number) && number === previous + 1) run.push(row);
      else runs.push([row]);
    }
    return runs.map((run) => {
      const cancelled = run.filter((i) => i.status === "cancelled" && !creditedOriginals.has(i.id)).length;
      return {
        "Nature of Document": run[0].invoice_type === "credit_note" ? "Credit Note" : "Invoices for outward supply",
        "Sr. No. From": run[0].invoice_number,
        "Sr. No. To": run[run.length - 1].invoice_number,
        "Total Number": run.length, "Cancelled": cancelled, "Net Issued": run.length - cancelled,
      };
    });
  });
}

/**
 * HSN/SAC codes are typed by hand and often carry stray whitespace
 * (" 999652" vs "999652 "), which used to split one code into several
 * rows in the HSN summary. Normalise before grouping.
 */
export function normalizeHsnCode(hsn?: string | null, sac?: string | null): string {
  const raw = (hsn ?? "").trim() || (sac ?? "").trim();
  return raw ? raw.replace(/\s+/g, "") : "N/A";
}
