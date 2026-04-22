/**
 * Extended hours utility — merges a bay's normal opening window with its
 * optional "extended hours" window, gated by a per-user access flag.
 *
 * Extended hours allow privileged users to book outside the normal
 * open/close window (e.g. early morning or late night).
 */

export interface BayLike {
  open_time: string;
  close_time: string;
  extended_open_time?: string | null;
  extended_close_time?: string | null;
  extended_hours_enabled?: boolean | null;
}

export interface BookableWindow {
  openTime: string;
  closeTime: string;
  extended: boolean;
}

/**
 * Returns the effective bookable window for a bay.
 *
 * - If the bay has no extended hours configured, or the bay-level toggle is
 *   off, or the caller does not have access, the normal window is returned.
 * - Otherwise the window is widened to the union of normal + extended.
 *
 * Times are HH:MM[:SS] strings; lexicographic comparison is safe.
 */
/**
 * Normalize a time string to `HH:MM`.
 *
 * The DB stores `bays.open_time`/`close_time` without seconds (`"09:00"`) but
 * `extended_open_time`/`extended_close_time` arrive as `"06:00:00"` (Postgres
 * `time` rendered with seconds). The downstream `list_slots` edge function
 * appends `:00` for seconds — feeding it `"06:00:00"` produces `"06:00:00:00"`
 * which `Intl.DateTimeFormat` rejects with `RangeError: Invalid time value`,
 * blanking out availability. Trimming to `HH:MM` keeps the contract stable
 * regardless of which column the value originated from.
 */
const toHHMM = (t: string): string => t.slice(0, 5);

export function getBookableWindow(
  bay: BayLike | null | undefined,
  includeExtended: boolean,
): BookableWindow | null {
  if (!bay) return null;
  const normalOpen = toHHMM(bay.open_time);
  const normalClose = toHHMM(bay.close_time);
  const base = { openTime: normalOpen, closeTime: normalClose, extended: false };

  if (
    !includeExtended ||
    !bay.extended_hours_enabled ||
    !bay.extended_open_time ||
    !bay.extended_close_time
  ) {
    return base;
  }

  const extOpen = toHHMM(bay.extended_open_time);
  const extClose = toHHMM(bay.extended_close_time);
  const openTime = extOpen < normalOpen ? extOpen : normalOpen;
  const closeTime = extClose > normalClose ? extClose : normalClose;

  return {
    openTime,
    closeTime,
    extended: openTime !== normalOpen || closeTime !== normalClose,
  };
}
