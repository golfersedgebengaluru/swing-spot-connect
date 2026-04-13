/**
 * Utility functions for bay scheduling — holidays, weekly offs, and peak hours.
 */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function getDayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

export function getDayShort(dayOfWeek: number): string {
  return getDayName(dayOfWeek).slice(0, 3);
}

/**
 * Check if a date is a weekly off for a bay.
 */
export function isWeeklyOff(date: Date, weeklyOffDays: number[]): boolean {
  return weeklyOffDays.includes(date.getDay());
}

/**
 * Check if a date is a holiday for a city or specific bay.
 * holidays: array of { bay_id, city, holiday_date } records
 * bayId: the specific bay being checked (if any)
 */
export function isHoliday(
  date: Date,
  holidays: Array<{ bay_id: string | null; city: string; holiday_date: string }>,
  bayId?: string
): boolean {
  const dateStr = formatDateStr(date);
  return holidays.some(
    (h) =>
      h.holiday_date === dateStr &&
      (h.bay_id === null || h.bay_id === bayId)
  );
}

/**
 * Check if a date is blocked (either weekly off or holiday).
 */
export function isDateBlocked(
  date: Date,
  weeklyOffDays: number[],
  holidays: Array<{ bay_id: string | null; city: string; holiday_date: string }>,
  bayId?: string
): boolean {
  return isWeeklyOff(date, weeklyOffDays) || isHoliday(date, holidays, bayId);
}

/**
 * Get the reason a date is blocked.
 */
export function getBlockedReason(
  date: Date,
  weeklyOffDays: number[],
  holidays: Array<{ bay_id: string | null; city: string; holiday_date: string; label?: string }>,
  bayId?: string
): string | null {
  if (isWeeklyOff(date, weeklyOffDays)) {
    return `Closed on ${getDayName(date.getDay())}s`;
  }
  const dateStr = formatDateStr(date);
  const holiday = holidays.find(
    (h) => h.holiday_date === dateStr && (h.bay_id === null || h.bay_id === bayId)
  );
  if (holiday) {
    return holiday.label ? `Holiday: ${holiday.label}` : "Holiday";
  }
  return null;
}

/**
 * Resolve peak hours for a given bay and day of week.
 * Returns the peak hour windows that apply for the given day.
 * Logic: if there are day-specific entries, use those. Otherwise fall back to default (day_of_week = null).
 */
export function resolvePeakHours(
  peakHours: Array<{ day_of_week: number | null; peak_start: string; peak_end: string }>,
  dayOfWeek: number
): Array<{ peak_start: string; peak_end: string }> {
  const daySpecific = peakHours.filter((p) => p.day_of_week === dayOfWeek);
  if (daySpecific.length > 0) {
    return daySpecific.map((p) => ({ peak_start: p.peak_start, peak_end: p.peak_end }));
  }
  const defaults = peakHours.filter((p) => p.day_of_week === null);
  return defaults.map((p) => ({ peak_start: p.peak_start, peak_end: p.peak_end }));
}

/**
 * Check if a given time (HH:MM) falls within any peak window.
 */
export function isWithinPeakHours(
  timeStr: string,
  peakWindows: Array<{ peak_start: string; peak_end: string }>
): boolean {
  return peakWindows.some((w) => timeStr >= w.peak_start && timeStr < w.peak_end);
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
