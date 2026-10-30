import { describe, expect, it } from "vitest";
import { csvCell, formatCustomerSpend, parseCustomerReport } from "../customer-report";
describe("customer report export rules", () => {
  it("does not combine currencies", () => { expect(formatCustomerSpend({ INR: 800, USD: 10 })).toContain("USD 10.00"); expect(formatCustomerSpend({ INR: 800, USD: 10 })).toContain("INR 800.00"); });
  it("rejects malformed customer rows before export", () => { expect(() => parseCustomerReport({ rows: [{ id: "profile" }], total: 1 })).toThrow("Invalid customer summary response"); });
  it("neutralizes formula injection", () => { expect(csvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"'); });
  it("escapes commas and quotes", () => { expect(csvCell('A, "B"')).toBe('"A, ""B"""'); });
});