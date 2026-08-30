# Coaching Module: Structured Focuses & Drills

## Seed data received (5 drills)

**Categories (4):** Full Swing, Ball Striking, Short Game, Putting

**Focuses (12):** Ball Contact, Tempo, Rotation, Balance, Low Point, Impact,
Chipping, Distance Control, Feel, Putting, Start Line, Face Control

**Drills + mappings:** 9-to-3 Half Swing (Full Swing → Ball Contact, Tempo,
Rotation, Balance); Tee-Behind-the-Ball (Ball Striking → Ball Contact, Low Point,
Impact); Feet-Together Swing (Full Swing → Balance, Tempo, Ball Contact);
Landing-Spot Chipping (Short Game → Chipping, Distance Control, Feel);
Gate Putting (Putting → Putting, Start Line, Face Control).

One note: two focus names ("Putting", "Chipping") share names with categories.
They're separate tables so nothing breaks — flagging only so it's deliberate.

## Schema (6 tables, one migration)

```text
coaching_categories  (name unique, active)
coaching_focuses     (name unique, category_id, active)
coaching_drills      (name unique, category_id, objective, instructions,
                      recommended_reps, video_url, active)
focus_drills         (focus_id, drill_id, PK both)        -- no dup pairs possible
session_focuses      (session_id, focus_id, snapshot jsonb)  -- one per picked focus
session_drills       (session_id, drill_id, focus_id, coach_note text <=500,
                      snapshot jsonb, UNIQUE(session_id, drill_id))
```

- `snapshot` jsonb on both session tables freezes `{name, objective, instructions,
  recommended_reps, category}` at save time, written once, never updated. All
  history views render snapshots; FKs exist only for filtering/admin. This is the
  doc's core integrity rule with the least code — no shadow tables.
- `UNIQUE(session_id, drill_id)` enforces "a drill under two focuses appears once
  with one note" in the DB, not in client dedupe code.
- `active` flags = soft deactivation; nothing is ever deleted.
- `coaching_sessions.drills` (legacy free text) is kept but retired — still rendered
  on historic sessions as "Legacy notes", never written again. Existing rows untouched.

## RLS (enforced in DB, not UI)

- Libraries (categories/focuses/drills/mapping): read = all signed-in (coaches need
  the picker); write = admin/site_admin via existing `has_role`.
- `session_focuses` / `session_drills`: INSERT only for the session's coach
  (no UPDATE/DELETE for anyone — read-only history per the doc); SELECT for admin/
  site_admin, the owning coach, and the student (dual-key profile resolution).
- Full GRANT + RLS in the same migration per platform rules.

## UI (3 surfaces)

1. **`FocusDrillPicker`** (new component) replaces the free-text Drills field in
   `SessionFormDialog`. Searchable focus multi-select; each picked focus expands its
   mapped drills as full-width tappable rows; selected drills collect into a summary
   with one ≤500-char note each. Focus required to save; drills/notes optional;
   clear empty state for a focus with no mapped drills. Mobile-first: ≥44px targets,
   no hover interactions, no horizontal scroll. Note entry keeps voice dictation by
   using the existing `VoiceTextarea` for notes.
2. **Admin → Coaching → Libraries**: one tab, three sections (Categories, Focuses,
   Drills). Focus↔Drill mapping edited inline on the Focus row as a drill
   multi-select — no separate mapping screen. Desktop-first is fine per the doc.
3. **Log views** (Admin/Coach/Student): session cards render focuses/drills/notes
   from snapshots; stacked cards on mobile; role filters per the doc's matrix
   (admin: coach/golfer/focus/drill/category/date; coach: golfer/focus/date;
   student: read-only own).

## Hooks

One new `src/hooks/useCoachingLibrary.ts` (admin CRUD + picker queries) and a small
extension of `useCoaching.ts` (save session writes session_focuses + session_drills
with snapshots; reads join snapshots). No other hooks touched.

## Differences from the doc (deliberate, lower debt)

- Inline mapping on the Focus row instead of a separate mapping screen.
- Snapshot as a jsonb column, not parallel snapshot tables.
- `session_focuses` join table rather than an array column — makes the admin
  "filter by Focus" query a normal indexed lookup.
- Video URL validated in the form (zod `url()`), not a DB check constraint.
- No speculative AI/simulator tables — schema already joins on session/user ids
  when that data arrives.

## Sequencing & tests

1. Migration: 6 tables + GRANTs + RLS + indexes. (Approval card first.)
2. Seed: 4 categories, 12 focuses, 5 drills, mappings — idempotent inserts.
3. Admin Libraries tab.
4. `FocusDrillPicker` in session form; stop writing legacy `drills`.
5. Log views render snapshots; role filters.
6. Tests: snapshot unchanged after library edit; drill under two focuses saves one
   row/one note; coach can't UPDATE session rows (insert-only); focus-with-no-drills
   saves; note >500 rejected; deactivated focus hidden from picker but historic
   sessions unchanged.
7. Playwright pass at 390px: full Select Focus → Drill → Note → Save flow.

## Out of scope

No redesign of coaching pages/styling; no changes to bookings, profiles, revenue;
no edit/delete of past sessions; no AI/simulator build.
