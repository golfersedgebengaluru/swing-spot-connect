import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openingHoursError, type OpeningBay } from "../../../supabase/functions/_shared/opening-hours";
import { bayDayWindow } from "@/lib/day-schedule";

// Bengaluru Bay #1 as configured: 10:00–22:00, early access 05:00–09:00, Sundays 10:00–18:00.
const bay: OpeningBay & { city: string } = {
  id: "blr-1",
  city: "Bengaluru",
  open_time: "10:00",
  close_time: "22:00",
  weekly_off_days: [],
  extended_hours_enabled: true,
  extended_open_time: "05:00:00",
  extended_close_time: "09:00:00",
  hours_overrides: [{ day_of_week: 0, open_time: "10:00:00", close_time: "18:00:00" }],
};
const TZ = "Asia/Kolkata";
// Local IST wall time -> UTC ISO
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`).toISOString();
const check = (date: string, from: string, to: string, extra: Partial<Parameters<typeof openingHoursError>[0]> = {}) =>
  openingHoursError({ bay, holidays: [], startIso: ist(date, from), endIso: ist(date, to), timeZone: TZ, includeExtended: false, ...extra });

const SUNDAY = "2026-11-15";
const WEDNESDAY = "2026-11-11";

describe("customer bookings stay inside opening hours", () => {
  it("allows a Sunday booking that ends at the 6 PM Sunday close", () => {
    expect(check(SUNDAY, "17:00", "18:00")).toBeNull();
  });

  it("refuses a Sunday booking that runs past 6 PM", () => {
    expect(check(SUNDAY, "17:30", "18:30")).toBe("Bookings on this day must be between 10:00 and 18:00.");
  });

  it("keeps normal 10 PM closing on weekdays", () => {
    expect(check(WEDNESDAY, "20:00", "22:00")).toBeNull();
    expect(check(WEDNESDAY, "21:30", "22:30")).not.toBeNull();
  });

  it("refuses early-morning times unless the member has extended-hours access", () => {
    expect(check(WEDNESDAY, "06:00", "07:00")).not.toBeNull();
    expect(check(WEDNESDAY, "06:00", "07:00", { includeExtended: true })).toBeNull();
  });

  it("refuses weekly off days", () => {
    expect(check(WEDNESDAY, "11:00", "12:00", { bay: { ...bay, weekly_off_days: [3] } })).toBe("This bay is closed on Wednesdays.");
  });

  it("refuses city-wide and same-bay holidays but ignores other bays' holidays", () => {
    expect(check(WEDNESDAY, "11:00", "12:00", { holidays: [{ bay_id: null, holiday_date: WEDNESDAY, label: "Diwali" }] }))
      .toBe("This bay is closed on 2026-11-11 (Diwali).");
    expect(check(WEDNESDAY, "11:00", "12:00", { holidays: [{ bay_id: "other-bay", holiday_date: WEDNESDAY }] })).toBeNull();
  });

  it("uses the centre's local date, not the UTC date", () => {
    // 00:30 IST Thursday is still Wednesday in UTC; a Thursday holiday must apply.
    expect(openingHoursError({
      bay: { ...bay, extended_open_time: "00:00", extended_close_time: "09:00" },
      holidays: [{ bay_id: null, holiday_date: "2026-11-12" }],
      startIso: ist("2026-11-12", "00:30"), endIso: ist("2026-11-12", "01:30"), timeZone: TZ, includeExtended: true,
    })).toBe("This bay is closed on 2026-11-12.");
  });
});

describe("customer-only enforcement", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "../../../", p), "utf8");

  it("checks opening hours in customer checkout", () => {
    expect(read("supabase/functions/create-razorpay-order/index.ts")).toMatch(/customerOpeningHoursError\(admin/);
  });

  it("checks member-hours bookings unless staff are booking", () => {
    const src = read("supabase/functions/calendar-sync/index.ts");
    const create = src.slice(src.indexOf('action === "create_booking"'), src.indexOf('action === "approve_booking"'));
    expect(create).toMatch(/if \(!callerIsStaff && !isParticipant\) \{\s*const hoursError = bay_id\s*\?\s*await customerOpeningHoursError/);
  });
});

describe("Day View hours", () => {
  it("shows Bengaluru's full day from early access to 10 PM, not just until the early-access close", () => {
    expect(bayDayWindow(bay, WEDNESDAY, [])).toEqual({ open: 5 * 60, close: 22 * 60, closedReason: null });
  });

  it("uses the Sunday 6 PM closing time", () => {
    expect(bayDayWindow(bay, SUNDAY, []).close).toBe(18 * 60);
  });

  it("shows holidays as closed", () => {
    expect(bayDayWindow(bay, WEDNESDAY, [{ bay_id: null, city: "Bengaluru", holiday_date: WEDNESDAY, label: "Diwali" }]))
      .toEqual({ open: null, close: null, closedReason: "Holiday: Diwali" });
  });
});
