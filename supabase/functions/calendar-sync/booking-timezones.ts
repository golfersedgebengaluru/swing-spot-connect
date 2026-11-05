type Booking = { bay_id: string | null; city: string };
type BayDisplay = { name: string | null; calendar: string | null };

/** Request-local caches keep history reads to one lookup per bay/calendar. */
export async function enrichBookingTimezones<T extends Booking>(
  bookings: T[],
  resolveBay: (bayId: string | null, city: string) => Promise<BayDisplay>,
  resolveTimezone: (calendar: string) => Promise<string | null>,
) {
  const bays = new Map<string, Promise<BayDisplay>>();
  const calendars = new Map<string, Promise<string | null>>();
  return Promise.all(bookings.map(async (booking) => {
    const key = booking.bay_id ?? `city:${booking.city}`;
    let bayPromise = bays.get(key);
    if (!bayPromise) {
      bayPromise = resolveBay(booking.bay_id, booking.city);
      bays.set(key, bayPromise);
    }
    const bay = await bayPromise;
    let timezone: string | null = null;
    if (bay.calendar) {
      let tzPromise = calendars.get(bay.calendar);
      if (!tzPromise) {
        tzPromise = resolveTimezone(bay.calendar);
        calendars.set(bay.calendar, tzPromise);
      }
      timezone = await tzPromise;
    }
    return { ...booking, bay_name: bay.name, timezone };
  }));
}