import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { calculateLineItems, isProfileGstRegistered, type GstLineItem } from "@/lib/gst-utils";

const dialog = readFileSync("src/components/admin/CreateInvoiceDialog.tsx", "utf8");
const corporate = readFileSync("src/components/admin/AdminCorporateAccountsTab.tsx", "utf8");

const line: GstLineItem = {
  itemName: "Bay session",
  itemType: "service",
  quantity: 1,
  unitPrice: 1000,
  gstRate: 18,
};

/**
 * A city with GST Registered = off must never charge tax on any invoice path.
 * Both the manual Create Invoice dialog and the corporate consolidated
 * invoice zero every line's rate before calculating.
 */
describe("unregistered city → zero tax", () => {
  it("zeroing the rate removes all tax and leaves the total untouched", () => {
    const taxed = calculateLineItems([line], "cgst_sgst");
    expect(taxed.cgstTotal + taxed.sgstTotal).toBeGreaterThan(0);

    const untaxed = calculateLineItems([{ ...line, gstRate: 0 }], "cgst_sgst");
    expect(untaxed.cgstTotal).toBe(0);
    expect(untaxed.sgstTotal).toBe(0);
    expect(untaxed.igstTotal).toBe(0);
    expect(untaxed.subtotal).toBe(1000);
    expect(untaxed.total).toBe(taxed.total); // prices are GST-inclusive
  });

  it("registration helper drives both paths", () => {
    expect(isProfileGstRegistered({ gstin: "", is_gst_registered: false })).toBe(false);
    expect(isProfileGstRegistered({ gstin: "29AAJFT3960B1Z3", is_gst_registered: true })).toBe(true);
  });

  it("manual dialog zeroes line rates when the city is unregistered", () => {
    expect(dialog).toContain("isProfileGstRegistered");
    expect(dialog).toMatch(/gstRegistered\s*\?\s*discountedLineItems\s*:\s*discountedLineItems\.map/);
    expect(dialog).toContain("calculateLineItems(taxableLineItems, gstType)");
  });

  it("corporate invoicing no longer blocks unregistered cities on a missing state code", () => {
    expect(corporate).toContain("isProfileGstRegistered");
    // The state-code gate must be conditional on registration.
    expect(corporate).toContain("if (cityGstRegistered && !gstProfile.state_code)");
    expect(corporate).not.toContain("if (!gstProfile?.state_code)");
    expect(corporate).toMatch(/cityGstRegistered \? \[lineItem\] : \[\{ \.\.\.lineItem, gstRate: 0 \}\]/);
  });
});
