// Pure checkout pricing rules shared by the order-creation function and tests.
// Prices are always derived from server-side records; callers never choose amounts.

export interface CouponCheck {
  valid: boolean;
  discount_type?: string | null;
  discount_value?: number | null;
}

/** Same rule the checkout screens display: percentage rounded to paise, fixed clamped to total. */
export function couponDiscount(coupon: CouponCheck | null | undefined, orderTotal: number): number {
  if (!coupon?.valid || !coupon.discount_type || !coupon.discount_value) return 0;
  if (coupon.discount_type === "percentage") {
    return Math.round((orderTotal * coupon.discount_value) / 100 * 100) / 100;
  }
  return Math.min(coupon.discount_value, orderTotal);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Weekday/weekend pricing follows the centre-local calendar date chosen for the booking. */
export function dayTypeForDate(date: string): "weekday" | "weekend" | null {
  if (!DATE_RE.test(date)) return null;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (Number.isNaN(day)) return null;
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

/**
 * The booking's local date must be the start instant's date in some real
 * timezone (UTC-12 … UTC+14), so a caller cannot pick a cheaper day's rate.
 */
export function isLocalDateOfStart(date: string, startIso: string): boolean {
  const start = Date.parse(startIso);
  if (!DATE_RE.test(date) || Number.isNaN(start)) return false;
  const earliest = new Date(start - 12 * 3600_000).toISOString().slice(0, 10);
  const latest = new Date(start + 14 * 3600_000).toISOString().slice(0, 10);
  return date >= earliest && date <= latest;
}

/** Duration in whole minutes between two instants, or null when the range is not bookable. */
export function bookingDurationMinutes(startIso: string, endIso: string): number | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const minutes = (end - start) / 60_000;
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) return null;
  return minutes;
}

export function bookingCharge(pricePerHour: number, minutes: number, discount: number) {
  const total = pricePerHour * (minutes / 60);
  return { total, discount, amount: Math.max(0, total - discount) };
}
