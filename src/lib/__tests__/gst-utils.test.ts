import { describe, it, expect } from "vitest";
import {
  isGstRegistered,
  validateGSTIN,
  getStateFromGSTIN,
  getGstType,
  calculateLineItems,
  type GstLineItem,
} from "@/lib/gst-utils";

describe("isGstRegistered", () => {
  it("returns false for null/undefined/empty", () => {
    expect(isGstRegistered(null)).toBe(false);
    expect(isGstRegistered(undefined)).toBe(false);
    expect(isGstRegistered("")).toBe(false);
    expect(isGstRegistered("   ")).toBe(false);
  });

  it("returns false for all zeros", () => {
    expect(isGstRegistered("0000000")).toBe(false);
  });

  it("returns true for valid GSTIN string", () => {
    expect(isGstRegistered("29ABCDE1234F1Z5")).toBe(true);
  });
});

describe("validateGSTIN", () => {
  it("rejects empty or short strings", () => {
    expect(validateGSTIN("")).toEqual({ valid: false });
    expect(validateGSTIN("29ABC")).toEqual({ valid: false });
  });

  it("rejects invalid format", () => {
    expect(validateGSTIN("123456789012345")).toEqual({ valid: false });
  });

  it("validates a correct GSTIN with checksum", () => {
    // Known valid GSTIN: 29AABCU9603R1ZM (Karnataka)
    const result = validateGSTIN("29AABCU9603R1ZM");
    expect(result.valid).toBe(true);
    expect(result.stateCode).toBe("29");
    expect(result.stateName).toBe("Karnataka");
  });

  it("rejects GSTIN with wrong checksum", () => {
    const result = validateGSTIN("29AABCU9603R1ZX");
    expect(result.valid).toBe(false);
  });
});

describe("getStateFromGSTIN", () => {
  it("returns null for invalid input", () => {
    expect(getStateFromGSTIN("")).toBeNull();
    expect(getStateFromGSTIN("X")).toBeNull();
  });

  it("extracts state from valid GSTIN", () => {
    const result = getStateFromGSTIN("07AAAAA0000A1Z1");
    expect(result).toEqual({ stateCode: "07", stateName: "Delhi" });
  });

  it("returns null for unknown state code", () => {
    expect(getStateFromGSTIN("99AAAAA0000A1Z1")).toBeNull();
  });
});

describe("getGstType", () => {
  it("returns cgst_sgst for B2C (no customer GSTIN)", () => {
    expect(getGstType("29")).toBe("cgst_sgst");
    expect(getGstType("29", undefined)).toBe("cgst_sgst");
  });

  it("returns cgst_sgst for same state", () => {
    expect(getGstType("29", "29AABCU9603R1ZM")).toBe("cgst_sgst");
  });

  it("returns igst for different state", () => {
    expect(getGstType("07", "29AABCU9603R1ZM")).toBe("igst");
  });
});

describe("calculateLineItems", () => {
  const sampleItems: GstLineItem[] = [
    {
      itemName: "Golf Session",
      itemType: "service",
      sacCode: "998312",
      quantity: 1,
      unitPrice: 1180, // inclusive of 18% GST
      gstRate: 18,
    },
  ];

  it("calculates CGST+SGST correctly for intra-state", () => {
    const result = calculateLineItems(sampleItems, "cgst_sgst");
    expect(result.lines).toHaveLength(1);
    expect(result.total).toBe(1180);
    expect(result.subtotal).toBe(1000);
    expect(result.cgstTotal).toBe(90);
    expect(result.sgstTotal).toBe(90);
    expect(result.igstTotal).toBe(0);
  });

  it("calculates IGST correctly for inter-state", () => {
    const result = calculateLineItems(sampleItems, "igst");
    expect(result.total).toBe(1180);
    expect(result.subtotal).toBe(1000);
    expect(result.igstTotal).toBe(180);
    expect(result.cgstTotal).toBe(0);
    expect(result.sgstTotal).toBe(0);
  });

  it("handles multiple line items", () => {
    const items: GstLineItem[] = [
      { itemName: "Item A", itemType: "product", quantity: 2, unitPrice: 118, gstRate: 18 },
      { itemName: "Item B", itemType: "service", quantity: 1, unitPrice: 500, gstRate: 0 },
    ];
    const result = calculateLineItems(items, "cgst_sgst");
    expect(result.lines).toHaveLength(2);
    // Item A: 2 * 118 = 236 inclusive → taxable ~200, gst ~36
    // Item B: 500 with 0% GST → taxable 500, gst 0
    expect(result.total).toBe(736);
    expect(result.subtotal).toBe(700);
  });

  it("handles empty items array", () => {
    const result = calculateLineItems([], "cgst_sgst");
    expect(result.lines).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
