/**
 * Reporting period boundaries — ONE place that converts a calendar date range
 * (as typed by an admin, e.g. 2026-08-01 → 2026-08-31) into UTC instants.
 *
 * Why this exists: `revenue_transactions.created_at` is a UTC timestamp, while
 * the business thinks in local business days. Appending "T23:59:59.999Z" (as the
 * revenue reports used to do) silently shifted every period by the timezone
 * offset, so a payment taken at 02:00 IST on 1 Sep landed in the August report.
 *
 * Rules:
 *  - Ranges are half-open: [from, toExclusive). No 23:59:59 fudging, so rows
 *    landing in the final millisecond of a day are never lost or double-counted.
 *  - Boundaries are computed in the business timezone, then expressed in UTC.
 */

/** Business timezone used for all financial reporting periods. */
export const REPORT_TIME_ZONE = "Asia/Kolkata";

/** Offset (minutes) of `tz` from UTC at the given instant. Positive = ahead of UTC. */
function tzOffsetMinutes(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    parts.year,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    (parts.hour ?? 0) % 24,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return (asUtc - instant.getTime()) / 60000;
}

/** Parse a `yyyy-MM-dd` string. Throws on anything else so bad input can't skew a report. */
function parseDay(day: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) throw new Error(`Invalid report date "${day}" (expected yyyy-MM-dd)`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** UTC instant of local midnight (start of day) for `day` in `tz`. */
export function zonedDayStartUtc(day: string, tz: string = REPORT_TIME_ZONE): Date {
  const { y, m, d } = parseDay(day);
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // Two passes: the offset itself depends on the instant (DST transitions).
  let ts = naive - tzOffsetMinutes(new Date(naive), tz) * 60000;
  ts = naive - tzOffsetMinutes(new Date(ts), tz) * 60000;
  return new Date(ts);
}

/**
 * Half-open UTC range covering the inclusive business-day range
 * `startDate`..`endDate`. `toExclusive` is local midnight of the day AFTER
 * `endDate`.
 */
export function reportRangeToUtc(
  startDate: string,
  endDate: string,
  tz: string = REPORT_TIME_ZONE,
): { fromUtc: string; toExclusiveUtc: string } {
  const from = zonedDayStartUtc(startDate, tz);
  const { y, m, d } = parseDay(endDate);
  const dayAfter = new Date(Date.UTC(y, m - 1, d + 1));
  const nextDay = `${dayAfter.getUTCFullYear()}-${String(dayAfter.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dayAfter.getUTCDate(),
  ).padStart(2, "0")}`;
  const to = zonedDayStartUtc(nextDay, tz);
  return { fromUtc: from.toISOString(), toExclusiveUtc: to.toISOString() };
}

/**
 * Inclusive business-day range for reads on a DATE column
 * (`revenue_transactions.revenue_date`).
 *
 * Revenue is counted on its business date — the invoice date when an invoice
 * exists — not on the instant the row was written. A back-dated invoice entered
 * in September for 8 August therefore belongs to August. Because the column is
 * a plain date there is no timezone to fudge: the filter is `[from, to]`.
 */
export function reportDayRange(
  startDate: string,
  endDate: string,
): { fromDay: string; toDay: string } {
  parseDay(startDate);
  parseDay(endDate);
  return { fromDay: startDate.trim(), toDay: endDate.trim() };
}

/** Inclusive business-day range for the month containing `instant`. */
export function zonedMonthDays(
  instant: Date,
  tz: string = REPORT_TIME_ZONE,
): { fromDay: string; toDay: string } {
  const [y, m] = zonedDayString(instant, tz).split("-");
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  return {
    fromDay: `${y}-${m}-01`,
    toDay: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** `yyyy-MM-dd` for an instant, as seen in `tz`. */
export function zonedDayString(instant: Date, tz: string = REPORT_TIME_ZONE): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(instant);
}

/** Half-open UTC range covering the business month containing `instant`. */
export function zonedMonthRangeUtc(
  instant: Date,
  tz: string = REPORT_TIME_ZONE,
): { fromUtc: string; toExclusiveUtc: string } {
  const [y, m] = zonedDayString(instant, tz).split("-");
  const first = `${y}-${m}-01`;
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  const last = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  return reportRangeToUtc(first, last, tz);
}
