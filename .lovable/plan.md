# Coaching Module: Structured Focuses & Drills

## What I'd build

Five new tables, one shared taxonomy, one snapshot column, one new picker component, one admin tab section. Nothing existing is redesigned or deleted.

### Data model (minimal, 5 tables)

```text
coaching_categories (id, name unique, active)
coaching_focuses    (id, name unique, category_id, active)
coaching_drills     (id, name unique, category_id, objective, instructions,
                     recommended_reps, video_url, active)
focus_drills        (focus_id, drill_id)            -- PK(focus_id, drill_id)
session_drills      (id, session_id, drill_id, focus_id, coach_note<=500,
                     snapshot jsonb)                 -- one row per drill per session
```

Plus `coaching_sessions.focus_ids uuid[]` + `focus_snapshot jsonb` (or a thin
`session_focuses` join if you prefer strict relational — see note below).

Why this shape:
- Shared taxonomy is one table, referenced by both libraries — no drift, no two free-text fields.
- `active` flag = soft deactivation. Nothing is ever deleted; past sessions keep their FK.
- **Snapshot rule** handled by a single `jsonb` column per session-drill row holding
  `{name, objective, instructions, recommended_reps, focus_name}` frozen at save time.
  One column, written once, never updated — this is the cheapest possible way to
  guarantee historic sessions never mutate when the library is edited. Reads render
  the snapshot; the FK exists only for filtering/analytics.
- The unique per-drill note lives on `session_drills`, so a drill selected under two
  focuses is naturally one row (unique index on `(session_id, drill_id)`), which
  satisfies the "appears once, one note" rule with no client-side dedupe logic.

Immutability: RLS grants coaches `INSERT` only on `session_drills` (no `UPDATE`/`DELETE`),
so read-only history is enforced in the database, not in the UI. Admin/site_admin get
read-all; students get read-own via the existing dual-key profile resolution.

### The one legacy field

`coaching_sessions.drills` (free text) is **kept but retired**: no longer written, still
rendered on historic sessions under a "Legacy notes" heading. Dropping it would rewrite
history, which the doc forbids. This is the only debt I'd deliberately keep, and it costs
one read-only conditional block.

### UI (3 surfaces)

1. **`FocusDrillPicker`** — one new component replacing the `Drills` VoiceTextarea in
   `SessionFormDialog`. Searchable focus multi-select (Command palette, touch-friendly),
   each chosen focus expands its mapped drills as large tappable checkbox rows, selected
   drills collect into a summary list with a 500-char note textarea each. Empty state per
   focus with zero mappings. Mobile-first: full-width rows, ≥44px targets, no hover
   affordances, sheet-style on small screens.
2. **Admin → Coaching → Libraries** — one tab with three sub-sections (Categories,
   Focuses, Drills) plus mapping. Mapping is edited inline from the Focus row (a drill
   multi-select), not a separate screen — one fewer surface, same capability.
3. **Log views** — the three existing session lists render focuses/drills from the
   snapshot; stacked cards on mobile (no tables), filters as per role matrix.

### Seed data

One migration inserts the categories, focuses, the 25 drills and their mappings via
`ON CONFLICT DO NOTHING` on the unique names, so it's idempotent and re-runnable.
**I need the supplied 25-drill list** — I'll seed the focuses named in the doc and leave
drills to your file rather than inventing content.

## Where I'd differ from the doc

1. **Skip the separate Focus↔Drill mapping screen.** Manage mappings inline on the Focus
   row. Same many-to-many, one screen instead of two.
2. **Drop `focus_id` denormalisation on `session_drills`?** No — keep it, but store it as
   "the focus the coach picked this drill under" for reporting; uniqueness stays on
   `(session_id, drill_id)`. This is the smallest thing that makes both rules hold.
3. **Snapshot as jsonb, not shadow tables.** Some builds snapshot into parallel
   `session_focus_snapshots`/`session_drill_snapshots` tables. That doubles the schema for
   data that is never queried by field. One frozen `jsonb` column is strictly less code.
4. **`focus_ids uuid[]` vs a `session_focuses` table.** A focus with no drills still needs
   recording, so focuses can't live only inside `session_drills`. My preference is the
   thin `session_focuses` join table (queryable, filterable by admin) over an array
   column — arrays make the admin "filter by Focus" query awkward. That's 6 tables total.
5. **Video URL validation** in the form only (zod `url()`), not a DB check constraint —
   constraint churn isn't worth it.
6. **Future-ready without building AI:** the schema is already the right shape. I'd add
   nothing speculative — no empty `ai_recommendations` table, no unused columns. When
   simulator data arrives it joins on `session_id`/`user_id` like everything else.

## What I would *not* do

- No redesign of the coaching page, session card, or styling.
- No touching bookings, profiles, coaches, or revenue.
- No edit/delete path for past sessions (doc explicitly defers it).
- No skill-level field.

## Sequencing

1. Migration: taxonomy + libraries + mapping + session join tables, RLS + GRANTs.
2. Admin libraries UI (desktop-first).
3. Seed migration (needs your drill list).
4. `FocusDrillPicker` in the session form; stop writing legacy `drills`.
5. Log views render snapshots; role filters.
6. Tests: snapshot immutability after library edit, dedupe of a drill under two focuses,
   insert-only RLS, focus-with-no-drills save, note length cap. Then a Playwright pass on
   a 390px viewport for the full flow.

## One question before I start

Can you send the 25-drill list with categories and Focus mappings? Everything else I can
build without it; the seed migration is the only blocked piece.
