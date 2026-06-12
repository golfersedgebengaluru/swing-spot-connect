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
  cgst_total: 0,
  sgst_total: 0,
  igst_total: 18,
  total: 118,
  line_items: [
    { item_name: "Item", item_type: "service", quantity: 1, unit_price: 118, gst_rate: 18,
      cgst_amount: 0, sgst_amount: 0, igst_amount: 18, line_total: 118, sac_code: "9985" },
  ],
};

const settings: any = { template: "classic", logo_url: "", terms: "", footer_note: "" };
const currency = { format: (n: number) => `₹${n.toFixed(2)}` };

describe("invoice template — notes & payment reference", () => {
  for (const tmpl of ["classic", "modern", "compact"] as const) {
    it(`${tmpl}: renders notes and payment reference when present`, () => {
      const html = renderInvoiceHtml(
        { ...baseInvoice, payment_method: "Bank Transfer", payment_reference: "TXN-9988", notes: "Paid on time. Thanks!" },
        { ...settings, template: tmpl },
        currency,
      );
      expect(html).toContain("Bank Transfer");
      expect(html).toContain("TXN-9988");
      expect(html).toContain("Paid on time. Thanks!");
      expect(html).toContain("Notes / Comments");
    });

    it(`${tmpl}: omits notes block when notes empty`, () => {
      const html = renderInvoiceHtml(
        { ...baseInvoice, payment_method: "Cash" },
        { ...settings, template: tmpl },
        currency,
      );
      expect(html).not.toContain("Notes / Comments");
      expect(html).toContain("Cash");
    });

    it(`${tmpl}: escapes HTML in notes & payment reference`, () => {
      const html = renderInvoiceHtml(
        { ...baseInvoice, payment_reference: "<script>x</script>", notes: "<b>bold</b>" },
        { ...settings, template: tmpl },
        currency,
      );
      expect(html).not.toContain("<script>x</script>");
      expect(html).not.toContain("<b>bold</b>");
      expect(html).toContain("&lt;script&gt;");
    });
  }
});
