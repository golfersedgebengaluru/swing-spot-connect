## Goal
Bring the new league system's Cities & Locations setup into the Legacy League's `+ New League` flow so cities/locations are defined at league creation time. Keep the same data model (`league_cities` + `league_locations`) so Phase 2 captain registration can reuse it.

## Scope
- Frontend only changes to the legacy `+ New League` dialog and the league row.
- No schema changes — `league_cities` / `league_locations` already exist and are keyed by `league_id`.
- No business-logic / pricing changes beyond what already shipped.

## Changes

### 1. `+ New League` dialog (`src/components/admin/AdminLeaguesTab.tsx` → `LeagueDialog`)
- Add a new section **"Cities & Locations"** below the existing fields.
- Local in-memory editor (no DB writes yet) supporting:
  - Add city (name input + button)
  - Per-city: expand to add one or more locations (name, optional address)
  - Remove city / remove location
- Validation: at least one city required (configurable — default required for create, optional for edit).

### 2. Create flow
- After `useCreateLeague` returns the new `league.id`:
  - Sequentially call `useCreateLeagueCity(leagueId)` for each city, then `useCreateLeagueLocation(cityId)` for its locations.
  - Show a single combined toast on success; rollback message on partial failure (leave league created, surface error so admin can retry in edit mode).

### 3. Edit flow
- When opening `LeagueDialog` in edit mode, prefetch existing cities + locations via `useLeagueCities(leagueId)` and the locations hook, hydrate the editor state.
- On save: diff against original — create new, delete removed, update renamed entries via existing hooks/edge endpoints.

### 4. Remove the embedded panel from the league row
- Delete the `<CitiesLocationsPanel ... />` block (line ~1642 of `AdminLeaguesTab.tsx`) and its import. Cities/locations are now managed only via the dialog (cleaner row, matches the "screen above" pattern the user asked for earlier).
- Keep `CitiesLocationsPanel.tsx` file in place (still used by the new multi-city league admin) — only the legacy embed is removed.

### 5. Row summary
- In the legacy league row header, show a compact badge like `3 cities · 7 locations` (computed from `useLeagueCities`) so admins still see the setup at a glance without expanding.

## Out of scope (Phase 2)
- Captain registration wizard, team-to-location assignment, Razorpay flow, member-facing join — these will consume the cities/locations created here.

## Files to edit
- `src/components/admin/AdminLeaguesTab.tsx` — extend `LeagueDialog`, post-create city/location persistence, edit hydration, remove embedded panel, add row badges.
- (Reuse) `src/hooks/useLeagues.ts` hooks: `useLeagueCities`, `useCreateLeagueCity`, `useUpdateLeagueCity`, `useDeleteLeagueCity`, `useLeagueLocations`, `useCreateLeagueLocation`, `useUpdateLeagueLocation`, `useDeleteLeagueLocation` (verify each exists; add thin wrappers only if missing — no edge function changes needed since endpoints already exist).

Approve to proceed.
