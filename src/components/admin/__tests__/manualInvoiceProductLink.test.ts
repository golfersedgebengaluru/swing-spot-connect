import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * Every manual invoice line must carry the catalogue item it was picked from.
 * Without that link the sale still shows in revenue and GSTR-1, but disappears
 * from category / SKU reporting — which is how the historical "Invoice for …"
 * lines ended up unattributable.
 */
const dialog = readFileSync("src/components/admin/CreateInvoiceDialog.tsx", "utf8");
const invoices = readFileSync("src/hooks/useInvoices.ts", "utf8");

describe("manual invoice → catalogue product link", () => {
  it("stamps the catalogue item id when a line is added from the search", () => {
    expect(dialog).toContain("productId: product.id");
  });

  it("blocks submission when any line has no catalogue item", () => {
    expect(dialog).toContain("lineItems.some((li) => !li.productId)");
    expect(dialog).toContain("Every line item must be linked to a product");
  });

  it("still blocks a taxable line with no HSN/SAC code", () => {
    expect(dialog).toContain("invoiceLinesMissingTaxCode(lineItems)");
  });

  it("persists the link on the saved invoice line", () => {
    expect(invoices).toContain("product_id: item.productId || null");
  });
});
