/**
 * Membership revenue recognition — the single place that spreads a membership
 * sale over its validity period.
 *
 * Rules (owner-approved):
 *  - Full calendar months inside the term earn equal shares; the first and last
 *    months are prorated by the days of the term that fall in them.
 *  - The amount spread is the same amount the revenue report counts for the sale.
 *  - On cancellation, what was earned in earlier months stays; everything not yet
 *    earned, minus the refund, is recognised in the cancellation month (it can be
 *    negative when the refund exceeds the unearned part).
 *  - Invoices and GST are untouched: this only changes when revenue is reported.
 *
 * Dates are business days ("YYYY-MM-DD") and all arithmetic is in UTC days, so
 * no device timezone can move a share into another month.
 */

export interface MembershipTerm {
  id: string;
  user_id: string | null;
  city: string;
  label?: string | null;
  product_id: string | null;
  revenue_transaction_id: string | null;
  refund_transaction_id: string | null;
  invoice_line_item_id: string | null;
  sold_on: string;
  amount: number | string;
  starts_on: string;
  ends_on: string;
  status: "active" | "cancelled" | "void" | string;
  cancelled_on: string | null;
  refund_amount: number | string | null;
}

export interface RecognitionSlice {
  from: string;
  to: string;
  amount: number;
}

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

function dayMs(day: string): number {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function msDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function monthStartMs(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function nextMonthStartMs(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}
const daysInclusive = (fromMs: number, toMs: number) => Math.round((toMs - fromMs) / DAY_MS) + 1;

/** Last day of a term: the day before the same date N months later (or that month's end). Mirrors the database. */
export function membershipEndDate(start: string, months: number): string {
  const s = new Date(dayMs(start));
  const target = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + months, 1));
  const lastOfTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = s.getUTCDate();
  if (lastOfTarget < day) return msDay(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), lastOfTarget));
  return msDay(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day) - DAY_MS);
}

/** Earned amount per calendar month of the term, before any cancellation. */
function baseSchedule(m: MembershipTerm): RecognitionSlice[] {
  const amount = num(m.amount);
  const start = dayMs(m.starts_on);
  const end = dayMs(m.ends_on);
  if (end < start) return [{ from: m.starts_on, to: m.starts_on, amount: round2(amount) }];

  const pieces: { from: number; to: number; units: number }[] = [];
  for (let ms = monthStartMs(start); ms <= end; ms = nextMonthStartMs(ms)) {
    const monthEnd = nextMonthStartMs(ms) - DAY_MS;
    const from = Math.max(ms, start);
    const to = Math.min(monthEnd, end);
    pieces.push({ from, to, units: daysInclusive(from, to) / daysInclusive(ms, monthEnd) });
  }
  const totalUnits = pieces.reduce((s, p) => s + p.units, 0);
  const slices = pieces.map((p) => ({ from: msDay(p.from), to: msDay(p.to), amount: round2((amount * p.units) / totalUnits) }));
  const residual = round2(amount - slices.reduce((s, x) => s + x.amount, 0));
  if (residual !== 0) slices[slices.length - 1].amount = round2(slices[slices.length - 1].amount + residual);
  return slices;
}

/** The full recognition schedule, including the cancellation month when cancelled. */
export function membershipSchedule(m: MembershipTerm): RecognitionSlice[] {
  if (m.status === "void") return [];
  const slices = baseSchedule(m);
  if (m.status !== "cancelled" || !m.cancelled_on) return slices;

  const cancel = dayMs(m.cancelled_on);
  const cancelMonth = monthStartMs(cancel);
  const before = slices.filter((s) => dayMs(s.to) < cancelMonth);
  const earnedBefore = before.reduce((s, x) => s + x.amount, 0);
  const kept = num(m.amount) - num(m.refund_amount);
  const from = Math.min(Math.max(cancelMonth, dayMs(m.starts_on)), cancel);
  return [...before, { from: msDay(from), to: m.cancelled_on, amount: round2(kept - earnedBefore) }];
}

