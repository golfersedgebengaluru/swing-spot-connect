## Quick Competition — Longest Drive (and Straightest Drive)

A lightweight, "no-login-needed" mini event the admin can spin up in under a minute and display on a bay screen. Two winners always come out of one session: **Longest Drive** and **Straightest Drive**.

### Where it lives

- A new **+ Quick Competition** button appears directly below **+ New League** on the admin **Leagues** tab.
- Quick Competitions are listed in their own small section on the same screen ("Active" and "Past"), separate from full leagues so they don't clutter the league list.

### Setup (3 fields, takes ~10 seconds)

A simple dialog with:
1. **Name** — pre-filled as `Longest Drive · {today's date}`, editable.
2. **Unit** — Metres or Yards (radio).
3. **Attempts per player** — 1, 2, 3, or Unlimited.
4. *(Optional)* **Sponsor** — toggle on/off; if on, upload a sponsor logo (used on the winner cards).

Tap **Start** → competition is live immediately. No course, no holes, no handicap, no team setup.

### Adding players (anytime)

- Admin types a name and taps **Add**. That's it — no email, no account, no invite.
- Players can be added **before or after** the competition starts, even mid-event.
- A name can be edited or removed before any score is entered for them.

### Recording attempts

For each player the admin sees one row with two inputs:
- **Distance** (in the chosen unit)
- **Offline** (how far left/right of the centre line, in the same unit — always positive)

Tap **Save Attempt**. If multiple attempts are allowed, the system automatically keeps:
- the **best (longest) distance**, and
- the **best (lowest) offline**
…for that player. Admin always sees the full attempt history per player and can delete a bad entry (e.g. mishit, wrong player).

### The live leaderboard (the bay-screen view)

- A dedicated, **public, no-login** URL that can be opened on a TV/bay screen.
- Shows **both leaderboards side by side at all times** — never toggled, never hidden:
  - **Longest Drive** — sorted highest distance first.
  - **Straightest Drive** — sorted lowest offline first.
- Updates **in real time** the instant the admin saves an attempt (server pushes the update — not just a client refresh).
- Big, bold, screen-friendly typography; current leader highlighted in each column.

### Finishing & winner cards

- Admin taps **End Competition**. The system locks scoring and declares **two winners** — one per category (ties broken by earliest qualifying attempt).
- Two **shareable result cards** are generated as images on the server (so they look identical everywhere, on WhatsApp, Instagram, etc.):
  - Competition name + date + venue
  - Winner name, winning distance / offline, unit
  - Sponsor logo (only if sponsorship was enabled at setup)
- Admin can **download** or **copy share link** for each card. Cards are also visible on the public leaderboard page after the event ends.

### Audit & scoping

- Every add-player, attempt, edit, delete, and end-competition action is logged with timestamp and the admin who did it.
- Each Quick Competition is scoped to a single **franchisee/city** — admins from other cities never see it; site admins see all.

### Refinements added on top of your brief

A few small upgrades that make this much more usable on a real range night:

1. **Sponsor toggle at setup** — keeps the result card clean when there's no sponsor, branded when there is.
2. **Per-attempt audit + delete** — mishits happen; admin needs an undo without losing the player's other attempts.
3. **Tie-breaker rule** — earliest qualifying attempt wins ties. Predictable and fair, no admin judgement call needed.
4. **Public leaderboard URL with QR code** — admin can show a QR code on the bay screen so participants can pull up the live leaderboard on their own phones too.
5. **"End at time X" optional auto-close** — admin can optionally set an end time (e.g. 9:30 PM) so the competition closes itself and winner cards generate automatically — useful when the admin is running the bay and forgets.
6. **Re-open within 15 min** — if the admin ends it by accident, they can re-open within 15 minutes; after that it's locked.
7. **Bay-screen mode** — the public leaderboard has a "TV mode" (full-screen, no chrome, larger fonts, auto-refresh) toggled by a button on the page itself.

### What this does NOT do (intentionally, to stay "quick")

- No payments, no entry fees, no prizes ledger.
- No player profiles, no loyalty points, no league standings impact.
- No course/hole data, no handicap, no Peoria — pure single-shot contest.

### Approval needed before I build

Please confirm:
- Both leaderboards on **one** screen side by side (not two tabs)? ✅ as briefed
- Sponsor logo: **upload per competition** (not pulled from a global sponsors library)? — I'm assuming **yes, per competition** to keep it simple.
- Public leaderboard URL: **anyone with the link** can view (no login)? — assuming **yes**, as briefed.
- Are the 7 refinements above OK to include, or should I drop any of them for v1?
