export type MemberFilter = "all" | "pre-registered" | "registered" | "member";

export function isMemberRecord(memberHoursId: string | null | undefined) {
  return Boolean(memberHoursId);
}

export function classifyUser(userId: string | null | undefined, memberHoursId: string | null | undefined): Exclude<MemberFilter, "all"> {
  if (isMemberRecord(memberHoursId)) return "member";
  return userId ? "registered" : "pre-registered";
}

export function matchesMemberFilter(
  filter: MemberFilter,
  userId: string | null | undefined,
  memberHoursId: string | null | undefined,
) {
  return filter === "all" || classifyUser(userId, memberHoursId) === filter;
}

export type HoursTone = "green" | "amber" | "red";

export function getHoursTone(remaining: number): HoursTone {
  if (remaining <= 1) return "red";
  if (remaining <= 3) return "amber";
  return "green";
}

export function identityKeys(profile: { id: string; user_id?: string | null }) {
  return Array.from(new Set([profile.id, profile.user_id].filter((value): value is string => Boolean(value))));
}

export function isVisitBooking(booking: {
  status?: string | null;
  start_time: string;
  billing_status?: string | null;
  invoice_id?: string | null;
}) {
  if (booking.status !== "confirmed" || new Date(booking.start_time).getTime() > Date.now()) return false;
  return booking.billing_status === "deferred" || booking.billing_status === "invoiced" || Boolean(booking.invoice_id);
}

export function countDistinctVisits(
  bookings: Array<{ id: string; parent_booking_id?: string | null } & Parameters<typeof isVisitBooking>[0]>,
  paidBookingIds: ReadonlySet<string> = new Set(),
) {
  return new Set(
    bookings
      .filter((booking) => isVisitBooking(booking) || (
        booking.status === "confirmed" &&
        new Date(booking.start_time).getTime() <= Date.now() &&
        paidBookingIds.has(booking.id)
      ))
      .map((booking) => booking.parent_booking_id ?? booking.id),
  ).size;
}

export function shouldShowMemberSection(rows: unknown[] | null | undefined) {
  return Boolean(rows?.length);
}
