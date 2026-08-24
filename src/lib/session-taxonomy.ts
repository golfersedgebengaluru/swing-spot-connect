/**
 * Booking session taxonomy.
 *
 * `bookings.session_type` historically crammed two different questions into one
 * column:
 *
 *   1. WHAT was sold      → bay rental ("practice") or coaching  → revenue category
 *   2. HOW it was priced  → individual / couple / group          → rate tier
 *
 * Stored values are therefore a mix: `practice`, `coaching`, `individual`,
 * `couple`, `group` (and legacy `coaching_60` on the pricing side). Rather than
 * rewriting 800+ historic rows — which would touch every edge function string
 * comparison for zero functional gain — the legacy mapping lives HERE, in one
 * place, and every call site asks this module instead of matching strings.
 *
 * Display note: the service `practice` is labelled "Bay Rental" in the UI. The
 * stored key stays `practice`.
 */

export type BookingService = "practice" | "coaching";
export type RateTier = "individual" | "couple" | "group";

export const SERVICE_LABELS: Record<BookingService, string> = {
  practice: "Bay Rental",
  coaching: "Coaching",
};

export const TIER_LABELS: Record<RateTier, string> = {
  individual: "Individual",
  couple: "Couple",
  group: "Group",
};

/** What was sold. Anything coaching-ish → coaching; everything else is bay rental. */
export function resolveService(sessionType?: string | null): BookingService {
  const key = (sessionType ?? "").trim().toLowerCase();
  return key.includes("coach") ? "coaching" : "practice";
}

/** How it was priced. Legacy service-only values default to the individual tier. */
export function resolveTier(sessionType?: string | null): RateTier {
  const key = (sessionType ?? "").trim().toLowerCase();
  if (key === "couple") return "couple";
  if (key === "group") return "group";
  return "individual";
}

/** Human label for any stored session_type, e.g. "Bay Rental · Couple". */
export function sessionTypeLabel(sessionType?: string | null): string {
  const service = resolveService(sessionType);
  const tier = resolveTier(sessionType);
  return service === "coaching"
    ? SERVICE_LABELS.coaching
    : `${SERVICE_LABELS.practice} · ${TIER_LABELS[tier]}`;
}

export interface PricingRowLike {
  city: string;
  day_type: string;
  session_type: string;
}

/**
 * Resolve the pricing row for a booking's stored session_type.
 *
 * Preference order (first match wins):
 *   1. exact stored key                     (`practice`, `couple`, …)
 *   2. the tier key                         (`individual` / `couple` / `group`)
 *   3. any coaching key when coaching       (`coaching`, `coaching_60`, …)
 */
export function findPricingRow<T extends PricingRowLike>(
  rows: T[],
  city: string,
  dayType: string,
  sessionType?: string | null,
): T | undefined {
  const scoped = rows.filter((r) => r.city === city && r.day_type === dayType);
  const stored = (sessionType ?? "").trim().toLowerCase();
  const service = resolveService(sessionType);
  const tier = resolveTier(sessionType);

  if (service === "coaching") {
    return (
      scoped.find((r) => r.session_type === stored) ??
      scoped.find((r) => resolveService(r.session_type) === "coaching")
    );
  }
  return (
    scoped.find((r) => r.session_type === stored) ??
    scoped.find((r) => r.session_type === tier) ??
    scoped.find((r) => r.session_type === "practice")
  );
}
