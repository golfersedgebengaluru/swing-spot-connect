## Goal
1. Fully delete **Leagues Lite** (code + DB).
2. Wire the homepage **Join League** button to the Legacy league **GE Nat 2026**.
3. Make team sizes + price/person editable from both the **League edit dialog** (Admin → Leagues) and the **Pricing tab** (Admin → Pricing).

## Audit findings
- Homepage `LeaguesLandingSection.tsx` renders Lite cards (the screenshot card → broken `/leagues-lite/join/:id` route → **404 source**) and Legacy cards (working `JoinLegacyLeagueDialog` → city/location → team name/size → Razorpay).
- `leagues_lite` table has 0 rows; Lite code/admin tab/edge actions still exist.
- `GE Nat 2026` row: `show_on_landing=false`, `allowed_team_sizes={}`, `price_per_person=0`, `currency=INR`, `status=active`. Won't pass the `legacy-register-team-intent` guard until updated.
- Legacy `LeagueDialog` already exposes `show_on_landing`, `price_per_person` and `allowed_team_sizes` fields — so config-at-league-level already exists for show_on_landing/price; we need to confirm/expand the team-sizes input there.
- `AdminPricingTab` currently has a Leagues Lite price card (`useUpdateLeagueLitePrice`) — needs replacement with a Legacy league price+team-sizes card.

## Plan

### 1. Delete Leagues Lite — code
- Delete `src/hooks/useLeaguesLite.ts` and `src/hooks/__tests__/useLeaguesLite.test.ts`.
- Delete `src/components/admin/AdminLeaguesLiteTab.tsx`.
- Remove the Lite section + `useLeaguesLite` import from `LeaguesLandingSection.tsx`. Section now renders **legacy only**.
- Remove any sidebar/nav entry mounting `AdminLeaguesLiteTab` (audit `AdminSidebar.tsx`/`Admin.tsx`).
- Remove the Lite price card from `AdminPricingTab.tsx`.
- Strip Lite actions from `supabase/functions/league-service/index.ts` and any Lite branches in `razorpay-webhook/index.ts`.

### 2. Delete Leagues Lite — database (migration)
Drop tables (CASCADE):
- `public.leagues_lite_venues`
- `public.league_lite_venues`
- `public.leagues_lite`

### 3. Make GE Nat 2026 landing-eligible (data update via insert tool)
```
UPDATE leagues SET show_on_landing=true,
                   allowed_team_sizes='{2,4}',
                   price_per_person=2750,
                   currency='INR'
WHERE id='352a9e5c-427c-40a2-8e9c-d450c9eeaf51';
```

### 4. Editable from Admin → Leagues (League edit dialog)
Confirm and, where missing, ensure the legacy `LeagueDialog` in `AdminLeaguesTab.tsx` allows editing:
- `show_on_landing` (toggle)
- `price_per_person` + `currency`
- `allowed_team_sizes` (comma-separated input → parsed to int[])
Already wired to `update_league` in `league-service`.

### 5. Editable from Admin → Pricing tab
Replace the deleted Lite card with a **Legacy League Pricing** card:
- Lists every legacy league (`useLeagues`) with editable `price_per_person`, `currency`, and `allowed_team_sizes`.
- Saves via existing `update_league` action in `league-service`.

### 6. Verify
- `bun test` for affected hooks/components.
- Manually click Join League on home → dialog opens, no 404, captain can sign in, pick city/location, name team, pick size 2 or 4, pay `team_size × 2750 INR` via Razorpay.

## Out of scope
- Member-email invites / roster finalization (deferred).
- Any change to Legacy league business logic.
