import { describe, it, expect } from "vitest";
import {
  normalizeTaxCode,
  isValidTaxCodeFormat,
  taxCodeFor,
  checkProductTaxCode,
  invoiceLinesMissingTaxCode,
} from "@/lib/tax-codes";

describe("normalizeTaxCode", () => {
  it("strips the whitespace that split ' 999652' into a phantom GSTR-1 row", () => {
    expect(normalizeTaxCode(" 999652")).toBe("999652");
    expect(normalizeTaxCode("999652 ")).toBe("999652");
    expect(normalizeTaxCode("99 9652")).toBe("999652");
  });

  it("treats blank and missing codes as absent", () => {
    expect(normalizeTaxCode("")).toBeNull();
    expect(normalizeTaxCode("   ")).toBeNull();
    expect(normalizeTaxCode(null)).toBeNull();
    expect(normalizeTaxCode(undefined)).toBeNull();
  });
});

describe("isValidTaxCodeFormat", () => {
  it("accepts real HSN lengths", () => {
    expect(isValidTaxCodeFormat("9506", "product")).toBe(true);
    expect(isValidTaxCodeFormat("65050090", "product")).toBe(true);
  });

  it("rejects HSN codes that are too short, too long or not numeric", () => {
    expect(isValidTaxCodeFormat("950", "product")).toBe(false);
    expect(isValidTaxCodeFormat("123456789", "product")).toBe(false);
    expect(isValidTaxCodeFormat("95O6", "product")).toBe(false);
  });

  it("accepts real SAC lengths and rejects longer ones", () => {
    expect(isValidTaxCodeFormat("9996", "service")).toBe(true);
    expect(isValidTaxCodeFormat("999652", "service")).toBe(true);
    expect(isValidTaxCodeFormat("9996521", "service")).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(isValidTaxCodeFormat(" 999652 ", "service")).toBe(true);
  });
});

describe("taxCodeFor", () => {
  it("uses HSN for goods and SAC for services", () => {
    expect(taxCodeFor({ itemType: "product", gstRate: 5, hsnCode: "9506", sacCode: "999652" })).toBe("9506");
    expect(taxCodeFor({ itemType: "service", gstRate: 18, hsnCode: "9506", sacCode: "999652" })).toBe("999652");
  });

  it("falls back to the other column rather than reporting no code", () => {
    expect(taxCodeFor({ itemType: "service", gstRate: 18, hsnCode: "9506", sacCode: null })).toBe("9506");
    expect(taxCodeFor({ itemType: "product", gstRate: 5, hsnCode: " ", sacCode: "999652" })).toBe("999652");
  });

  it("returns null when neither column has a code", () => {
    expect(taxCodeFor({ itemType: "product", gstRate: 5, hsnCode: "", sacCode: null })).toBeNull();
  });
});

describe("checkProductTaxCode", () => {
  it("requires a code once GST is above zero", () => {
    const result = checkProductTaxCode({ itemType: "product", gstRate: 5 });
    expect(result.valid).toBe(false);
    expect(result.message).toContain("HSN");
  });

  it("names SAC for services", () => {
    const result = checkProductTaxCode({ itemType: "service", gstRate: 18 });
    expect(result.valid).toBe(false);
    expect(result.message).toContain("SAC");
  });

  it("allows a zero-rated item with no code", () => {
    expect(checkProductTaxCode({ itemType: "service", gstRate: 0 }).valid).toBe(true);
    expect(checkProductTaxCode({ itemType: "product", gstRate: "" }).valid).toBe(true);
  });

  it("still checks the shape of a code on a zero-rated item", () => {
    const result = checkProductTaxCode({ itemType: "product", gstRate: 0, hsnCode: "abc" });
    expect(result.valid).toBe(false);
  });

  it("accepts a taxable item with a clean code", () => {
    expect(checkProductTaxCode({ itemType: "service", gstRate: 18, sacCode: " 999652" }).valid).toBe(true);
    expect(checkProductTaxCode({ itemType: "product", gstRate: 5, hsnCode: "61099010" }).valid).toBe(true);
  });
});

describe("invoiceLinesMissingTaxCode", () => {
  it("lists only taxable lines with no code", () => {
    const missing = invoiceLinesMissingTaxCode([
      { itemName: "Coaching hour", itemType: "service", gstRate: 18 },
      { itemName: "Cap", itemType: "product", gstRate: 5, hsnCode: "65050090" },
      { itemName: "Complimentary water", itemType: "product", gstRate: 0 },
    ]);
    expect(missing).toEqual(["Coaching hour"]);
  });

  it("falls back to a positional label when the line has no name", () => {
    expect(invoiceLinesMissingTaxCode([{ itemName: "  ", gstRate: 18 }])).toEqual(["Line 1"]);
  });

  it("returns nothing when every taxable line is coded", () => {
    expect(
      invoiceLinesMissingTaxCode([{ itemName: "Bay hour", itemType: "service", gstRate: 18, sacCode: "999652" }])
    ).toEqual([]);
  });
});
