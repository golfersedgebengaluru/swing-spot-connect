import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../../..", p), "utf8");

describe("legacy products.type column is gone", () => {
  it("ProductForm no longer writes a derived storefront type", () => {
    const src = read("components/admin/ProductForm.tsx");
    expect(src).not.toMatch(/type:\s*isProduct/);
    expect(src).not.toContain("beverage");
  });

  it("CSV importer no longer emits a storefront type", () => {
    const src = read("components/admin/AdminProductsTab.tsx");
    expect(src).not.toMatch(/row\.type\s*=/);
    expect(src).not.toContain("beverage");
  });

  it("Shop is driven by item_type + category, not the legacy column", () => {
    const shop = read("pages/Shop.tsx");
    expect(shop).toContain("useSellableProducts");
    expect(shop).not.toMatch(/useProducts\("beverage"\)/);

    const hook = read("hooks/useProducts.ts");
    expect(hook).toContain('.eq("item_type", "product")');
    expect(hook).not.toMatch(/\.eq\("type"/);
  });
});
