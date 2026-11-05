import { describe, expect, it } from "vitest";
import { bookingTimeDisplay } from "../booking-time";
import { enrichBookingTimezones } from "../../../supabase/functions/calendar-sync/booking-timezones";

describe("centre-local booking times", () => {
  it("shows Russell's Nov 8 noon–2PM India booking independently of the runtime timezone", () => {
    const display = bookingTimeDisplay("2026-11-08T06:30:00Z", "2026-11-08T08:30:00Z", "Asia/Kolkata");
    expect(display.timeRange).toBe("12:00 PM – 2:00 PM");
    expect(display.csvDate).toBe("2026-11-08");
    expect(display.timezone).toBe("Asia/Kolkata");
  });

  it("uses each bay calendar timezone rather than a single India assumption", () => {
    expect(bookingTimeDisplay("2026-11-08T06:30:00Z", "2026-11-08T08:30:00Z", "Asia/Seoul").timeRange)
      .toBe("3:30 PM – 5:30 PM");
  });

  it("keeps the calendar-local date across a midnight boundary", () => {
    const display = bookingTimeDisplay("2026-11-07T20:00:00Z", "2026-11-07T21:00:00Z", "Asia/Kolkata");
    expect(display.csvDate).toBe("2026-11-08");
    expect(display.timeRange).toBe("1:30 AM – 2:30 AM");
  });

  it("uses an explicit UTC fallback instead of silently guessing the user's local zone", () => {
    for (const zone of [null, "invalid/zone"]) {
      const display = bookingTimeDisplay("2026-11-08T06:30:00Z", "2026-11-08T08:30:00Z", zone);
      expect(display.timeRange).toBe("6:30 AM – 8:30 AM");
      expect(display.timezoneLabel).toBe("UTC · centre timezone unavailable");
    }
  });

  it("respects daylight saving time in the calendar timezone", () => {
    expect(bookingTimeDisplay("2026-07-08T16:00:00Z", "2026-07-08T17:00:00Z", "America/New_York").timeRange).toBe("12:00 PM – 1:00 PM");
    expect(bookingTimeDisplay("2026-11-08T16:00:00Z", "2026-11-08T17:00:00Z", "America/New_York").timeRange).toBe("11:00 AM – 12:00 PM");
  });
});

describe("booking timezone enrichment", () => {
  it("caches repeated bays/calendars and never returns their private calendar identifiers", async () => {
    let bayCalls = 0;
    let timezoneCalls = 0;
    const rows = await enrichBookingTimezones([
      { bay_id: "one", city: "City", start_time: "2026-11-08T06:30:00Z" },
      { bay_id: "one", city: "City", start_time: "2026-11-09T06:30:00Z" },
      { bay_id: "two", city: "City", start_time: "2026-11-10T06:30:00Z" },
    ], async () => { bayCalls++; return { name: "Bay", calendar: "private-calendar" }; },
    async () => { timezoneCalls++; return "Asia/Kolkata"; });
    expect(bayCalls).toBe(2);
    expect(timezoneCalls).toBe(1);
    expect(rows.map((r) => r.timezone)).toEqual(["Asia/Kolkata", "Asia/Kolkata", "Asia/Kolkata"]);
    expect(rows[0].start_time).toBe("2026-11-08T06:30:00Z");
    expect(JSON.stringify(rows)).not.toContain("private-calendar");
  });

  it("preserves history when the calendar is unavailable", async () => {
    const rows = await enrichBookingTimezones([{ bay_id: null, city: "City" }],
      async () => ({ name: null, calendar: null }), async () => { throw new Error("Must not call"); });
    expect(rows).toEqual([{ bay_id: null, city: "City", bay_name: null, timezone: null }]);
  });
});