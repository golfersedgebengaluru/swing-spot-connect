import { describe, it, expect } from "vitest";
import { isGeneratedSku, parseProductSku, previewSkuBase } from "@/lib/product-sku";

describe("product-sku", () => {
  it("recognises generated SKUs", () => {
    expect(isGeneratedSku("PRD-BEN-APP-DRVCOV-7K2")).toBe(true);
    expect(isGeneratedSku("SVC-GLB-BAY-SINGLE-H5Y")).toBe(true);
  });

  it("rejects legacy / free-form codes", () => {
    expect(isGeneratedSku("14-C-BLU-MESH-01")).toBe(false);
    expect(isGeneratedSku("Drink")).toBe(false);
    expect(isGeneratedSku("")).toBe(false);
    expect(isGeneratedSku(null)).toBe(false);
  });

  it("parses segments", () => {
    expect(parseProductSku("PRD-BEN-APP-DRVCOV-7K2")).toEqual({
      kind: "product",
      city: "BEN",
      category: "APP",
      name: "DRVCOV",
      suffix: "7K2",
      isGlobal: false,
    });
    expect(parseProductSku("SVC-GLB-BAY-SINGLE-H5Y")).toMatchObject({
      kind: "service",
      isGlobal: true,
    });
    expect(parseProductSku("Drink")).toBeNull();
  });

  it("previews the base mirroring the database generator", () => {
    expect(
      previewSkuBase({ item_type: "product", city: "Bengaluru", category: "Apparel", name: "Driver Cover" })
    ).toBe("PRD-BEN-APP-DRIVER");
    expect(
      previewSkuBase({ item_type: "service", city: null, category: "Bay Usage", name: "Single60-WkEnd-BLR" })
    ).toBe("SVC-GLB-BAY-SINGLE");
    // Missing / unusable values fall back
    expect(previewSkuBase({})).toBe("PRD-GLB-OTH-ITEM");
    expect(previewSkuBase({ city: "123", category: "!!", name: "###" })).toBe("PRD-GLB-OTH-ITEM");
  });
});
