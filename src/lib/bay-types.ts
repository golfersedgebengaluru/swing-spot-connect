// Customers in app-calendar cities book a bay type, not a specific bay; the
// server picks any free bay of that type. Staff screens keep listing bays.

export type BayType = "standard" | "bunker";

export interface BayChoiceSource {
  id: string;
  name: string;
  bay_type?: string | null;
  sort_order?: number | null;
}

export interface BayChoice<T extends BayChoiceSource = BayChoiceSource> {
  /** The bay sent to the server; it stands for every bay of its type. */
  bay: T;
  bayType: BayType;
  label: string;
  bayCount: number;
}

export const BAY_TYPE_LABELS: Record<BayType, string> = {
  standard: "Standard bay",
  bunker: "Bunker Bay",
};

export function bayTypeOf(bay: { bay_type?: string | null } | null | undefined): BayType {
  return bay?.bay_type === "bunker" ? "bunker" : "standard";
}

/**
 * One choice per bay type for app-calendar cities; one choice per bay otherwise.
 * A type with a single bay keeps that bay's own name.
 */
export function bayChoices<T extends BayChoiceSource>(bays: T[], groupByType: boolean): BayChoice<T>[] {
  const ordered = [...bays].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
  if (!groupByType) {
    return ordered.map((bay) => ({ bay, bayType: bayTypeOf(bay), label: bay.name, bayCount: 1 }));
  }
  const byType = new Map<BayType, T[]>();
  for (const bay of ordered) {
    const type = bayTypeOf(bay);
    byType.set(type, [...(byType.get(type) ?? []), bay]);
  }
  return [...byType.entries()].map(([bayType, group]) => ({
    bay: group[0],
    bayType,
    label: group.length === 1 ? group[0].name : BAY_TYPE_LABELS[bayType],
    bayCount: group.length,
  }));
}

/** Price row for the bay's type; rows saved before bay types existed count as Standard. */
export function priceRowFor<P extends { city: string; day_type: string; session_type: string; bay_type?: string | null }>(
  rows: P[] | null | undefined,
  city: string,
  bayType: BayType,
  dayType: string,
  matches: (sessionType: string) => boolean,
): P | null {
  return (rows ?? []).find(
    (p) => p.city === city && (p.bay_type ?? "standard") === bayType && p.day_type === dayType && matches(p.session_type),
  ) ?? null;
}

/** Member hours a practice booking uses on this bay, or null when hours can't be used there. */
export function practiceHoursFor(
  bay: { member_hours_enabled?: boolean | null; member_hours_rate?: number | string | null } | null | undefined,
  durationMinutes: number,
): number | null {
  if (bay?.member_hours_enabled === false) return null;
  const rate = Number(bay?.member_hours_rate ?? 1) || 1;
  return Math.round(rate * (durationMinutes / 60) * 100) / 100;
}
