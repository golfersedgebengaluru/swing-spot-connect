// Customer bookings must fall inside the bay's opening hours for that day:
// weekly off days, holidays, day-specific hours and (for members with access)
// extended hours. Mirrors the booking pages (src/lib/extended-hours.ts and
// src/lib/bay-schedule-utils.ts) so the server is never stricter than them.
// Staff bookings skip this check on purpose. No Deno APIs, so tests can import it.

export interface OpeningBay {
  id: string;
  open_time: string;
  close_time: string;
  weekly_off_days?: number[] | null;
  extended_hours_enabled?: boolean | null;
  extended_open_time?: string | null;
  extended_close_time?: string | null;
  hours_overrides?: { day_of_week: number; open_time: string | null; close_time: string | null }[] | null;
}

export interface OpeningHoliday {
  bay_id: string | null;
  holiday_date: string;
  label?: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function validZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** Local calendar date, weekday and minutes since midnight of an instant in the zone. */
export function localDayParts(iso: string, timeZone: string): { date: string; dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validZone(timeZone), hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const [y, m, d] = date.split("-").map(Number);
  return { date, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const toMinutes = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
};

const label = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Bookable window (minutes since local midnight) for a bay on a weekday. */
export function bookableMinutes(bay: OpeningBay, dow: number, includeExtended: boolean): { open: number; close: number } | null {
  const override = (bay.hours_overrides ?? []).find((o) => o.day_of_week === dow);
  let open = toMinutes(override?.open_time) ?? toMinutes(bay.open_time);
  let close = toMinutes(override?.close_time) ?? toMinutes(bay.close_time);
  if (open === null || close === null) return null;
  if (close === 0) close = 24 * 60; // "00:00" closing means midnight
  if (includeExtended && bay.extended_hours_enabled) {
    const extOpen = toMinutes(bay.extended_open_time);
    const extClose = toMinutes(bay.extended_close_time);
    if (extOpen !== null && extClose !== null) {
      open = Math.min(open, extOpen);
      close = Math.max(close, extClose);
    }
  }
  return { open, close };
}

/** Why a customer cannot book this time, or null when it is inside opening hours. */
export function openingHoursError(opts: {
  bay: OpeningBay;
  holidays: OpeningHoliday[];
  startIso: string;
  endIso: string;
  timeZone: string;
  includeExtended: boolean;
}): string | null {
  const start = localDayParts(opts.startIso, opts.timeZone);
  const durationMin = (Date.parse(opts.endIso) - Date.parse(opts.startIso)) / 60_000;
  if (!Number.isFinite(durationMin) || durationMin <= 0) return "Invalid booking time range";
  if ((opts.bay.weekly_off_days ?? []).includes(start.dow)) return `This bay is closed on ${DAY_NAMES[start.dow]}s.`;
  const holiday = opts.holidays.find((h) => h.holiday_date === start.date && (h.bay_id === null || h.bay_id === opts.bay.id));
  if (holiday) return `This bay is closed on ${start.date}${holiday.label ? ` (${holiday.label})` : ""}.`;
  const window = bookableMinutes(opts.bay, start.dow, opts.includeExtended);
  if (!window) return "Opening hours are not set for this bay.";
  const end = start.minutes + durationMin;
  if (start.minutes < window.open || end > window.close) {
    return `Bookings on this day must be between ${label(window.open)} and ${label(window.close)}.`;
  }
  return null;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Loads the bay's hours, that day's holidays and the member's extended-hours access, then checks the time. */
export async function customerOpeningHoursError(admin: Admin, opts: {
  bayId: string;
  startIso: string;
  endIso: string;
  timeZone: string;
  /** Auth user id of the customer; null for guests (no extended hours). */
  userId: string | null;
}): Promise<string | null> {
  const { data: bay, error } = await admin
    .from("bays")
    .select("id, city, open_time, close_time, weekly_off_days, extended_hours_enabled, extended_open_time, extended_close_time, hours_overrides:bay_hours_overrides(day_of_week, open_time, close_time)")
    .eq("id", opts.bayId)
    .maybeSingle();
  if (error) throw new Error(`Opening hours lookup failed: ${error.message}`);
  if (!bay) return "This bay is not available";
  const { date } = localDayParts(opts.startIso, opts.timeZone);
  const [{ data: holidays, error: holidayError }, profileResult] = await Promise.all([
    admin.from("bay_holidays").select("bay_id, holiday_date, label").eq("city", bay.city).eq("holiday_date", date),
    opts.userId
      ? admin.from("profiles").select("extended_hours_access").eq("user_id", opts.userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (holidayError) throw new Error(`Holiday lookup failed: ${holidayError.message}`);
  return openingHoursError({
    bay: bay as OpeningBay,
    holidays: (holidays ?? []) as OpeningHoliday[],
    startIso: opts.startIso,
    endIso: opts.endIso,
    timeZone: opts.timeZone,
    includeExtended: !!profileResult?.data?.extended_hours_access,
  });
}