/** Revenue this membership earns between two business days (inclusive). */
export function recognizedInRange(m: MembershipTerm, fromDay: string, toDay: string): number {
  const rangeFrom = dayMs(fromDay);
  const rangeTo = dayMs(toDay);
  let total = 0;
  for (const s of membershipSchedule(m)) {
    const sFrom = dayMs(s.from);
    const sTo = dayMs(s.to);
    const from = Math.max(sFrom, rangeFrom);
    const to = Math.min(sTo, rangeTo);
    if (to < from) continue;
    total += (s.amount * daysInclusive(from, to)) / daysInclusive(sFrom, sTo);
  }
  return round2(total);
}

/** Money received for this membership that is not yet earned at the end of `day`. */
export function deferredAt(m: MembershipTerm, day: string): number {
  if (m.status === "void" || dayMs(m.sold_on) > dayMs(day)) return 0;
  const refunded = m.status === "cancelled" && m.cancelled_on && dayMs(m.cancelled_on) <= dayMs(day) ? num(m.refund_amount) : 0;
  const earned = recognizedInRange(m, "1900-01-01", day);
  return round2(num(m.amount) - refunded - earned);
}

export interface RecognizableRow {
  id: string;
  amount: number | string;
  transaction_type: string;
  [key: string]: unknown;
}

export interface RecognitionResult<T extends RecognizableRow> {
  /** Period rows with membership sales and their cancellation refunds replaced by earned amounts. */
  rows: (T | RecognizableRow)[];
  /** Invoice lines that are memberships; their value is in the earned rows instead. */
  membershipLineIds: Set<string>;
  /** Membership revenue earned in the period. */
  earned: number;
  /** Received for memberships but not yet earned at the end of the period. */
  deferred: number;
}

export const MEMBERSHIP_EARNED_TYPE = "membership";
export const isEarnedMembershipRow = (id: string) => id.startsWith("membership:");

/**
 * Replace membership cash in a period's confirmed revenue rows with what the
 * memberships earned in that period. Other lines on the same invoice keep their
 * value; nothing is counted twice and nothing is dropped.
 */
export function applyMembershipRecognition<T extends RecognizableRow>(
  rows: T[],
  memberships: MembershipTerm[],
  fromDay: string,
  toDay: string,
): RecognitionResult<T> {
  const live = memberships.filter((m) => m.status !== "void");
  const membershipShareBySale = new Map<string, number>();
  const refundIds = new Set<string>();
  const membershipLineIds = new Set<string>();
  for (const m of live) {
    if (m.revenue_transaction_id) {
      membershipShareBySale.set(m.revenue_transaction_id, (membershipShareBySale.get(m.revenue_transaction_id) ?? 0) + num(m.amount));
    }
    if (m.refund_transaction_id) refundIds.add(m.refund_transaction_id);
    if (m.invoice_line_item_id) membershipLineIds.add(m.invoice_line_item_id);
  }

  const out: (T | RecognizableRow)[] = [];
  for (const row of rows) {
    if (refundIds.has(row.id)) continue;
    const share = membershipShareBySale.get(row.id);
    if (share === undefined) { out.push(row); continue; }
    const rest = round2(num(row.amount) - share);
    if (Math.abs(rest) >= 0.005) out.push({ ...row, amount: rest });
  }

  let earned = 0;
  let deferred = 0;
  for (const m of live) {
    const amount = recognizedInRange(m, fromDay, toDay);
    deferred += deferredAt(m, toDay);
    if (amount === 0) continue;
    earned += amount;
    out.push({
      id: `membership:${m.id}`,
      amount,
      transaction_type: MEMBERSHIP_EARNED_TYPE,
      status: "confirmed",
      user_id: m.user_id,
      product_id: m.product_id,
      revenue_date: toDay,
    });
  }
  return { rows: out, membershipLineIds, earned: round2(earned), deferred: round2(deferred) };
}
