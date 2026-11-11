// Pure helpers for the staff all-bays day view. Times are always shown in the
// centre's timezone, never the viewer's device timezone.

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
    .filter((i) => i.bay_id === bayId || (i.kind === "blockout" && i.bay_id === null))
    .map((i) => {
      const start = Math.max(windowStartMin, (Date.parse(i.start_time) - dayStartMs) / 60_000);
      const end = Math.min(windowEndMin, (Date.parse(i.end_time) - dayStartMs) / 60_000);
      return { ...i, top: start - windowStartMin, height: end - start };
    })
    .filter((i) => i.height > 0)
    .sort((a, b) => a.top - b.top);
}
