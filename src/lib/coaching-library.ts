/**
 * Pure helpers for the structured coaching library (focuses + drills).
 *
 * Session focus/drill rows are INSERT-ONLY history: every row carries a frozen
 * `snapshot` of the library item as it read at save time, so later edits to the
 * library never rewrite a past session. All rendering reads the snapshot; the
 * foreign keys exist only for filtering.
 */

export const COACH_NOTE_MAX = 500;

export interface DrillRef {
  id: string;
  name: string;
  objective?: string | null;
  instructions?: string | null;
  recommended_reps?: string | null;
  video_url?: string | null;
  category_name?: string | null;
}

export interface FocusRef {
  id: string;
  name: string;
  category_name?: string | null;
}

export type LibraryFocus = FocusRef & { drills: DrillRef[] };

export interface DrillSelection {
  drillId: string;
  focusId: string;
  note?: string | null;
}

export interface SessionSelection {
  focusIds: string[];
  drills: DrillSelection[];
}

export interface FocusSnapshot {
  name: string;
  category: string | null;
}

export interface DrillSnapshot {
  name: string;
  objective: string | null;
  instructions: string | null;
  recommended_reps: string | null;
  category: string | null;
  focus_name: string | null;
  video_url: string | null;
}

export function focusSnapshot(focus: FocusRef): FocusSnapshot {
  return { name: focus.name, category: focus.category_name ?? null };
}

export function drillSnapshot(drill: DrillRef, focus?: FocusRef | null): DrillSnapshot {
  return {
    name: drill.name,
    objective: drill.objective ?? null,
    instructions: drill.instructions ?? null,
    recommended_reps: drill.recommended_reps ?? null,
    category: drill.category_name ?? null,
    focus_name: focus?.name ?? null,
    video_url: drill.video_url ?? null,
  };
}

/** A note is valid when it is empty or within the 500-character cap. */
export function isNoteValid(note?: string | null): boolean {
  return (note ?? "").trim().length <= COACH_NOTE_MAX;
}

/** Trim a note; empty becomes null so the DB stays clean. */
export function normalizeNote(note?: string | null): string | null {
  const t = (note ?? "").trim();
  return t.length ? t : null;
}

export interface SessionFocusRow {
  session_id: string;
  focus_id: string;
  snapshot: FocusSnapshot;
}

export interface SessionDrillRow {
  session_id: string;
  drill_id: string;
  focus_id: string | null;
  coach_note: string | null;
  snapshot: DrillSnapshot;
}

/**
 * Turn a picker selection into the exact rows to insert.
 * A drill reachable from two focuses yields ONE row (first pick wins), matching
 * the `UNIQUE(session_id, drill_id)` guarantee in the database.
 */
export function buildSessionRows(
  sessionId: string,
  selection: SessionSelection,
  library: LibraryFocus[]
): { focusRows: SessionFocusRow[]; drillRows: SessionDrillRow[] } {
  const focusById = new Map(library.map((f) => [f.id, f]));
  const drillById = new Map<string, DrillRef>();
  library.forEach((f) => f.drills.forEach((d) => drillById.set(d.id, d)));

  const focusRows: SessionFocusRow[] = [];
  const seenFocus = new Set<string>();
  for (const focusId of selection.focusIds) {
    const focus = focusById.get(focusId);
    if (!focus || seenFocus.has(focusId)) continue;
    seenFocus.add(focusId);
    focusRows.push({ session_id: sessionId, focus_id: focusId, snapshot: focusSnapshot(focus) });
  }

  const drillRows: SessionDrillRow[] = [];
  const seenDrill = new Set<string>();
  for (const sel of selection.drills) {
    const drill = drillById.get(sel.drillId);
    if (!drill || seenDrill.has(sel.drillId)) continue;
    if (!isNoteValid(sel.note)) {
      throw new Error(`Note for "${drill.name}" exceeds ${COACH_NOTE_MAX} characters.`);
    }
    seenDrill.add(sel.drillId);
    const focus = sel.focusId ? focusById.get(sel.focusId) ?? null : null;
    drillRows.push({
      session_id: sessionId,
      drill_id: sel.drillId,
      focus_id: focus?.id ?? null,
      coach_note: normalizeNote(sel.note),
      snapshot: drillSnapshot(drill, focus),
    });
  }

  return { focusRows, drillRows };
}

/** Shape a raw nested query row into a LibraryFocus (active items only). */
export function mapLibraryFocus(row: any): LibraryFocus {
  const drills: DrillRef[] = (row.focus_drills ?? [])
    .map((fd: any) => fd.coaching_drills)
    .filter((d: any) => d && d.active !== false)
    .map((d: any) => ({
      id: d.id,
      name: d.name,
      objective: d.objective ?? null,
      instructions: d.instructions ?? null,
      recommended_reps: d.recommended_reps ?? null,
      video_url: d.video_url ?? null,
      category_name: d.coaching_categories?.name ?? null,
    }))
    .sort((a: DrillRef, b: DrillRef) => a.name.localeCompare(b.name));

  return {
    id: row.id,
    name: row.name,
    category_name: row.coaching_categories?.name ?? null,
    drills,
  };
}
