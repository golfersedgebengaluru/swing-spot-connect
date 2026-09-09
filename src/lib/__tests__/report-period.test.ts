import { describe, it, expect } from "vitest";
import {
  REPORT_TIME_ZONE,
  reportRangeToUtc,
  zonedDayStartUtc,
  zonedDayString,
  zonedMonthRangeUtc,
} from "@/lib/report-period";

describe("report period boundaries", () => {
  it("uses the business timezone for reporting", () => {
    expect(REPORT_TIME_ZONE).toBe("Asia/Kolkata");
  });

  it("maps local midnight to the correct UTC instant (IST = UTC+5:30)", () => {
    expect(zonedDayStartUtc("2026-08-01").toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });

  it("produces a half-open range covering the whole inclusive month", () => {
    const { fromUtc, toExclusiveUtc } = reportRangeToUtc("2026-08-01", "2026-08-31");
    expect(fromUtc).toBe("2026-07-31T18:30:00.000Z");
    expect(toExclusiveUtc).toBe("2026-08-31T18:30:00.000Z");
  });

  it("keeps an early-morning local payment in its own local month", () => {
    // 02:00 IST on 1 Sep = 20:30 UTC on 31 Aug. The old
    // `endDate + "T23:59:59.999Z"` rule pulled this into August.
    const aug = reportRangeToUtc("2026-08-01", "2026-08-31");
    const sep = reportRangeToUtc("2026-09-01", "2026-09-30");
    const payment = new Date("2026-08-31T20:30:00.000Z").getTime();

    expect(payment >= new Date(aug.fromUtc).getTime()).toBe(true);
    expect(payment < new Date(aug.toExclusiveUtc).getTime()).toBe(false);
    expect(payment >= new Date(sep.fromUtc).getTime()).toBe(true);
    expect(payment < new Date(sep.toExclusiveUtc).getTime()).toBe(true);
  });

  it("has no gap or overlap between consecutive periods", () => {
    const aug = reportRangeToUtc("2026-08-01", "2026-08-31");
    const sep = reportRangeToUtc("2026-09-01", "2026-09-30");
    expect(aug.toExclusiveUtc).toBe(sep.fromUtc);
  });

  it("handles a single-day range as exactly 24 hours", () => {
    const { fromUtc, toExclusiveUtc } = reportRangeToUtc("2026-02-15", "2026-02-15");
    expect(new Date(toExclusiveUtc).getTime() - new Date(fromUtc).getTime()).toBe(24 * 3600 * 1000);
  });

  it("handles month ends across a year boundary", () => {
    const dec = reportRangeToUtc("2026-12-01", "2026-12-31");
    expect(dec.toExclusiveUtc).toBe(reportRangeToUtc("2027-01-01", "2027-01-31").fromUtc);
  });

  it("respects a leap February", () => {
    const feb = zonedMonthRangeUtc(new Date("2028-02-10T00:00:00Z"));
    expect(feb.fromUtc).toBe("2028-01-31T18:30:00.000Z");
    expect(feb.toExclusiveUtc).toBe("2028-02-29T18:30:00.000Z");
  });

  it("derives the month from the LOCAL date, not the UTC date", () => {
    // 2026-08-31T20:30Z is already 1 Sep in IST.
    const range = zonedMonthRangeUtc(new Date("2026-08-31T20:30:00.000Z"));
    expect(range.fromUtc).toBe("2026-08-31T18:30:00.000Z"); // 1 Sep IST
  });

  it("formats an instant as its local calendar day", () => {
    expect(zonedDayString(new Date("2026-08-31T20:30:00.000Z"))).toBe("2026-09-01");
    expect(zonedDayString(new Date("2026-08-31T18:00:00.000Z"))).toBe("2026-08-31");
  });

  it("works in a DST timezone without losing an hour", () => {
    const range = reportRangeToUtc("2026-03-01", "2026-03-31", "America/New_York");
    expect(range.fromUtc).toBe("2026-03-01T05:00:00.000Z"); // EST
    expect(range.toExclusiveUtc).toBe("2026-04-01T04:00:00.000Z"); // EDT
  });

  it("rejects malformed dates instead of silently skewing a report", () => {
    expect(() => reportRangeToUtc("01/08/2026", "2026-08-31")).toThrow(/Invalid report date/);
    expect(() => zonedDayStartUtc("")).toThrow(/Invalid report date/);
  });
});
