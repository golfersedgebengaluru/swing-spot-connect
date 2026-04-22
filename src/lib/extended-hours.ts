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
export function getBookableWindow(
  bay: BayLike | null | undefined,
  includeExtended: boolean,
): BookableWindow | null {
  if (!bay) return null;
  const base = { openTime: bay.open_time, closeTime: bay.close_time, extended: false };

  if (
    !includeExtended ||
    !bay.extended_hours_enabled ||
    !bay.extended_open_time ||
    !bay.extended_close_time
  ) {
    return base;
  }

  const openTime = bay.extended_open_time < bay.open_time ? bay.extended_open_time : bay.open_time;
  const closeTime = bay.extended_close_time > bay.close_time ? bay.extended_close_time : bay.close_time;

  return {
    openTime,
    closeTime,
    extended: openTime !== bay.open_time || closeTime !== bay.close_time,
  };
}
