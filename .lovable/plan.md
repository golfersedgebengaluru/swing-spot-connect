
## Overview

Add a focused **League Management (Lite)** module — separate from the existing complex League Service — that lets admins publish leagues, captains pay and form teams, and members view their team and leaderboard. Reuses existing auth, dashboard shell, and the Razorpay session-booking payment flow.

This module has its **own independent venues** (no link to the app's bays / cities / locations).

---

## 1. Admin: League Venues (independent)

New admin sub-section "League Venues" — a simple flat list, totally independent of the app's existing city/bay/location data.

- Add / rename / deactivate venues (e.g. "North Course", "South Course", "Indoor Studio A").
- Used only by this module. No city scoping, no bay mapping.

---

## 2. Admin: Leagues tab

New admin tab **"Leagues"**. For each league:

- **Name** (only required when *not* multi-location — see below)
- **Active** toggle (controls whether captains can join)
- **Show on landing page** toggle
- **Multi-location league** toggle ← new
  - **OFF (single-location):** admin enters Name + picks **one** venue.
  - **ON (multi-location):** admin **skips the Name field** (the captain names the league instance later when they join, e.g. "Mumbai Saturday Mens"). Admin picks **multiple** venues; the captain will choose one of them.
- **Allowed team sizes** (comma-separated, e.g. `2,4`) — only teams matching one of these sizes can be formed. Captain picks a size at join time.
- **Quick-add venue** button right inside the venue picker so admin can add a new venue without leaving the dialog.

List view shows: name (or "— multi-location —"), status, visibility, venue(s), allowed sizes, # teams.

---

## 3. Pricing tab → new "Leagues" section

Mirrors the existing **Bay Session Pricing** / **Hour Packages** layout. New card: **"League Pricing"**.

- One row per league showing **per-person price** + currency.
- Inline edit of price.
- Deactivating a league hides its row.
- This price is the single source of truth used at captain checkout.

Total at checkout = `per_person_price × team_size_chosen_by_captain`.

---

## 4. Landing page: Join League

- Each active + visible league shows a **"Join League"** card/button.
- For **multi-location** leagues without a fixed name, the card uses a generic title like "Join the [venue list] League".

---

## 5. Captain join flow

After login, captain clicks Join League:

1. (If multi-location) **Pick a venue** from the league's allowed venues.
2. (If multi-location) **Enter the league instance name** (e.g. "Mumbai Saturday Mens") — this becomes the league name shown to members and on leaderboards.
3. **Pick team size** from the league's allowed sizes (e.g. 2 or 4).
4. **Enter team name**.
5. **Add member emails**: `team_size − 1` emails (captain is the +1).
6. **See total fee** = per-person price × team size.
7. **Pay via Razorpay** (same flow as session bookings).
8. Team is **created only after** payment succeeds. Captain + members linked to league + venue.

---

## 6. Member experience

- Member logs in with the email captain used.
- **Dashboard** gets a new card showing: team name, captain, league instance name, venue, teammates, and the **league leaderboard** for that league.
- No payment step for members.
- Unregistered invitees are auto-attached on first login.

---

## 7. Admin views

- Leagues list (with multi-location instances grouped under their parent league)
- Teams grouped by league + venue
- Payments list (amount, captain, status, Razorpay reference)
- Simple leaderboard editor per league instance

---

## Acceptance criteria

- ✅ Independent league venues — no link to app cities/bays/locations.
- ✅ Multi-location league: name skipped at admin creation; captain names the instance.
- ✅ Quick-add venue from inside the league create dialog.
- ✅ Allowed team sizes enforced at captain checkout.
- ✅ League pricing lives in Pricing tab alongside bay/hour-package pricing.
- ✅ Total = per-person price × chosen team size.
- ✅ "Join League" visible only for active + visible leagues.
- ✅ Team created only after successful Razorpay payment.
- ✅ Members see correct team + leaderboard on dashboard.
- ✅ Existing flows (bookings, coaching, existing League Service, finance) unchanged.

---

## Out of scope

- Scoring automation / OCR / simulator hooks (existing League Service handles that).
- Member-initiated team edits (captain or admin only).
- Refund automation beyond admin marking a payment refunded.
- Public leaderboard pages outside the dashboard / admin.

---

## Phased rollout

1. **Phase 1 — Foundations:** independent venues list, leagues table (with multi-location + allowed sizes), league pricing card under Pricing tab, admin Leagues tab, landing-page Join button visibility. No payment yet.
2. **Phase 2 — Captain join + payment:** join wizard (venue → instance name → team size → team → emails), Razorpay checkout, post-payment team creation, member invite linking.
3. **Phase 3 — Member & admin views:** member dashboard card, leaderboard, admin teams-by-league/venue and payments views, simple leaderboard editor.

Each phase ends in a usable, testable state.

---

Approve this and I'll start with Phase 1.
