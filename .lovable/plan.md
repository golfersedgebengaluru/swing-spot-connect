## Goal
Teams (and individuals) that have not submitted scores for every completed round should always rank **below** those that have — regardless of their score. Within each group (qualified vs. non-qualified), existing ranking rules continue to apply.

## Rules
1. **Qualified** = has a submitted score for **every round that is completed / in-progress** in the league (i.e. `rounds_played == total_active_rounds`).
2. **Non-qualified** = missed one or more of those rounds.
3. Sort order:
   - Qualified group first, sorted by existing rule (final_score ascending, tie-breakers unchanged).
   - Non-qualified group second, sorted by existing rule among themselves.
4. Ranks are assigned continuously across both groups (1, 2, 3, …) so users still see a single ordered list.
5. Non-qualified rows get a visual marker (small "Incomplete" pill or muted styling) so it's obvious why they're below.
6. A note is displayed above the leaderboard:
   > *Scores for all rounds must be submitted to qualify to win. Teams/players with missing rounds are ranked below all fully-qualified entries.*

## Where the change happens

### Backend (source of truth)
`supabase/functions/league-service/index.ts`
- In the leaderboard builder (`screen-leaderboard` action) and in `buildFinalStandings`:
  - Compute `totalActiveRounds` = count of rounds with status `in_progress` or `completed` (skip `draft`/future).
  - For each entry, compute `qualified = rounds_played >= totalActiveRounds`.
  - Sort with qualified-first, then existing comparator.
  - Include `qualified: boolean` and `total_active_rounds: number` on each entry, plus top-level `total_active_rounds` in the response.

### Frontend
- `src/pages/LeagueScreen.tsx` (bay screen): show note + "Incomplete" pill / muted row for `qualified === false`.
- Members leaderboard view (same component that renders `LeaderboardEntry`): same note + pill.
- Admin leaderboard view: same treatment so all three surfaces stay consistent.

### Types
- `src/types/league.ts` — add `qualified?: boolean` and `total_active_rounds?: number` to `LeaderboardEntry` and the leaderboard response.

## Edge cases
- Before any round is completed (`totalActiveRounds === 0`), everyone is qualified — no split, no pills, no note-triggered behavior (note still shown as informational).
- Season snapshot / finalized standings use the same qualified-first ordering so awards can't go to a team that missed a round.
- Team qualification is based on **the team's** submitted rounds, not individual members (matches how `rounds_played` is currently computed for teams).

## Test coverage
- Add a case in `src/hooks/__tests__/useLeaderboard.test.ts` and the league-service test file verifying:
  - A team with score −20 but only 1/2 rounds ranks below a team with +5 across 2/2 rounds.
  - Rank numbers are continuous across the boundary.
  - `qualified` flag is set correctly.

No database schema changes required.