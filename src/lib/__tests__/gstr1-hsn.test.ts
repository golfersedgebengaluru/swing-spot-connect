import { describe, it, expect } from "vitest";
import { buildHsnAudit } from "../gstr1-hsn";
import { buildDocumentSummary, groupLinesByRate, type Invoice, type LineItem } from "../gstr1-export";

export const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: "inv", invoice_number: "INV/1", invoice_date: "2026-09-28", invoice_type: "invoice",
  invoice_category: "purchase", customer_name: "QA", customer_gstin: null,
  customer_state: "Karnataka", customer_state_code: "29", business_gstin: "29AAJFT3960B1Z3",
  business_state: "Karnataka", business_state_code: "29", subtotal: 1000,
  cgst_total: 25, sgst_total: 25, igst_total: 0, total: 1050,
  credit_note_for: null, status: "issued", city: "Bengaluru", ...overrides,
});
export const line = (overrides: Partial<LineItem> = {}): LineItem => ({
  id: "line", invoice_id: "inv", item_name: "SuperSpeed Pro", item_type: "product", hsn_code: "9506",
  sac_code: null, quantity: 1, unit_price: 1050, gst_rate: 5,
  cgst_amount: 25, sgst_amount: 25, igst_amount: 0, line_total: 1050, product_id: "p1", ...overrides,
});
const product = (id = "p1", unit = "each") => ({ id, unit_of_measure: unit, hsn_code: "9506", sac_code: null, gst_rate: 5 });

describe("HSN auditor projection", () => {
  it("consolidates SuperSpeed 22000 and VICE 6000 to 2 units and 28000 without naming one product", () => {
    const audit = buildHsnAudit([invoice()], [
      line({ item_name: "SuperSpeed Pro", line_total: 22000, cgst_amount: 523.81, sgst_amount: 523.81 }),
      line({ id: "l2", item_name: "VICE PRO", product_id: "p2", line_total: 6000, cgst_amount: 142.85, sgst_amount: 142.86 }),
    ], [product(), product("p2")]);
    expect(audit.hsnRows).toHaveLength(1);
    expect(audit.hsnRows[0]).toMatchObject({ "Total Quantity": 2, "Total Value": 28000, "Description": "", "UQC": "NOS", "Taxable Value": 26666.67 });
    expect(audit.breakdownRows.map((r) => r.Product)).toEqual(["SuperSpeed Pro", "VICE PRO"]);
  });
  it("separates B2B/B2C, different GST rates and UQC", () => {
    const audit = buildHsnAudit([invoice(), invoice({ id: "b2b", customer_gstin: "29AAJFT3960B1Z3" })], [
      line(), line({ invoice_id: "b2b" }), line({ gst_rate: 18 }), line({ product_id: "pack" }),
    ], [product(), product("pack", "pack")]);
    expect(audit.hsnRows).toHaveLength(4);
    expect(audit.hsnRows.map((r) => `${r["Supply Type"]}|${r.Rate}|${r.UQC}`).sort()).toEqual(["B2B|5|NOS", "B2C|18|NOS", "B2C|5|NOS", "B2C|5|PAC"].sort());
  });
  it("subtracts credit quantity, selling value and tax once even when stored negative", () => {
    for (const storedSign of [1, -1]) {
      const audit = buildHsnAudit([invoice(), invoice({ id: "cn", invoice_type: "credit_note", credit_note_for: "inv" })], [
        line(), line({ invoice_id: "cn", quantity: storedSign, line_total: storedSign * 1050, cgst_amount: storedSign * 25, sgst_amount: storedSign * 25 }),
      ], [product()]);
      expect(audit.hsnRows[0]).toMatchObject({ "Total Quantity": 0, "Total Value": 0, "Taxable Value": 0, "CGST Amount": 0, "SGST Amount": 0 });
    }
  });
  it("uses discounted invoice selling amount 1347.17, not current prices or reconstructed unit totals", () => {
    const audit = buildHsnAudit([invoice()], [line({ line_total: 1347.17, unit_price: 1400, gst_rate: 0, cgst_amount: 0, sgst_amount: 0, hsn_code: null })], [product()]);
    expect(audit.breakdownRows[0]["Selling Value (INR)"]).toBe(1347.17);
    expect(audit.hsnRows[0]["Total Value"]).toBe(1347.17);
    expect(audit.reviewRows.some((r) => String(r.Issue).includes("differs from current catalogue"))).toBe(true);
    expect(audit.reviewRows.some((r) => String(r.Issue).includes("Missing invoice HSN"))).toBe(true);
  });
  it("preserves zero line totals rather than falling back to unit price", () => {
    expect(groupLinesByRate([line({ line_total: 0, cgst_amount: 0, sgst_amount: 0 })]).get(5)?.gross).toBe(0);
    expect(buildHsnAudit([invoice()], [line({ line_total: 0 })]).hsnRows[0]["Total Value"]).toBe(0);
  });
  it("never assumes NOS for unknown goods, and uses NA for services", () => {
    const audit = buildHsnAudit([invoice()], [line(), line({ item_type: "service", hsn_code: null, sac_code: "999652" })]);
    expect(audit.hsnRows.map((r) => r.UQC).sort()).toEqual(["NA", "UNKNOWN"]);
    expect(audit.reviewRows.some((r) => String(r.Issue).includes("UQC unavailable"))).toBe(true);
  });
  it("reconciles all values against headers and sums breakdown into HSN totals", () => {
    const audit = buildHsnAudit([invoice()], [line()], [product()]);
    expect(audit.reconciliationRows).toHaveLength(5);
    expect(audit.reconciliationRows.every((r) => r.Status === "MATCH" && r["Difference (INR)"] === 0)).toBe(true);
    expect(audit.hsnRows.reduce((s, r) => s + Number(r["Total Value"]), 0)).toBe(audit.breakdownRows.reduce((s, r) => s + Number(r["Selling Value (INR)"]), 0));
    const broken = buildHsnAudit([invoice({ total: 999 })], [line()], [product()]);
    expect(broken.reconciliationRows[0]).toMatchObject({ Status: "REVIEW", "Difference (INR)": 51 });
  });
  it("flags missing lines, invalid GSTIN, missing state, and bad arithmetic without changing inputs", () => {
    const original = invoice({ customer_gstin: "bad", customer_state_code: null });
    const saved = JSON.stringify(original);
    const audit = buildHsnAudit([original], []);
    expect(audit.reviewRows.some((r) => String(r.Issue).includes("No invoice lines"))).toBe(true);
    expect(audit.reviewRows.some((r) => String(r.Issue).includes("Invalid recipient GSTIN"))).toBe(true);
    expect(audit.reviewRows.some((r) => String(r.Issue).includes("state missing"))).toBe(true);
    expect(JSON.stringify(original)).toBe(saved);
    expect(() => buildHsnAudit([invoice()], [line({ line_total: NaN })])).toThrow("Invalid numeric");
  });
});

describe("document ranges", () => {
  it("separates gaps/series and reports recorded cancellations and net issues", () => {
    const rows = buildDocumentSummary([invoice(), invoice({ id: "2", invoice_number: "INV/2", status: "cancelled" }), invoice({ id: "4", invoice_number: "INV/4" }), invoice({ id: "s", invoice_number: "OTHER/1" })]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ "Total Number": 2, "Cancelled": 1, "Net Issued": 1, "Sr. No. From": "INV/1", "Sr. No. To": "INV/2" });
  });
  it("does not mark a supply reversed by a credit note as a void document", () => {
    expect(buildDocumentSummary([invoice({ status: "cancelled" })], new Set(["inv"]))[0].Cancelled).toBe(0);
  });
});