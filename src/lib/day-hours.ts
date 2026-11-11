/**
 * Day-specific opening hours typed into the bay settings form.
 *
 * Staff often type a day's hours and press the dialog's main Save button
 * instead of the small add button. These helpers let the dialog save what is
 * on screen, and refuse windows that would leave the day with no open time.
 */

export interface PendingDayHours {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
}

const hhmm = (t: string | null | undefined): string => (t ?? "").slice(0, 5);

/** Returns the entry staff typed, or null when both times are blank. */
export function pendingDayHours(day: number, open: string, close: string): PendingDayHours | null {
  const o = hhmm(open);
  const c = hhmm(close);
  if (!o && !c) return null;
  return { day_of_week: day, open_time: o || null, close_time: c || null };
}

/**
 * Validates an entry against the bay's normal hours (used when a field is
 * left blank). Returns an error message, or null when the window is valid.
 */
export function dayHoursError(
  entry: PendingDayHours,
  bayOpen: string,
  bayClose: string,
): string | null {
  if (!Number.isInteger(entry.day_of_week) || entry.day_of_week < 0 || entry.day_of_week > 6) {
    return "Choose a day of the week.";
  }
  const open = hhmm(entry.open_time) || hhmm(bayOpen);
  const close = hhmm(entry.close_time) || hhmm(bayClose);
  if (!open || !close) return "Enter an opening or closing time.";
  if (open >= close) return "Closing time must be after opening time.";
  return null;
}
