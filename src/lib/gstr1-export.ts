import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface Invoice {
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

interface LineItem {
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
 * is keyed by (HSN/SAC, rate) so mixed-rate lines under the same
 * HSN do not collapse.
 */
export async function generateGSTR1Excel(city: string, year: number, month: number) {
  const monthStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  // Fetch GST profile
  const { data: gstProfile } = await supabase.from("gst_profiles" as any)
    .select("*")
    .eq("city", city)
    .maybeSingle();
  if (!gstProfile) throw new Error("GST profile not found for this city.");
  const gst = gstProfile as unknown as { state_code: string; state: string };

  // Fetch invoices for the month
  const { data: invoices, error: invErr } = await supabase.from("invoices" as any)
    .select("*")
    .eq("city", city)
    .gte("invoice_date", monthStart)
    .lte("invoice_date", monthEnd)
    .in("status", ["issued", "paid"])
    .order("invoice_date");
  if (invErr) throw invErr;
  const allInvoices: Invoice[] = (invoices ?? []) as unknown as Invoice[];

  // Fetch line items
  const invoiceIds = allInvoices.map((i) => i.id);
  let allLineItems: LineItem[] = [];
  if (invoiceIds.length > 0) {
    for (let i = 0; i < invoiceIds.length; i += 50) {
      const chunk = invoiceIds.slice(i, i + 50);
      const { data: items } = await supabase.from("invoice_line_items" as any)
        .select("*")
        .in("invoice_id", chunk);
      if (items) allLineItems = allLineItems.concat(items as unknown as LineItem[]);
    }
  }

  // Fetch UQC (unit_of_measure) for all referenced products in one shot
  const productIds = Array.from(
    new Set(allLineItems.map((li) => li.product_id).filter(Boolean) as string[])
  );
  const uqcByProduct = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: prods } = await supabase.from("products_public" as any)
      .select("id, unit_of_measure")
      .in("id", productIds);
    (prods ?? []).forEach((p: any) => {
      if (p?.id) uqcByProduct.set(p.id, normalizeUqc(p.unit_of_measure));
    });
  }

  const lineItemsByInvoice = new Map<string, LineItem[]>();
  allLineItems.forEach((li) => {
    const arr = lineItemsByInvoice.get(li.invoice_id) || [];
    arr.push(li);
    lineItemsByInvoice.set(li.invoice_id, arr);
  });

  const regularInvoices = allInvoices.filter((i) => i.invoice_type === "invoice");
  const creditNotes = allInvoices.filter((i) => i.invoice_type === "credit_note");

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

  // ── HSN Summary (keyed by HSN|rate) ──
  type HsnAgg = {
    desc: string;
    uqc: string;
    qty: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    gross: number;
    rate: number;
    code: string;
  };
  const hsnMap = new Map<string, HsnAgg>();
  allLineItems.forEach((li) => {
    const code = li.hsn_code || li.sac_code || "N/A";
    const rate = Number(li.gst_rate) || 0;
    const key = `${code}|${rate}`;
    const uqc = (li.product_id && uqcByProduct.get(li.product_id)) || "NOS";
    const existing = hsnMap.get(key) || {
      desc: li.item_name, uqc, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, gross: 0, rate, code,
    };
    const gross = Number(li.line_total) || Number(li.unit_price) * Number(li.quantity);
    const gstAmt = Number(li.cgst_amount) + Number(li.sgst_amount) + Number(li.igst_amount);
    existing.qty += Number(li.quantity);
    existing.gross += gross;
    existing.taxable += gross - gstAmt;
    existing.cgst += Number(li.cgst_amount);
    existing.sgst += Number(li.sgst_amount);
    existing.igst += Number(li.igst_amount);
    hsnMap.set(key, existing);
  });
  const hsnRows = Array.from(hsnMap.values())
    .sort((a, b) => (a.code === b.code ? a.rate - b.rate : a.code.localeCompare(b.code)))
    .map((vals) => ({
      "HSN": vals.code,
      "Description": vals.desc,
      "UQC": vals.uqc,
      "Total Quantity": vals.qty,
      "Total Value": round2(vals.gross),
      "Taxable Value": round2(vals.taxable),
      "Rate": vals.rate,
      "CGST Amount": round2(vals.cgst),
      "SGST Amount": round2(vals.sgst),
      "IGST Amount": round2(vals.igst),
      "Cess Amount": 0,
    }));

  // ── Document Summary ──
  const invoiceNumbers = regularInvoices.map((i) => i.invoice_number).sort();
  const cnNumbers = creditNotes.map((i) => i.invoice_number).sort();
  const docRows: any[] = [];
  if (invoiceNumbers.length > 0) {
    docRows.push({
      "Nature of Document": "Invoices for outward supply",
      "Sr. No. From": invoiceNumbers[0],
      "Sr. No. To": invoiceNumbers[invoiceNumbers.length - 1],
      "Total Number": invoiceNumbers.length,
      "Cancelled": 0,
    });
  }
  if (cnNumbers.length > 0) {
    docRows.push({
      "Nature of Document": "Credit Note",
      "Sr. No. From": cnNumbers[0],
      "Sr. No. To": cnNumbers[cnNumbers.length - 1],
      "Total Number": cnNumbers.length,
      "Cancelled": 0,
    });
  }

  const wb = XLSX.utils.book_new();
  appendSheet(wb, b2bRows, "B2B");
  appendSheet(wb, b2csRows, "B2CS");
  appendSheet(wb, cdnrRows, "CDNR");
  appendSheet(wb, cdnurRows, "CDNUR");
  appendSheet(wb, hsnRows, "HSN");
  appendSheet(wb, docRows, "Docs");

  const monthLabel = format(new Date(year, month - 1), "MMM-yyyy");
  const fileName = `GSTR1_${city}_${monthLabel}.xlsx`;
  XLSX.writeFile(wb, fileName);
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
    const gross = Number(li.line_total) || Number(li.unit_price) * Number(li.quantity);
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
function normalizeUqc(unit: string | null | undefined): string {
  if (!unit) return "NOS";
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
  return map[u] || "NOS";
}
