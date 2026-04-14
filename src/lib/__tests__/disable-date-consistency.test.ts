import { describe, it, expect } from "vitest";
import { addDays } from "date-fns";

/**
 * Reproduces the bug where Bookings.tsx (registered users) greyed out today
 * because `today` was not zeroed to midnight, while PublicBooking / ManualBooking
 * correctly called setHours(0,0,0,0).
 *
 * The disableDate logic across all booking surfaces is:
 *   if (date < today || date > maxDate) return true;
 *
 * `date` comes from the calendar which always returns midnight for a given day.
 */

function makeDisableDateFn(zeroOutHours: boolean) {
  const today = new Date();
  if (zeroOutHours) today.setHours(0, 0, 0, 0);
  const maxDate = addDays(today, 30);
  return (date: Date) => date < today || date > maxDate;
}

describe("disableDate consistency across booking surfaces", () => {
  it("today should NOT be disabled when hours are zeroed (correct behaviour)", () => {
    const disableDate = makeDisableDateFn(true);
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    expect(disableDate(todayMidnight)).toBe(false);
  });

  it("today IS incorrectly disabled when hours are NOT zeroed (the bug)", () => {
    // This test documents the bug: without zeroing, today-at-midnight < today-at-current-time
    const now = new Date();
    // Only fails when current time is after midnight (which is always true in practice)
    if (now.getHours() > 0 || now.getMinutes() > 0 || now.getSeconds() > 0) {
      const disableDate = makeDisableDateFn(false);
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      expect(disableDate(todayMidnight)).toBe(true); // bug: today is disabled
    }
  });

  it("yesterday should always be disabled", () => {
    const disableDate = makeDisableDateFn(true);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    expect(disableDate(yesterday)).toBe(true);
  });

  it("tomorrow should never be disabled", () => {
    const disableDate = makeDisableDateFn(true);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    expect(disableDate(tomorrow)).toBe(false);
  });

  it("31 days from now should be disabled (beyond 30-day window)", () => {
    const disableDate = makeDisableDateFn(true);
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 31);
    expect(disableDate(future)).toBe(true);
  });

  it("30 days from now should NOT be disabled", () => {
    const disableDate = makeDisableDateFn(true);
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 30);
    expect(disableDate(future)).toBe(false);
  });
});
