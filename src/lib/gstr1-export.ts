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
}

export async function generateGSTR1Excel(city: string, year: number, month: number) {
  const monthStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  // Fetch GST profile
  const { data: gstProfile } = await supabase.from("gst_profiles" as any)
    .select("*")
    .eq("city", city)
    .maybeSingle();
  if (!gstProfile) throw new Error("GST profile not found for this city.");
  const gst = gstProfile as unknown as GstProfile;

  // Fetch invoices for the month
  const { data: invoices, error: invErr } = await supabase.from("invoices" as any)
    .select("*")
    .eq("city", city)
    .gte("invoice_date", monthStart)
    .lte("invoice_date", monthEnd)
    .in("status", ["issued", "paid"])
    .order("invoice_date");
  if (invErr) throw invErr;
  const allInvoices: Invoice[] = invoices ?? [];

  // Fetch all line items for these invoices
  const invoiceIds = allInvoices.map((i) => i.id);
  let allLineItems: LineItem[] = [];
  if (invoiceIds.length > 0) {
    // Batch in chunks of 50
    for (let i = 0; i < invoiceIds.length; i += 50) {
      const chunk = invoiceIds.slice(i, i + 50);
      const { data: items } = await supabase.from("invoice_line_items" as any)
        .select("*")
        .in("invoice_id", chunk);
      if (items) allLineItems = allLineItems.concat(items);
    }
  }

  const lineItemsByInvoice = new Map<string, LineItem[]>();
  allLineItems.forEach((li) => {
    const arr = lineItemsByInvoice.get(li.invoice_id) || [];
    arr.push(li);
    lineItemsByInvoice.set(li.invoice_id, arr);
  });

  // Separate invoices and credit notes
  const regularInvoices = allInvoices.filter((i) => i.invoice_type === "invoice");
  const creditNotes = allInvoices.filter((i) => i.invoice_type === "credit_note");

  // B2B: invoices where customer_gstin is present
  const b2bInvoices = regularInvoices.filter((i) => i.customer_gstin);
  // B2CS: invoices where customer_gstin is NOT present (URP)
  const b2csInvoices = regularInvoices.filter((i) => !i.customer_gstin);
  // CDNR: credit notes where original invoice had GSTIN
  const cdnrNotes = creditNotes.filter((cn) => cn.customer_gstin);
  // CDNUR: credit notes where original invoice did NOT have GSTIN
  const cdnurNotes = creditNotes.filter((cn) => !cn.customer_gstin);

  const placeOfSupply = `${gstProfile.state_code}-${gstProfile.state}`;

  // ── B2B Sheet ──
  const b2bRows = b2bInvoices.map((inv) => ({
    "GSTIN/UIN of Recipient": inv.customer_gstin,
    "Receiver Name": inv.customer_name || "",
    "Invoice Number": inv.invoice_number,
    "Invoice Date": inv.invoice_date,
    "Invoice Value": inv.total,
    "Place Of Supply": placeOfSupply,
    "Reverse Charge": "N",
    "Invoice Type": "Regular",
    "Rate": getMaxRate(lineItemsByInvoice.get(inv.id) || []),
    "Taxable Value": inv.subtotal,
    "CGST Amount": inv.cgst_total,
    "SGST Amount": inv.sgst_total,
    "IGST Amount": inv.igst_total,
    "Cess Amount": 0,
  }));

  // ── B2CS Sheet (aggregated by rate) ──
  const b2csMap = new Map<number, { taxable: number; cgst: number; sgst: number }>();
  b2csInvoices.forEach((inv) => {
    const rate = getMaxRate(lineItemsByInvoice.get(inv.id) || []);
    const existing = b2csMap.get(rate) || { taxable: 0, cgst: 0, sgst: 0 };
    existing.taxable += inv.subtotal;
    existing.cgst += inv.cgst_total;
    existing.sgst += inv.sgst_total;
    b2csMap.set(rate, existing);
  });
  const b2csRows = Array.from(b2csMap.entries()).map(([rate, vals]) => ({
    "Type": "OE",
    "Place Of Supply": placeOfSupply,
    "Rate": rate,
    "Taxable Value": round2(vals.taxable),
    "CGST Amount": round2(vals.cgst),
    "SGST/UTGST Amount": round2(vals.sgst),
    "Cess Amount": 0,
  }));

  // ── CDNR Sheet ──
  const cdnrRows = cdnrNotes.map((cn) => ({
    "GSTIN/UIN of Recipient": cn.customer_gstin,
    "Receiver Name": cn.customer_name || "",
    "Note Number": cn.invoice_number,
    "Note Date": cn.invoice_date,
    "Note Type": "C",
    "Place Of Supply": placeOfSupply,
    "Reverse Charge": "N",
    "Note Supply Type": "Regular",
    "Note Value": cn.total,
    "Rate": getMaxRate(lineItemsByInvoice.get(cn.id) || []),
    "Taxable Value": cn.subtotal,
    "CGST Amount": cn.cgst_total,
    "SGST Amount": cn.sgst_total,
    "IGST Amount": cn.igst_total,
    "Cess Amount": 0,
  }));

  // ── CDNUR Sheet ──
  const cdnurRows = cdnurNotes.map((cn) => ({
    "Note Number": cn.invoice_number,
    "Note Date": cn.invoice_date,
    "Note Type": "C",
    "Place Of Supply": placeOfSupply,
    "Note Value": cn.total,
    "Rate": getMaxRate(lineItemsByInvoice.get(cn.id) || []),
    "Taxable Value": cn.subtotal,
    "CGST Amount": cn.cgst_total,
    "SGST/UTGST Amount": cn.sgst_total,
    "Cess Amount": 0,
  }));

  // ── HSN Summary ──
  const hsnMap = new Map<string, { desc: string; qty: number; taxable: number; cgst: number; sgst: number; igst: number; rate: number }>();
  allLineItems.forEach((li) => {
    const code = li.hsn_code || li.sac_code || "N/A";
    const existing = hsnMap.get(code) || { desc: li.item_name, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, rate: li.gst_rate };
    existing.qty += li.quantity;
    existing.taxable += li.unit_price * li.quantity;
    existing.cgst += li.cgst_amount;
    existing.sgst += li.sgst_amount;
    existing.igst += li.igst_amount;
    hsnMap.set(code, existing);
  });
  const hsnRows = Array.from(hsnMap.entries()).map(([code, vals]) => ({
    "HSN": code,
    "Description": vals.desc,
    "UQC": "NOS",
    "Total Quantity": vals.qty,
    "Total Value": round2(vals.taxable + vals.cgst + vals.sgst + vals.igst),
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

  // Build workbook
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
    // Add empty sheet with headers note
    const ws = XLSX.utils.aoa_to_sheet([["No data for this section"]]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  } else {
    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto-size columns
    const colWidths = Object.keys(rows[0]).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
}

function getMaxRate(items: LineItem[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.gst_rate));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
