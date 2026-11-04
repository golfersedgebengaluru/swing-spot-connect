import { describe, expect, it } from "vitest";
import { csvCell, customerReportCsv, formatCustomerSpend, parseCustomerReport, type CustomerRow } from "../customer-report";
describe("customer report export rules", () => {
  it("does not combine currencies", () => { expect(formatCustomerSpend({ INR: 800, USD: 10 })).toContain("USD 10.00"); expect(formatCustomerSpend({ INR: 800, USD: 10 })).toContain("INR 800.00"); });
  it("rejects malformed customer rows before export", () => { expect(() => parseCustomerReport({ rows: [{ id: "profile" }], total: 1 })).toThrow("Invalid customer summary response"); });
  it("neutralizes formula injection", () => { expect(csvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"'); });
  it("escapes commas and quotes", () => { expect(csvCell('A, "B"')).toBe('"A, ""B"""'); });
  it("exports the selected activity values rather than lifetime values", () => {
    const row: CustomerRow = {
      id: "profile", user_id: null, display_name: "Customer", email: null, phone: null, preferred_city: "Bengaluru", user_type: "birdie", customer_status: "member", points: 5, created_at: "2026-08-02", extended_hours_access: false,
      member_hours_id: "hours", hours_purchased: 25, hours_used: 10, hours_remaining: 15, first_visit: null, last_visit: null, next_booking: null, visit_count: 2, lifetime_visits: 11, corporate_visits: 1, visited_cities: ["Bengaluru"], period_spend: { INR: 1200 }, lifetime_spend: { INR: 25000 }, booking_channel: "Unknown",
    };
    const values = customerReportCsv([row]).split("\r\n")[1].split(",");
    expect(values[10]).toBe('"2"');
    expect(values[11]).toBe('"1"');
    expect(customerReportCsv([row])).toContain('"INR 1,200.00"');
    expect(customerReportCsv([row])).not.toContain('"INR 25,000.00"');
  });
});