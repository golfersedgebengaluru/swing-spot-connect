import { describe, it, expect } from "vitest";
import {
  isWeeklyOff,
  isHoliday,
  isDateBlocked,
  getBlockedReason,
  resolvePeakHours,
  isWithinPeakHours,
  getDayName,
  getDayShort,
} from "@/lib/bay-schedule-utils";

describe("bay-schedule-utils", () => {
  describe("getDayName / getDayShort", () => {
    it("returns correct day names", () => {
      expect(getDayName(0)).toBe("Sunday");
      expect(getDayName(6)).toBe("Saturday");
      expect(getDayShort(1)).toBe("Mon");
    });
  });

  describe("isWeeklyOff", () => {
    it("returns true when date falls on an off day", () => {
      // 2026-04-12 is a Sunday (day 0)
      const sunday = new Date(2026, 3, 12);
      expect(isWeeklyOff(sunday, [0])).toBe(true);
      expect(isWeeklyOff(sunday, [1, 2])).toBe(false);
    });

    it("returns false for empty off days", () => {
      const monday = new Date(2026, 3, 13);
      expect(isWeeklyOff(monday, [])).toBe(false);
    });
  });

  describe("isHoliday", () => {
    const holidays = [
      { bay_id: null, city: "Delhi", holiday_date: "2026-04-14" },
      { bay_id: "bay-1", city: "Delhi", holiday_date: "2026-04-15" },
    ];

    it("matches city-wide holiday (bay_id null)", () => {
      const date = new Date(2026, 3, 14);
      expect(isHoliday(date, holidays)).toBe(true);
      expect(isHoliday(date, holidays, "bay-2")).toBe(true); // city-wide applies to all
    });

    it("matches bay-specific holiday", () => {
      const date = new Date(2026, 3, 15);
      expect(isHoliday(date, holidays, "bay-1")).toBe(true);
      expect(isHoliday(date, holidays, "bay-2")).toBe(false);
    });

    it("returns false for non-holiday date", () => {
      const date = new Date(2026, 3, 16);
      expect(isHoliday(date, holidays)).toBe(false);
    });
  });

  describe("isDateBlocked", () => {
    it("blocks on weekly off", () => {
      const sunday = new Date(2026, 3, 12);
      expect(isDateBlocked(sunday, [0], [])).toBe(true);
    });

    it("blocks on holiday", () => {
      const date = new Date(2026, 3, 14);
      const holidays = [{ bay_id: null, city: "Delhi", holiday_date: "2026-04-14" }];
      expect(isDateBlocked(date, [], holidays)).toBe(true);
    });

    it("allows non-blocked dates", () => {
      const date = new Date(2026, 3, 13); // Monday
      expect(isDateBlocked(date, [0], [])).toBe(false);
    });
  });

  describe("getBlockedReason", () => {
    it("returns weekly off reason", () => {
      const sunday = new Date(2026, 3, 12);
      expect(getBlockedReason(sunday, [0], [])).toBe("Closed on Sundays");
    });

    it("returns holiday reason with label", () => {
      const date = new Date(2026, 3, 14);
      const holidays = [{ bay_id: null, city: "Delhi", holiday_date: "2026-04-14", label: "Ambedkar Jayanti" }];
      expect(getBlockedReason(date, [], holidays)).toBe("Holiday: Ambedkar Jayanti");
    });

    it("returns null for non-blocked dates", () => {
      expect(getBlockedReason(new Date(2026, 3, 13), [], [])).toBeNull();
    });
  });

  describe("resolvePeakHours", () => {
    const peakHours = [
      { day_of_week: null, peak_start: "17:00", peak_end: "21:00" },
      { day_of_week: null, peak_start: "10:00", peak_end: "12:00" },
      { day_of_week: 6, peak_start: "09:00", peak_end: "13:00" }, // Saturday override
      { day_of_week: 6, peak_start: "16:00", peak_end: "22:00" }, // Saturday 2nd window
    ];

    it("returns defaults for days without overrides", () => {
      const result = resolvePeakHours(peakHours, 1); // Monday
      expect(result).toHaveLength(2);
      expect(result[0].peak_start).toBe("17:00");
      expect(result[1].peak_start).toBe("10:00");
    });

    it("returns day-specific overrides when available", () => {
      const result = resolvePeakHours(peakHours, 6); // Saturday
      expect(result).toHaveLength(2);
      expect(result[0].peak_start).toBe("09:00");
      expect(result[1].peak_start).toBe("16:00");
    });

    it("returns empty for no matching peak hours", () => {
      const result = resolvePeakHours([], 0);
      expect(result).toHaveLength(0);
    });
  });

  describe("isWithinPeakHours", () => {
    const windows = [
      { peak_start: "10:00", peak_end: "12:00" },
      { peak_start: "17:00", peak_end: "21:00" },
    ];

    it("returns true when within a peak window", () => {
      expect(isWithinPeakHours("11:00", windows)).toBe(true);
      expect(isWithinPeakHours("18:30", windows)).toBe(true);
    });

    it("returns false when outside all peak windows", () => {
      expect(isWithinPeakHours("09:00", windows)).toBe(false);
      expect(isWithinPeakHours("14:00", windows)).toBe(false);
      expect(isWithinPeakHours("21:00", windows)).toBe(false); // end is exclusive
    });

    it("handles edge cases", () => {
      expect(isWithinPeakHours("10:00", windows)).toBe(true); // start is inclusive
      expect(isWithinPeakHours("12:00", windows)).toBe(false); // end is exclusive
    });
  });
});
