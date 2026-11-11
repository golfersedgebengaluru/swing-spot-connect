import { describe, it, expect } from "vitest";
import { dayHoursError, pendingDayHours } from "@/lib/day-hours";

describe("day-specific hours typed in bay settings", () => {
  it("keeps Sunday 10:00–18:00 as something to save", () => {
    expect(pendingDayHours(0, "10:00", "18:00")).toEqual({ day_of_week: 0, open_time: "10:00", close_time: "18:00" });
  });

  it("treats blank open and close as nothing typed", () => {
    expect(pendingDayHours(0, "", "")).toBeNull();
  });

  it("accepts closing at 18:00 with the bay's normal 10:00 opening", () => {
    expect(dayHoursError({ day_of_week: 0, open_time: null, close_time: "18:00" }, "10:00", "22:00")).toBeNull();
  });

  it("refuses a closing time before the bay opens", () => {
    expect(dayHoursError({ day_of_week: 0, open_time: null, close_time: "09:00" }, "10:00", "22:00")).toMatch(/after opening/);
  });
});
