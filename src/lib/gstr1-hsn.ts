import type { Invoice, LineItem } from "./gstr1-export";
import { normalizeHsnCode, normalizeUqc } from "./gstr1-export";
import { isGstRegistered, validateGSTIN } from "./gst-utils";

interface ProductMetadata {
  id: string | null;
  unit_of_measure: string | null;
  hsn_code: string | null;
  sac_code: string | null;
  gst_rate: number | null;
}
type Row = Record<string, string | number>;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** One signed projection feeds both the filing summary and its audit trail. */
export function buildHsnAudit(invoices: Invoice[], lines: LineItem[], products: ProductMetadata[] = []) {
  const invoiceMap = new Map(invoices.map((i) => [i.id, i]));
  const productMap = new Map(products.filter((p) => p.id).map((p) => [p.id, p]));
  const breakdownRows: Row[] = [];
  const reviewRows: Row[] = [];
  const aggregates = new Map<string, Row>();
  const review = (invoice: Invoice, issue: string, line?: LineItem) => reviewRows.push({
    "Invoice Number": invoice.invoice_number, "Invoice Date": invoice.invoice_date,
    "Line ID": line?.id ?? "", "Product": line?.item_name ?? "", "Issue": issue,
  });
  for (const line of lines) {
    const invoice = invoiceMap.get(line.invoice_id);
    if (!invoice || !["invoice", "credit_note"].includes(invoice.invoice_type)) continue;
    const sign = invoice.invoice_type === "credit_note" ? -1 : 1;
    const signed = (n: number) => sign === -1 ? -Math.abs(Number(n)) : Number(n);
    const code = normalizeHsnCode(line.hsn_code, line.sac_code);
    const supply = isGstRegistered(invoice.customer_gstin) ? "B2B" : "B2C";
    const product = line.product_id ? productMap.get(line.product_id) : undefined;
    const uqc = line.item_type === "service" ? "NA" : normalizeUqc(product?.unit_of_measure);
    const rate = Number(line.gst_rate);
    const gross = signed(line.line_total);
    const cgst = signed(line.cgst_amount);
    const sgst = signed(line.sgst_amount);
    const igst = signed(line.igst_amount);
    const taxable = gross - cgst - sgst - igst;
    const qty = signed(line.quantity);
    if (![rate, gross, cgst, sgst, igst, qty].every(Number.isFinite)) {
      throw new Error(`Invalid numeric invoice data on ${invoice.invoice_number}; report not generated.`);
    }
    const key = `${supply}|${code}|${rate}|${uqc}`;
    if (code === "N/A") review(invoice, "Missing invoice HSN/SAC; confirm classification before filing.", line);
    else if (!/^(?:\d{4}|\d{6}|\d{8})$/.test(code)) review(invoice, "Nonstandard HSN/SAC format; verify GST master and turnover digit requirement.", line);
    // Official description must never be invented from the first product name.
    if (!aggregates.has(key)) review(invoice, `Official GST master description required for ${code}; verify code and turnover digit requirement.`, line);
    if (line.item_type !== "service") review(invoice, uqc === "UNKNOWN"
      ? "UQC unavailable or unrecognised; do not assume NOS."
      : "UQC sourced from current catalogue, not historical invoice; confirm unit at sale.", line);
    if (product && (normalizeHsnCode(product.hsn_code, product.sac_code) !== code || Number(product.gst_rate) !== rate)) {
      review(invoice, "Invoice code/rate differs from current catalogue; historical values preserved, auditor review required.", line);
    }
    if (Math.abs(Math.abs(cgst + sgst + igst) - Math.abs(taxable) * rate / 100) > 0.05) {
      review(invoice, "Stored tax amounts do not reconcile to invoice GST rate (tolerance INR 0.05).", line);
    }
    if (cgst !== 0 && igst !== 0 || sgst !== 0 && igst !== 0) review(invoice, "Both IGST and local tax present on the same line.", line);
    if (rate === 0) review(invoice, "0% line: confirm nil-rated, exempt or non-GST Table 8 classification separately.", line);
    const row: Row = {
      "Summary Key": key, "Supply Type": supply, "Invoice ID": invoice.id,
      "Invoice Number": invoice.invoice_number, "Invoice Date": invoice.invoice_date,
      "Document Type": invoice.invoice_type, "Original Invoice ID": invoice.credit_note_for ?? "",
      "Line ID": line.id ?? "", "Product ID": line.product_id ?? "", "Product": line.item_name,
      "HSN": code, "Rate": rate, "UQC": uqc,
      "UQC Source": line.item_type === "service" ? "Service: not applicable" : product?.unit_of_measure ? `Current catalogue: ${product.unit_of_measure}` : "Unavailable",
      "Quantity": qty, "Invoice Unit Price (INR)": Number(line.unit_price),
      "Selling Value (INR)": gross, "Taxable Value (INR)": taxable,
      "CGST (INR)": cgst, "SGST (INR)": sgst, "IGST (INR)": igst,
    };
    breakdownRows.push(row);
    const aggregate = aggregates.get(key) ?? {
      "Supply Type": supply, "HSN": code, "Description": "", "UQC": uqc, "Rate": rate,
      "Total Quantity": 0, "Total Value": 0, "Taxable Value": 0,
      "CGST Amount": 0, "SGST Amount": 0, "IGST Amount": 0, "Cess Amount": 0,
    };
    for (const [target, value] of Object.entries({
      "Total Quantity": qty, "Total Value": gross, "Taxable Value": taxable,
      "CGST Amount": cgst, "SGST Amount": sgst, "IGST Amount": igst,
    })) aggregate[target] = Number(aggregate[target]) + value;
    aggregates.set(key, aggregate);
  }
  const hsnRows = Array.from(aggregates.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, row]) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "number" && key !== "Total Quantity" && key !== "Rate" ? round(value) : value])) as Row);
  const reconciliationRows: Row[] = [];
  for (const invoice of invoices) {
    if (!["invoice", "credit_note"].includes(invoice.invoice_type)) {
      review(invoice, "Unsupported document type; excluded from supply summaries.");
      continue;
    }
    if (invoice.customer_gstin && isGstRegistered(invoice.customer_gstin) && !validateGSTIN(invoice.customer_gstin.trim()).valid) review(invoice, "Invalid recipient GSTIN; confirm B2B classification.");
    if (!invoice.customer_state_code) review(invoice, "Recipient/place-of-supply state missing; local state assumption requires confirmation.");
    if (invoice.invoice_type === "credit_note" && !invoice.credit_note_for) review(invoice, "Credit note has no original invoice link.");
    const entries = breakdownRows.filter((r) => r["Invoice ID"] === invoice.id);
    if (!entries.length) review(invoice, "No invoice lines; cannot reconcile or populate HSN.");
    const sign = invoice.invoice_type === "credit_note" ? -1 : 1;
    for (const [field, header, total] of [
      ["Gross", "Selling Value (INR)", invoice.total],
      ["Taxable", "Taxable Value (INR)", invoice.subtotal],
      ["CGST", "CGST (INR)", invoice.cgst_total],
      ["SGST", "SGST (INR)", invoice.sgst_total],
      ["IGST", "IGST (INR)", invoice.igst_total],
    ] as const) {
      const actual = entries.reduce((sum, r) => sum + Number(r[header]), 0);
      const expected = sign < 0 ? -Math.abs(total) : Number(total);
      const difference = round(actual - expected);
      reconciliationRows.push({ "Invoice Number": invoice.invoice_number, "Metric": field,
        "Signed Invoice Value (INR)": expected, "Line Value (INR)": round(actual),
        "Difference (INR)": difference, "Status": Math.abs(difference) <= 0.05 ? "MATCH" : "REVIEW" });
      if (Math.abs(difference) > 0.05) review(invoice, `${field} invoice/line difference INR ${difference}; no automatic adjustment.`);
    }
  }
  return { hsnRows, breakdownRows, reviewRows, reconciliationRows };
}