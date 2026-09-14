import { describe, expect, it } from "vitest";
import {
  escapeCSVValue,
  getVendorName,
  parseCSVLine,
  PRODUCT_CSV_HEADERS,
  resolveVendorId,
} from "@/lib/product-vendor-csv";

const vendors = [
  { id: "v-1", name: "Acme Golf", city: "Bengaluru" },
  { id: "v-2", name: "Acme Golf", city: "Chennai" },
  { id: "v-3", name: "Single Supplier", city: "Bengaluru" },
];

describe("product vendor CSV", () => {
  it("includes stable vendor ID and readable vendor columns", () => {
    expect(PRODUCT_CSV_HEADERS.slice(-2)).toEqual(["vendor_id", "vendor"]);
    expect(getVendorName("v-3", vendors)).toBe("Single Supplier");
  });

  it("round-trips quoted vendor names", () => {
    const value = 'Golf, "Retail" Co';
    expect(parseCSVLine(escapeCSVValue(value))).toEqual([value]);
  });

  it("prefers a valid vendor ID over a different name", () => {
    expect(resolveVendorId("v-3", "Acme Golf", "Chennai", vendors)).toBe("v-3");
  });

  it("falls back from an invalid ID to an exact vendor name", () => {
    expect(resolveVendorId("missing", "Single Supplier", "Bengaluru", vendors)).toBe("v-3");
  });

  it("uses product city to resolve duplicate vendor names", () => {
    expect(resolveVendorId("", "acme golf", "Chennai", vendors)).toBe("v-2");
  });

  it("rejects ambiguous names rather than linking the wrong vendor", () => {
    expect(() => resolveVendorId("", "Acme Golf", null, vendors)).toThrow(/ambiguous/);
  });

  it("rejects unknown references and preserves an intentionally blank vendor", () => {
    expect(() => resolveVendorId("missing", "", "Bengaluru", vendors)).toThrow(/not found/);
    expect(resolveVendorId("", "", "Bengaluru", vendors)).toBeNull();
  });
});