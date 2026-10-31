import { describe, expect, it } from "vitest";
import { parseDashboardAttention } from "../dashboard-attention";

describe("dashboard response validation", () => {
  it("retains booking IDs rather than inferring first visits from customer names", () => {
    const value = parseDashboardAttention({ renewals: [], inactive: [], first_visits: ["booking-1"], renewal_total: 0, inactive_total: 0 });
    expect(value.first_visits).toEqual(["booking-1"]);
  });
  it("rejects unavailable and malformed data instead of treating it as an empty list", () => {
    expect(() => parseDashboardAttention(null)).toThrow();
    expect(() => parseDashboardAttention({ renewals: [{ id: "profile-1" }], inactive: [], first_visits: [], renewal_total: 1, inactive_total: 0 })).toThrow();
  });
});