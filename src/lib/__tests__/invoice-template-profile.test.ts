import { describe, it, expect } from "vitest";
import { renderInvoiceHtml } from "@/lib/invoice-templates";

const baseInvoice: any = {
  invoice_number: "INV/TEST/0001",
  invoice_date: "2026-05-31",
  invoice_type: "invoice",
  invoice_category: "purchase",
  business_name: "Test Biz",
  business_gstin: "29AAAAA0000A1Z5",
  business_state: "Karnataka",
  business_state_code: "29",
  customer_name: "ACME",
  subtotal: 100,
  cgst_total: 0, sgst_total: 0, igst_total: 18, total: 118,
  line_items: [{ item_name: "X", item_type: "service", quantity: 1, unit_price: 118, gst_rate: 18, cgst_amount: 0, sgst_amount: 0, igst_amount: 18, line_total: 118, sac_code: "9985" }],
};
const currency = { format: (n: number) => `₹${n.toFixed(2)}` };

const fullProfile: any = {
  template: "classic", logo_url: "", terms: "Pay in 15 days.", footer_note: "Thanks!",
  phone: "+91-9876543210", email: "biz@test.com", website: "https://test.com",
  pan: "ABCDE1234F", cin: "U12345KA2020PTC000001", msme_no: "UDYAM-KA-001",
  bank_name: "HDFC", bank_account_holder: "Test Biz", bank_account_no: "1234567890",
  bank_ifsc: "HDFC0001234", bank_branch: "MG Road", upi_id: "biz@hdfc",
  signature_url: "data:image/png;base64,iVBOR", authorised_signatory_name: "Jane Doe", show_signature: true,
  declaration: "We declare prices are accurate.", jurisdiction: "Subject to Bengaluru jurisdiction",
  payment_terms_label: "Net 15", payment_instructions: "Reference invoice number on transfer.",
};

describe("invoice template — city invoice profile fields", () => {
  for (const tmpl of ["classic", "modern", "compact"] as const) {
    it(`${tmpl}: renders all extended profile blocks when present`, () => {
      const html = renderInvoiceHtml(baseInvoice, { ...fullProfile, template: tmpl }, currency);
      // Contact & identity
      expect(html).toContain("+91-9876543210");
      expect(html).toContain("biz@test.com");
      expect(html).toContain("ABCDE1234F");
      // Bank
      expect(html).toContain("HDFC0001234");
      expect(html).toContain("Payment Details");
      expect(html).toContain("biz@hdfc");
      // Signature
      expect(html).toContain("Jane Doe");
      // Declaration & jurisdiction
      expect(html).toContain("We declare prices are accurate.");
      expect(html).toContain("Bengaluru jurisdiction");
      // Payment terms
      expect(html).toContain("Net 15");
    });

    it(`${tmpl}: hides bank/signature/declaration blocks when absent`, () => {
      const html = renderInvoiceHtml(baseInvoice,
        { template: tmpl, logo_url: "", terms: "", footer_note: "" } as any, currency);
      expect(html).not.toContain("Payment Details");
      expect(html).not.toContain("Authorised Signatory");
      expect(html).not.toContain("We declare");
      expect(html).not.toContain("jurisdiction");
    });

    it(`${tmpl}: escapes HTML in profile fields (XSS guard)`, () => {
      const html = renderInvoiceHtml(baseInvoice, {
        template: tmpl, logo_url: "", terms: "", footer_note: "",
        phone: "<script>alert(1)</script>",
        bank_name: "<img src=x onerror=alert(1)>",
        declaration: "<b>Bad</b>", jurisdiction: "<i>x</i>",
        authorised_signatory_name: "<svg/onload=alert(1)>",
        show_signature: true,
      } as any, currency);
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).not.toContain("<img src=x onerror=alert(1)>");
      expect(html).not.toContain("<svg/onload=alert(1)>");
      expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    });

    it(`${tmpl}: shows signature block only when show_signature is true`, () => {
      const off = renderInvoiceHtml(baseInvoice,
        { template: tmpl, logo_url: "", terms: "", footer_note: "",
          authorised_signatory_name: "Jane", signature_url: "data:image/png;base64,xx", show_signature: false } as any, currency);
      expect(off).not.toContain("Jane");
      const on = renderInvoiceHtml(baseInvoice,
        { template: tmpl, logo_url: "", terms: "", footer_note: "",
          authorised_signatory_name: "Jane", signature_url: "data:image/png;base64,xx", show_signature: true } as any, currency);
      expect(on).toContain("Jane");
    });
  }

  it("backwards compatible: legacy settings without extras still render", () => {
    const html = renderInvoiceHtml(baseInvoice,
      { template: "classic", logo_url: "", terms: "Old terms", footer_note: "Old footer" } as any, currency);
    expect(html).toContain("Old terms");
    expect(html).toContain("Old footer");
    expect(html).toContain("Tax Invoice");
  });
});
