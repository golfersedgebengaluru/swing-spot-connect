// Pure slot and member-hours rules shared by edge functions and tests (no Deno APIs).

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

/** Member hours used for a practice booking on this bay, or null when hours cannot be used here. */
export function memberHoursForBay(bay: { member_hours_enabled?: boolean; member_hours_rate?: number } | null, durationHours: number): number | null {
  if (bay && bay.member_hours_enabled === false) return null;
  const rate = Number(bay?.member_hours_rate ?? 1) || 1;
  return Math.round(rate * durationHours * 100) / 100;
}
