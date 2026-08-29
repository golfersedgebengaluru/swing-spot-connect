import { describe, it, expect } from "vitest";
import { invoiceDocTitle, renderInvoiceHtml } from "@/lib/invoice-templates";

/**
 * An unregistered supplier (Invoice Profile → GST Registered = off, which
 * blanks the GSTIN stamped on the invoice) must issue a "Bill of Supply",
 * never a "Tax Invoice". Registered cities are unchanged, and credit notes
 * keep their own title regardless of registration.
 */
describe("invoiceDocTitle", () => {
  it("registered supplier → Tax Invoice", () => {
    expect(invoiceDocTitle({ invoice_type: "invoice", business_gstin: "29AAJFT3960B1Z3" })).toBe("Tax Invoice");
  });

  it("blank GSTIN → Bill of Supply", () => {
    expect(invoiceDocTitle({ invoice_type: "invoice", business_gstin: "" })).toBe("Bill of Supply");
    expect(invoiceDocTitle({ invoice_type: "invoice", business_gstin: null })).toBe("Bill of Supply");
  });

  it("all-zero GSTIN → Bill of Supply", () => {
    expect(invoiceDocTitle({ invoice_type: "invoice", business_gstin: "000000000000000" })).toBe("Bill of Supply");
  });

  it("credit notes keep their title either way", () => {
    expect(invoiceDocTitle({ invoice_type: "credit_note", business_gstin: "" })).toBe("Credit Note");
    expect(invoiceDocTitle({ invoice_type: "credit_note", business_gstin: "29AAJFT3960B1Z3" })).toBe("Credit Note");
  });
});

const baseInvoice: any = {
  invoice_number: "INV/2026-27/0001",
  invoice_date: "2026-08-01",
  invoice_type: "invoice",
  business_name: "Golfer's Edge",
  business_gstin: "",
  business_address: "Chennai",
  business_state: "",
  business_state_code: "",
  customer_name: "Walk-in Guest",
  subtotal: 100,
  cgst_total: 0,
  sgst_total: 0,
  igst_total: 0,
  total: 100,
  line_items: [
    { item_name: "Bay session", quantity: 1, unit_price: 100, gst_rate: 0, taxable_amount: 100, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, line_total: 100 },
  ],
};
const fmt: any = { format: (n: number) => `₹${n}` };

describe("rendered invoice HTML for an unregistered city", () => {
  for (const template of ["classic", "modern", "compact"] as const) {
    it(`${template} template prints Bill of Supply, not Tax Invoice`, () => {
      const html = renderInvoiceHtml(baseInvoice, { template } as any, fmt);
      expect(html.toLowerCase()).toContain("bill of supply");
      expect(html.toLowerCase()).not.toContain("tax invoice");
    });

    it(`${template} template still prints Tax Invoice when registered`, () => {
      const html = renderInvoiceHtml(
        { ...baseInvoice, business_gstin: "29AAJFT3960B1Z3" },
        { template } as any,
        fmt,
      );
      expect(html.toLowerCase()).toContain("tax invoice");
      expect(html.toLowerCase()).not.toContain("bill of supply");
    });
  }
});
