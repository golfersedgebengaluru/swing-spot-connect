/** Booking display never inherits the viewer's device timezone. */
export function bookingTimeDisplay(start: string, end: string, timezone?: string | null) {
  let timeZone = timezone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    timeZone = "UTC";
  }
  const date = new Date(start);
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => dateParts.find((p) => p.type === type)?.value ?? "";
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true });
  return {
    date: new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(date),
    mobileDate: new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date),
    csvDate: `${part("year")}-${part("month")}-${part("day")}`,
    timeRange: `${time.format(date)} – ${time.format(new Date(end))}`,
    timezone: timeZone,
    timezoneLabel: timezone && timeZone === timezone ? timezone : "UTC · centre timezone unavailable",
  };
}