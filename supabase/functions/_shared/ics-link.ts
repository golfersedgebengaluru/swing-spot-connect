// Lifetime of the signed "Add to calendar" link we email with a booking.
// The link only needs to work until the session is over, so it expires one
// day after the booking ends (at least one hour, at most `maxDays`). Pure
// module so it can be unit-tested from Vitest.

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

export function icsLinkLifetimeSeconds(endIso: string, now: Date = new Date(), maxDays = 90): number {
  const end = new Date(endIso).getTime();
  const max = maxDays * DAY;
  if (!Number.isFinite(end)) return DAY;
  const seconds = Math.ceil((end - now.getTime()) / 1000) + DAY;
  return Math.min(max, Math.max(HOUR, seconds));
}
