import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderInvoiceHtml } from "@/lib/invoice-templates";
import { sanitizeHtml } from "@/lib/sanitize";

const read = (p: string) => readFileSync(resolve(__dirname, "../../../", p), "utf8");
const attack = `<img src=x onerror="alert(1)">`;
const invoice = {
  invoice_number: `INV/1${attack}`,
  invoice_date: "2026-11-09",
  invoice_type: "invoice",
  invoice_category: "booking",
  business_name: `Centre${attack}`,
  business_gstin: "29AAAAA0000A1Z5",
  customer_name: `Guest${attack}`,
  customer_email: `a${attack}@x.com`,
  customer_phone: `98${attack}`,
  customer_gstin: `G${attack}`,
  payment_method: `Cash${attack}`,
  subtotal: 1000, cgst_total: 90, sgst_total: 90, igst_total: 0, total: 1180,
  booking: { start_time: "2026-11-09T13:30:00Z", end_time: "2026-11-09T14:30:00Z", bay_name: `Bay${attack}` },
  line_items: [{ item_name: `Session${attack}`, item_type: "service", sac_code: `9996${attack}`, quantity: 1, unit_price: 1180, gst_rate: 18, cgst_amount: 90, sgst_amount: 90, igst_amount: 0, line_total: 1180 }],
};
const currency = { format: (n: number) => `₹${n.toFixed(2)}` };

describe("invoice markup treats stored customer text as plain text", () => {
  for (const template of ["classic", "modern", "compact"]) {
    it(`${template}: no customer, item or booking value becomes live markup`, () => {
      const html = renderInvoiceHtml(invoice, { template } as never, currency);
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("Guest&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    });
  }
});

describe("site-admin event descriptions", () => {
  it("keep formatting but drop scripts and event handlers", () => {
    const clean = sanitizeHtml(`<p><strong>Open day</strong></p><script>alert(1)</script><img src=x onerror="alert(1)">`);
    expect(clean).toContain("<strong>Open day</strong>");
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("onerror");
  });

  it("are cleaned on the public events page and the invoice viewer", () => {
    expect(read("src/pages/Events.tsx")).toContain("__html: sanitizeHtml(event.description)");
    expect(read("src/components/admin/InvoiceViewDialog.tsx")).toContain("__html: sanitizeHtml(renderInvoiceHtml(");
  });
});

describe("calendar choice", () => {
  const source = read("supabase/functions/calendar-sync/index.ts");
  it("never reads a calendar address from the request", () => {
    expect(source).not.toMatch(/\{\s*calendar_email\s*\}\s*=\s*params/);
    expect(source).not.toMatch(/params\.calendar_email/);
    expect(source).not.toContain("fallback?: string");
  });
});

describe("browser points changes", () => {
  it("go only through the authorized points action", () => {
    const hook = read("src/hooks/usePoints.ts");
    expect(hook).toContain('rpc("adjust_member_points"');
    expect(hook).not.toMatch(/increment_user_points|decrement_user_points_safe|update\(\{\s*points/);
  });
});
