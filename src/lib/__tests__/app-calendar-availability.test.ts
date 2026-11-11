import { describe, expect, it } from "vitest";
import { computeSlots, memberHoursForBay } from "../../../supabase/functions/_shared/app-availability";
import { bayChoices, canStartAt, practiceHoursFor, priceRowFor } from "@/lib/bay-types";
import { placeItemsForBay, zonedTimeToUtc } from "@/lib/day-schedule";

const A = "bay-a";
const B = "bay-b";
const day = Date.parse("2026-12-01T13:30:00Z"); // 7:00 PM IST
const halfHour = 30 * 60_000;

describe("app-calendar slots", () => {
  const slots = (busy: { bay_id: string; start_time: string; end_time: string }[], adminMode = false) =>
    computeSlots({ dayStartMs: day, dayEndMs: day + 4 * 60 * 60_000, nowMs: day - 86_400_000, adminMode, candidateBayIds: [A, B], busy });
  const iso = (ms: number) => new Date(ms).toISOString();

  it("shows a time open while any bay of the type is free", () => {
    const s = slots([{ bay_id: A, start_time: iso(day), end_time: iso(day + 2 * halfHour) }]);
    expect(s[0]).toMatchObject({ available: true, free_bays: [B] });
  });

  it("shows a time taken when every bay is busy", () => {
    const s = slots([
      { bay_id: A, start_time: iso(day), end_time: iso(day + halfHour) },
      { bay_id: B, start_time: iso(day), end_time: iso(day + halfHour) },
    ]);
    expect(s[0].available).toBe(false);
  });

  it("refuses a 1-hour start when no single bay is free for the full hour", () => {
    // A is free 7:00–7:30 only, B is free 7:30–8:00 only.
    const s = slots([
      { bay_id: A, start_time: iso(day + halfHour), end_time: iso(day + 4 * halfHour) },
      { bay_id: B, start_time: iso(day), end_time: iso(day + halfHour) },
    ]);
    expect(s[0].available).toBe(true);
    expect(s[1].available).toBe(true);
    expect(canStartAt(s, 0, 60)).toBe(false);
    expect(canStartAt(s, 0, 30)).toBe(true);
  });

  it("allows a 1.5-hour start when one bay stays free throughout", () => {
    const s = slots([{ bay_id: A, start_time: iso(day + halfHour), end_time: iso(day + 2 * halfHour) }]);
    expect(canStartAt(s, 0, 90)).toBe(true);
  });

  it("hides past times from customers but not staff", () => {
    const s = computeSlots({ dayStartMs: day, dayEndMs: day + 4 * 60 * 60_000, nowMs: day + halfHour + 1, adminMode: false, candidateBayIds: [A], busy: [] });
    expect(s[0].available).toBe(false);
    const staff = computeSlots({ dayStartMs: day, dayEndMs: day + 4 * 60 * 60_000, nowMs: day + halfHour + 1, adminMode: true, candidateBayIds: [A], busy: [] });
    expect(staff[0].available).toBe(true);
  });
});

describe("Bunker Bay settings", () => {
  it("charges hours using the bay's rate and blocks hours when switched off", () => {
    expect(practiceHoursFor({ member_hours_enabled: true, member_hours_rate: 1.5 }, 60)).toBe(1.5);
    expect(practiceHoursFor({ member_hours_enabled: true, member_hours_rate: 2 }, 90)).toBe(3);
    expect(practiceHoursFor({ member_hours_enabled: false, member_hours_rate: 1 }, 60)).toBeNull();
    expect(practiceHoursFor(undefined, 120)).toBe(2);
    expect(memberHoursForBay({ member_hours_enabled: true, member_hours_rate: 1.5 }, 2)).toBe(3);
    expect(memberHoursForBay({ member_hours_enabled: false, member_hours_rate: 1 }, 1)).toBeNull();
  });

  it("uses Bunker prices for Bunker Bay and Standard prices otherwise", () => {
    const rows = [
      { city: "Gurugram", day_type: "weekday", session_type: "individual", price_per_hour: 1500 },
      { city: "Gurugram", day_type: "weekday", session_type: "individual", bay_type: "bunker", price_per_hour: 2500 },
    ];
    expect(priceRowFor(rows, "Gurugram", "bunker", "weekday", (s) => s === "individual")?.price_per_hour).toBe(2500);
    expect(priceRowFor(rows, "Gurugram", "standard", "weekday", (s) => s === "individual")?.price_per_hour).toBe(1500);
    expect(priceRowFor(rows, "Chennai", "bunker", "weekday", () => true)).toBeNull();
  });

  it("offers customers one choice per bay type in app-calendar cities", () => {
    const bays = [
      { id: "1", name: "Bay #1", bay_type: "standard", sort_order: 1 },
      { id: "2", name: "Bay #2", bay_type: "standard", sort_order: 2 },
      { id: "3", name: "Bunker Bay", bay_type: "bunker", sort_order: 3 },
    ];
    expect(bayChoices(bays, true).map((c) => c.label)).toEqual(["Standard bay", "Bunker Bay"]);
    expect(bayChoices(bays, false).map((c) => c.label)).toEqual(["Bay #1", "Bay #2", "Bunker Bay"]);
  });
});

describe("day view", () => {
  it("converts centre wall-clock times to UTC regardless of device timezone", () => {
    expect(zonedTimeToUtc("2026-12-01", "19:00", "Asia/Kolkata").toISOString()).toBe("2026-12-01T13:30:00.000Z");
    expect(zonedTimeToUtc("2026-07-01", "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });

  it("shows a city-wide block-out in every bay column, clipped to the visible hours", () => {
    const dayStart = zonedTimeToUtc("2026-12-01", "00:00", "Asia/Kolkata");
    const items = [
      { kind: "blockout", id: "x", bay_id: null, start_time: "2026-11-30T23:30:00Z", end_time: "2026-12-01T02:30:00Z", label: null, session_type: null, on_google: true },
      { kind: "booking", id: "y", bay_id: A, start_time: "2026-12-01T13:30:00Z", end_time: "2026-12-01T14:30:00Z", label: "Kapil", session_type: "practice", on_google: false },
    ];
    const colA = placeItemsForBay(items, A, dayStart, 6 * 60, 23 * 60);
    const colB = placeItemsForBay(items, B, dayStart, 6 * 60, 23 * 60);
    expect(colA.map((i) => i.id)).toEqual(["x", "y"]);
    expect(colB.map((i) => i.id)).toEqual(["x"]);
    expect(colA[0]).toMatchObject({ top: 0, height: 120 }); // 6:00–8:00 IST visible part
    expect(colA[1]).toMatchObject({ top: 13 * 60, height: 60 }); // 7–8 PM
  });
});
