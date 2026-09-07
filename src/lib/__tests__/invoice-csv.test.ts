import { describe, it, expect } from "vitest";
import {
  escapeCsvValue,
  buildInvoiceCsv,
  invoiceCsvFileName,
  sortInvoicesForExport,
  INVOICE_CSV_HEADERS,
  type InvoiceCsvRow,
} from "../invoice-csv";

const mk = (o: Partial<InvoiceCsvRow> = {}): InvoiceCsvRow => ({
  invoice_number: "INV/1",
  invoice_date: "2026-08-01",
  invoice_type: "invoice",
  status: "issued",
  subtotal: 1000,
  cgst_total: 90,
  sgst_total: 90,
  igst_total: 0,
  total: 1180,
  amount_paid: 1180,
  payment_status: "paid",
  ...o,
});

const rows = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n");

describe("escapeCsvValue", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(escapeCsvValue("Rao, Yashas")).toBe('"Rao, Yashas"');
    expect(escapeCsvValue('He said "hi"')).toBe('"He said ""hi"""');
    expect(escapeCsvValue("a\nb")).toBe('"a\nb"');
    expect(escapeCsvValue(null)).toBe("");
  });
});

describe("buildInvoiceCsv", () => {
  it("starts with a BOM and the full header set", () => {
    const csv = buildInvoiceCsv([mk()]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(rows(csv)[0].split(",")).toEqual([...INVOICE_CSV_HEADERS]);
  });

  it("exports one row per invoice plus a totals row", () => {
    const csv = buildInvoiceCsv([mk({ invoice_number: "INV/1" }), mk({ invoice_number: "INV/2" })]);
    const r = rows(csv);
    expect(r).toHaveLength(4); // header + 2 + totals
    expect(r[3]).toContain("TOTAL (2 documents)");
  });

  it("keeps commas in customer names inside one column", () => {
    const csv = buildInvoiceCsv([mk({ customer_name: "Lodha, Vikram" })]);
    expect(rows(csv)[1]).toContain('"Lodha, Vikram"');
  });

  it("signs credit notes negative so totals net out", () => {
    const csv = buildInvoiceCsv([
      mk({ invoice_number: "INV/1", total: 1180, subtotal: 1000, amount_paid: 1180 }),
      mk({ invoice_number: "CN/1", invoice_type: "credit_note", total: 1180, subtotal: 1000, amount_paid: 1180 }),
    ]);
    const totals = rows(csv).at(-1)!.split(",");
    expect(Number(totals[17])).toBe(0); // Total
    expect(Number(totals[10])).toBe(0); // Subtotal
  });

  it("excludes cancelled invoices from the totals row", () => {
    const csv = buildInvoiceCsv([
      mk({ invoice_number: "INV/1" }),
      mk({ invoice_number: "INV/2", status: "cancelled" }),
    ]);
    const totals = rows(csv).at(-1)!.split(",");
    expect(Number(totals[17])).toBe(1180);
    expect(rows(csv)[2]).toContain("cancelled");
  });

  it("reports balance due for part-paid invoices", () => {
    const csv = buildInvoiceCsv([mk({ total: 1000, amount_paid: 400, payment_status: "partial" })]);
    const cols = rows(csv)[1].split(",");
    expect(Number(cols[18])).toBe(400);
    expect(Number(cols[19])).toBe(600);
  });

  it("includes discount columns", () => {
    const csv = buildInvoiceCsv([
      mk({ subtotal: 21427.71, discount_type: "percentage", discount_value: 10, discount_amount: 2499.9, total: 22499.1 }),
    ]);
    const cols = rows(csv)[1].split(",");
    expect(cols[11]).toBe("percentage");
    expect(Number(cols[12])).toBe(10);
    expect(Number(cols[13])).toBe(2499.9);
  });

  it("marks B2B vs B2C from the customer GSTIN", () => {
    const csv = buildInvoiceCsv([
      mk({ invoice_number: "INV/1", customer_gstin: "29ABCDE1234F1Z5" }),
      mk({ invoice_number: "INV/2" }),
    ]);
    expect(rows(csv)[1]).toContain("B2B");
    expect(rows(csv)[2]).toContain("B2C");
  });
});

describe("sortInvoicesForExport", () => {
  it("orders numerically by invoice number", () => {
    const sorted = sortInvoicesForExport([
      { invoice_number: "INV/10", invoice_date: "2026-08-03" },
      { invoice_number: "INV/2", invoice_date: "2026-08-01" },
    ]);
    expect(sorted.map((s) => s.invoice_number)).toEqual(["INV/2", "INV/10"]);
  });
});

describe("invoiceCsvFileName", () => {
  it("records city and date range", () => {
    expect(invoiceCsvFileName({ city: "Bengaluru", startDate: "2026-08-01", endDate: "2026-08-31" }))
      .toBe("invoices_Bengaluru_2026-08-01_to_2026-08-31.csv");
  });
});
