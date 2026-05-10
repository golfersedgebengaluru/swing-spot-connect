## Goal

In the Quick Competition admin console, stop the per-row "New attempt" inputs from drifting off-screen as more players are added. Combine player creation and shot entry into a single compact card pinned at the top, and make the bay-screen view and winner certificates pure white so a sponsor logo merges cleanly.

## 1. Quick Competition Console — UI cleanup

File: `src/components/admin/QuickCompetitionConsole.tsx`

**Replace the existing "Add player" card with a single top card titled "Add Player & Score":**

```text
┌─ Add Player & Score ──────────────────────────────────────┐
│  [ Player ▼  +New ]   Distance [ __ ]  Offline [ __ ]     │
│                                                  [ Save ] │
└────────────────────────────────────────────────────────────┘
```

- Single row of controls (wraps on mobile):
  - **Player picker** — `Select` listing existing players + a "+ Add new player…" item that swaps the picker for a name input and an inline confirm button. After creation the new player is auto-selected.
  - **Distance** input (number, unit label from `comp.unit`).
  - **Offline** input (number, same unit).
  - **Save** button — calls `addPlayer` if needed, then `saveAttempt` for the selected player, then clears the distance/offline inputs (keeps the player selected for fast repeat entry).
- Disable Save when no player is selected, when distance/offline are blank/invalid, or when the selected player has hit `comp.max_attempts`.
- Hidden when `isCompleted` is true.
- For paid comps, the player picker is populated from the existing paid `players` list; "+ Add new" is hidden (paid players self-register via the join link, same as today).

**Strip per-row entry from the "Players & attempts" table:**
- Remove the `New attempt ({unitLabel})` and trailing Save column from the table head and body.
- Keep: Player, Best dist., Best offline, Attempts (chips remain click-to-delete).
- Result: the table becomes a clean read-only leaderboard; score entry never moves.

No changes to hooks, mutations, or data model — purely a re-arrangement of existing pieces.

## 2. Bay-screen view — pure white

File: `src/pages/QuickCompetitionPublic.tsx`

- Page background: `bg-stone-50` → `bg-white`.
- Board cards: keep `bg-white` but soften border to `border-stone-100` and drop the off-white "leader" tint to a very light neutral (`bg-stone-50 border-stone-200`) so the page stays uniformly white.
- Header subtitle and muted text stay stone-500 for contrast.
- No structural changes — colour-token swaps only.

## 3. Winner certificates — pure white

File: `supabase/functions/quick-competition-end/index.ts`

- SVG background gradient `#FFFFFF → #F5F1E8` becomes a flat `#FFFFFF` (or near-flat `#FFFFFF → #FAFAFA` for a faint sheen).
- Inner border stroke stays amber/teal but slightly lighter (`opacity=0.35`) so a transparent-PNG sponsor logo sits on a clean white field.
- Text colours unchanged.
- Existing certificates keep their current look until the competition is re-ended (same as before).

## Out of scope

- No DB migrations.
- No edge-function logic changes beyond the SVG palette.
- Leagues admin tab (`AdminLeaguesTab`) is untouched — its Add Player and Score Entry already live on separate tabs.
