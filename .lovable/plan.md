## Admin Round Reveal — display-only enhancements

Purely cosmetic. No scoring logic changes.

### 1. Per-location Par rows at the top
Today there's a single "Par" row using the majority par. Instead:
- Group players by their resolved location/par set.
- Show one "Par — <Location name>" row per distinct par used in this round (e.g. one row for GEC Royal Birkdale Par 72, another for GEB location Par 71).
- Round Par badge stays as-is (majority), or we show each location's total at the row end.

### 2. Team groups (unchanged)
Keep the current team grouping and colour-coding exactly as it is now.

### 3. Team best-ball summary row per team
At the end of each team block, add one extra row in the same team colour showing:
- Hole-by-hole team best-ball score (per-hole min across teammates)
- Team Gross
- Hidden Σ
- Team Peoria HC (average of member HCs, matching the player-facing view)
- Team Net
- Team Pts (best-ball Stableford)

This mirrors the "Team (Best Ball)" row already used in the player view — we're just repeating that pattern once per team inside the admin grouped table.

### Scope
- Only file touched: `src/components/league/RevealedRoundScores.tsx`.
- No backend, no hook, no scoring changes. Uses data already fetched.
