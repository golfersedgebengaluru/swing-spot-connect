## Modified Stableford Points Layer

A new points layer sits on top of today's Best Ball scoring. Nothing about how strokes, Peoria handicap, net scores, or team best-ball totals are calculated will change — those numbers stay exactly as they are today.

### What gets added

**1. A shared points conversion**
One reusable function that turns each hole's strokes vs. par into Modified Stableford points:

- Albatross or better → +8
- Eagle → +5
- Birdie → +2
- Par → 0
- Bogey → −1
- Double bogey or worse → −2 (capped)

Used everywhere points are shown so the rule lives in one place.

**2. Leaderboard ranks by points**
The league leaderboard (both player view and admin view) will rank by **total Stableford points, highest first**. Existing stroke totals, net scores, and vs-par stay visible as the secondary detail — nothing is removed. Teams are scored by applying the conversion to the team's best-ball result per hole, then summed.

**3. Round breakdown shows both**
For each round, you'll see the points earned as the headline number, with the existing stroke result right next to it (e.g. **+14 pts** — Birdie, Par, +2…).

**4. Closed-round / Peoria reveal view**
The hole-by-hole table gains a small **Pts** column per hole and a points total per player, alongside the existing strokes and Peoria columns.

### What does NOT change
- Best Ball stroke calculation
- Peoria handicap math and reveal flow
- Fairness factor for teams
- Score entry (admin or player)
- Database tables or any existing API fields

Fully additive and backward-compatible — every number you see today will still be there, with points layered on top.
