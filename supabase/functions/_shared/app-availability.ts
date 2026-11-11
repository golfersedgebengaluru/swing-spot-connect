// App-owned availability: bookings, payment holds, staff block-outs and league
// blocks stored in the database decide which bays are free. Google Calendar is
// only a view copy for cities switched to the app calendar.

export const PAYMENT_HOLD_MINUTES = 10;
/** Short hold that covers the gap between picking a bay and inserting the booking row. */
export const INSERT_HOLD_MINUTES = 2;

export type AvailabilitySource = "google" | "app";

export interface CityBookingMode {
  source: AvailabilitySource;
  timezone: string;
}

export interface BusyRange {
  bay_id: string;
  start_time: string;
  end_time: string;
  kind?: string;
}

export interface SlotResult {
  time: string;
  available: boolean;
  /** Bays free for this half hour; a longer booking needs one bay free in every slot. */
  free_bays: string[];
}

// deno-lint-ignore no-explicit-any
type Admin = any;

export async function cityBookingMode(admin: Admin, city: string | null | undefined): Promise<CityBookingMode> {
  if (!city) return { source: "google", timezone: "Asia/Kolkata" };
  const { data } = await admin
    .from("bay_config")
    .select("availability_source, timezone")
    .eq("city", city)
    .maybeSingle();
  return {
    source: data?.availability_source === "app" ? "app" : "google",
    timezone: data?.timezone || "Asia/Kolkata",
  };
}

export interface BayRecord {
  id: string;
  name: string;
  city: string;
  bay_type: string;
  is_active: boolean;
  member_hours_enabled?: boolean;
  member_hours_rate?: number;
}

export async function loadBay(admin: Admin, bayId: string | null | undefined): Promise<BayRecord | null> {
  if (!bayId) return null;
  const { data } = await admin
    .from("bays")
    .select("id, name, city, bay_type, is_active, member_hours_enabled, member_hours_rate")
    .eq("id", bayId)
    .maybeSingle();
  return (data as BayRecord | null) ?? null;
}

/** Customers book a bay type; staff (exact) book the specific bay they chose. */
export async function candidateBayIds(admin: Admin, bay: BayRecord, exact: boolean): Promise<string[]> {
  if (exact) return [bay.id];
  const { data } = await admin
    .from("bays")
    .select("id")
    .eq("city", bay.city)
    .eq("bay_type", bay.bay_type)
    .eq("is_active", true);
  const ids = ((data ?? []) as { id: string }[]).map((b) => b.id);
  return ids.length ? ids : [bay.id];
}

export async function busyRanges(admin: Admin, city: string, fromIso: string, toIso: string): Promise<BusyRange[]> {
  const { data, error } = await admin.rpc("bay_busy_ranges", { p_city: city, p_from: fromIso, p_to: toIso });
  if (error) throw new Error(`Availability lookup failed: ${error.message}`);
  return (data ?? []) as BusyRange[];
}

/**
 * 30-minute slots from opening time to (close − 60 min). A slot is open when at
 * least one candidate bay has no busy range overlapping it.
 */
export function computeSlots(opts: {
  dayStartMs: number;
  dayEndMs: number;
  nowMs: number;
  adminMode: boolean;
  candidateBayIds: string[];
  busy: BusyRange[];
}): SlotResult[] {
  const step = 30 * 60_000;
  const nowDate = new Date(opts.nowMs);
  const earliest = nowDate.getUTCMinutes() < 30
    ? Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate(), nowDate.getUTCHours(), 30)
    : Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate(), nowDate.getUTCHours() + 1, 0);
  const ranges = opts.busy.map((b) => ({ bay: b.bay_id, start: Date.parse(b.start_time), end: Date.parse(b.end_time) }));
  const slots: SlotResult[] = [];
  for (let t = opts.dayStartMs; t <= opts.dayEndMs - 60 * 60_000; t += step) {
    const end = t + step;
    const freeBays = opts.candidateBayIds.filter(
      (id) => !ranges.some((r) => r.bay === id && t < r.end && end > r.start),
    );
    const isPast = !opts.adminMode && t < earliest;
    slots.push({ time: new Date(t).toISOString(), available: freeBays.length > 0 && !isPast, free_bays: freeBays });
  }
  return slots;
}

export interface Reservation {
  bay_id: string;
  hold_id: string | null;
}

/**
 * Atomically pick a free bay and hold it. `exact` keeps the booking on the
 * preferred bay; otherwise any active bay of the same type may be used.
 */
export async function reserveBay(admin: Admin, opts: {
  bay: BayRecord;
  exact: boolean;
  start: string;
  end: string;
  holdMinutes: number;
  replaceHoldId?: string | null;
}): Promise<Reservation | null> {
  const { data, error } = await admin.rpc("reserve_bay_slot", {
    p_city: opts.bay.city,
    p_bay_type: opts.exact ? null : opts.bay.bay_type,
    p_preferred_bay: opts.bay.id,
    p_start: opts.start,
    p_end: opts.end,
    p_hold_minutes: opts.holdMinutes,
    p_exclude_hold: opts.replaceHoldId ?? null,
  });
  if (error) throw new Error(`Bay reservation failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.bay_id ? { bay_id: row.bay_id, hold_id: row.hold_id ?? null } : null;
}

export async function releaseHold(admin: Admin, holdId: string | null | undefined): Promise<void> {
  if (!holdId) return;
  await admin.from("bay_holds").update({ released_at: new Date().toISOString() }).eq("id", holdId).is("released_at", null);
}

export async function holdForOrder(admin: Admin, orderId: string | null | undefined): Promise<string | null> {
  if (!orderId) return null;
  const { data } = await admin.from("bay_holds").select("id").eq("razorpay_order_id", orderId).maybeSingle();
  return data?.id ?? null;
}

/** Member hours used for a practice booking on this bay, or null when hours cannot be used here. */
export function memberHoursForBay(bay: Pick<BayRecord, "member_hours_enabled" | "member_hours_rate"> | null, durationHours: number): number | null {
  if (bay && bay.member_hours_enabled === false) return null;
  const rate = Number(bay?.member_hours_rate ?? 1) || 1;
  return Math.round(rate * durationHours * 100) / 100;
}

/** Return a captured Razorpay payment when the paid slot can no longer be booked. */
export async function refundRazorpayPayment(admin: Admin, city: string, paymentId: string | null | undefined, notes: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  if (!paymentId || paymentId === "webhook_reconciled") return { ok: false, error: "No payment reference to refund" };
  const { data: gateway } = await admin
    .from("payment_gateways")
    .select("api_key, api_secret")
    .eq("city", city).eq("is_active", true)
    .maybeSingle();
  const apiKey = (gateway?.api_key || "").trim();
  const citySlug = city.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const apiSecret = (Deno.env.get(`RAZORPAY_SECRET_${citySlug}`) || gateway?.api_secret || "").trim();
  if (!apiKey || !apiSecret) return { ok: false, error: "Payment account not configured" };
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}` },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Refund failed (HTTP ${res.status}): ${body.slice(0, 200)}` };
  }
  return { ok: true };
}
