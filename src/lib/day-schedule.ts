// Pure helpers for the staff all-bays day view. Times are always shown in the
// centre's timezone, never the viewer's device timezone.

import { getBlockedReason } from "@/lib/bay-schedule-utils";
import { getBookableWindow, type BayHoursOverride } from "@/lib/extended-hours";

export const SLOT_MINUTES = 30;

function validZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** Minutes the zone is ahead of UTC at the given instant. */
function zoneOffsetMinutes(atMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validZone(timeZone), hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(atMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - atMs) / 60_000);
}

/** UTC instant for a wall-clock time ("HH:mm") on a date ("yyyy-MM-dd") in the zone. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle the offset across daylight-saving changes.
  let utc = wall - zoneOffsetMinutes(wall, timeZone) * 60_000;
  utc = wall - zoneOffsetMinutes(utc, timeZone) * 60_000;
  return new Date(utc);
}

/** Wall-clock minutes since midnight of `iso` in the zone. */
export function minutesInZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validZone(timeZone), hourCycle: "h23", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function formatTimeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: validZone(timeZone), hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function hhmmToMinutes(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const [h, m] = value.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : fallback;
}

export interface ScheduleItem {
  kind: string;
  id: string;
  bay_id: string | null;
  start_time: string;
  end_time: string;
  label: string | null;
  session_type: string | null;
  on_google: boolean;
}

/** One-off and weekly repeating block-outs both stop bookings. */
export function isBlockoutKind(kind: string): boolean {
  return kind === "blockout" || kind === "recurring_blockout";
}

/** Weekday (0 = Sunday) of a "yyyy-MM-dd" date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Validates a weekly repeating block before it is saved; returns an error message or null. */
export function recurringBlockError(opts: { days: number[]; from: string; to: string; startsOn: string; endsOn: string }): string | null {
  if (!opts.days.length) return "Pick at least one day";
  if (!opts.from || !opts.to || opts.to <= opts.from) return "End time must be after start time";
  if (!opts.startsOn) return "Choose a start date";
  if (opts.endsOn && opts.endsOn < opts.startsOn) return "End date must be on or after the start date";
  return null;
}

export interface PlacedItem extends ScheduleItem {
  /** Minutes from the top of the grid. */
  top: number;
  height: number;
}

/**
 * Items for one bay column, clipped to the visible window. City-wide
 * block-outs (no bay) appear in every column.
 */
export function placeItemsForBay(
  items: ScheduleItem[],
  bayId: string,
  dayStartUtc: Date,
  windowStartMin: number,
  windowEndMin: number,
): PlacedItem[] {
  const dayStartMs = dayStartUtc.getTime();
  return items
    .filter((i) => i.bay_id === bayId || (isBlockoutKind(i.kind) && i.bay_id === null))
    .map((i) => {
      const start = Math.max(windowStartMin, (Date.parse(i.start_time) - dayStartMs) / 60_000);
      const end = Math.min(windowEndMin, (Date.parse(i.end_time) - dayStartMs) / 60_000);
      return { ...i, top: start - windowStartMin, height: end - start };
    })
    .filter((i) => i.height > 0)
    .sort((a, b) => a.top - b.top);
}

export interface DayBayHours {
  open_time: string;
  close_time: string;
  weekly_off_days?: number[] | null;
  extended_hours_enabled?: boolean | null;
  extended_open_time?: string | null;
  extended_close_time?: string | null;
  hours_overrides?: BayHoursOverride[] | null;
}

export interface BayDayWindow {
  /** Minutes since midnight; null when the bay is closed all day. */
  open: number | null;
  close: number | null;
  closedReason: string | null;
}

/**
 * The bay's bookable hours on `date` ("yyyy-MM-dd"), using the same rules as
 * the booking pages: day-specific hours, extended hours, weekly off days and holidays.
 */
export function bayDayWindow(
  bay: DayBayHours & { id: string },
  date: string,
  holidays: Array<{ bay_id: string | null; city: string; holiday_date: string; label?: string | null }>,
): BayDayWindow {
  const day = new Date(`${date}T12:00:00`);
  const closedReason = getBlockedReason(day, bay.weekly_off_days ?? [], holidays.map((h) => ({ ...h, label: h.label ?? undefined })), bay.id);
  if (closedReason) return { open: null, close: null, closedReason };
  const window = getBookableWindow(bay, true, day);
  if (!window) return { open: null, close: null, closedReason: "Hours not set" };
  const close = hhmmToMinutes(window.closeTime, 23 * 60);
  return { open: hhmmToMinutes(window.openTime, 6 * 60), close: close === 0 ? 24 * 60 : close, closedReason: null };
}

/** A half-hour slot staff picked on the calendar; date is yyyy-MM-dd, time is HH:mm (city-local). */
export interface CalendarSlot {
  city: string;
  bayId: string;
  date: string;
  time: string;
}

/** True when no booking, payment hold or block-out on the column overlaps the half hour starting at `minute`. */
export function isSlotFree(placed: PlacedItem[], windowStartMin: number, minute: number): boolean {
  return !placed.some((p) => windowStartMin + p.top < minute + SLOT_MINUTES && windowStartMin + p.top + p.height > minute);
}

/** Minutes after midnight as an HH:mm input value, capped at the last half hour of the day. */
export function minutesToInputTime(minutes: number): string {
  const m = Math.min(Math.max(0, minutes), 23 * 60 + 30);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
