import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { calculateLineItems, type GstLineItem } from "@/lib/gst-utils";

const corporate = readFileSync("src/components/admin/AdminCorporateAccountsTab.tsx", "utf8");
const invoices = readFileSync("src/hooks/useInvoices.ts", "utf8");

/**
 * Corporate consolidated invoices must carry the selected catalogue product's
 * identity onto the invoice line, so SKU / category sales reporting links the
 * revenue without depending on the display name (which carries a month suffix).
 */
describe("corporate invoice → catalogue product link", () => {
  it("passes the selected billing product id onto the line item", () => {
    expect(corporate).toContain("productId: billingProduct.id");
  });

  it("still labels the line with the month suffix (display unchanged)", () => {
    expect(corporate).toContain("${billingProduct.name} — ${monthLabel}");
  });

  it("persists productId on saved invoice lines", () => {
    expect(invoices).toContain("product_id: item.productId || null");
  });

  it("preserves productId through GST calculation", () => {
    const line: GstLineItem = {
      itemName: "Apexlynx Coaching 30 — Jul 2026",
      itemType: "service",
      sacCode: "999652",
      quantity: 21,
      unitPrice: 1100,
      gstRate: 18,
      productId: "1fe02753-e13e-42a7-b7ec-db7cd95f802b",
    };
    const taxed = calculateLineItems([line], "igst");
    expect(taxed.lines[0].productId).toBe(line.productId);
    expect(taxed.total).toBe(23100);

    // Unregistered-city path spreads the line with a zeroed rate — the link survives.
    const untaxed = calculateLineItems([{ ...line, gstRate: 0 }], "igst");
    expect(untaxed.lines[0].productId).toBe(line.productId);
    expect(untaxed.igstTotal).toBe(0);
  });
});
