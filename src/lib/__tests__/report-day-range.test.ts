import { describe, it, expect } from "vitest";
import { reportDayRange, zonedMonthDays } from "@/lib/report-period";

describe("reportDayRange", () => {
  it("returns the inclusive business-day range unchanged", () => {
    expect(reportDayRange("2026-08-01", "2026-08-31")).toEqual({
      fromDay: "2026-08-01",
      toDay: "2026-08-31",
    });
  });

  it("trims stray whitespace", () => {
    expect(reportDayRange(" 2026-08-01 ", " 2026-08-31 ")).toEqual({
      fromDay: "2026-08-01",
      toDay: "2026-08-31",
    });
  });

  it("rejects malformed dates so a bad filter can never skew a report", () => {
    expect(() => reportDayRange("01/08/2026", "2026-08-31")).toThrow();
    expect(() => reportDayRange("2026-08-01", "")).toThrow();
  });

  it("includes a back-dated invoice day inside its month", () => {
    const { fromDay, toDay } = reportDayRange("2026-08-01", "2026-08-31");
    const invoiceDate = "2026-08-08"; // entered on 9 September, dated 8 August
    expect(invoiceDate >= fromDay && invoiceDate <= toDay).toBe(true);
  });

  it("excludes that invoice day from the following month", () => {
    const { fromDay, toDay } = reportDayRange("2026-09-01", "2026-09-30");
    expect("2026-08-08" >= fromDay && "2026-08-08" <= toDay).toBe(false);
  });
});

describe("zonedMonthDays", () => {
  it("covers the whole IST month", () => {
    // 31 Aug 2026 21:00 UTC is already 1 Sep in India.
    expect(zonedMonthDays(new Date("2026-08-31T21:00:00Z"))).toEqual({
      fromDay: "2026-09-01",
      toDay: "2026-09-30",
    });
  });

  it("handles 31-day months", () => {
    expect(zonedMonthDays(new Date("2026-08-15T06:00:00Z"))).toEqual({
      fromDay: "2026-08-01",
      toDay: "2026-08-31",
    });
  });

  it("handles February in a leap year", () => {
    expect(zonedMonthDays(new Date("2028-02-10T06:00:00Z"))).toEqual({
      fromDay: "2028-02-01",
      toDay: "2028-02-29",
    });
  });
});
