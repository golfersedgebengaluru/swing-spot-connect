## P1 DPDP Bundle — Scope

Implementing the 4 highest-risk P1 items from the previous list. Other P1s (granular consent, sub-processor page, DPIA doc, breach workflow, audit export, consent withdrawal toggle, correction form, reconsent email automation) are deferred.

---

### 1. Cookie / Tracking Banner

- New table `cookie_consents` (`id, user_id?, session_id, necessary, analytics, marketing, ip, user_agent, policy_version, created_at`)
- New component `CookieBanner.tsx` shown to all visitors until a choice is made (localStorage flag `cookie_consent_v1`)
- 3 buttons: **Accept all**, **Reject all** (same prominence), **Manage** (opens dialog with analytics + marketing toggles; "Necessary" locked on)
- Writes a row to `cookie_consents` on choice + sets localStorage
- Mounted globally in `App.tsx` alongside `ReconsentBanner`
- New `/page/cookies` short policy page (seeded into `page_content`)

### 2. Verifiable Parental Consent (minors <18)

- Add `date_of_birth` and `parent_email`, `parent_consent_status`, `parent_consent_token`, `parent_consent_at` columns to `profiles`
- DOB capture: add to `Auth.tsx` signup (required) and `PhoneCompletionModal` for existing users without DOB
- On signup, if computed age <18:
  - Block marketing consent (force `granted=false` for marketing_email / marketing_whatsapp regardless of checkbox)
  - Set `parent_consent_status='pending'`, collect `parent_email`
  - New edge function `request-parental-consent` sends email with signed token URL → `/parental-consent/:token`
  - New page `ParentalConsent.tsx` lets parent approve/reject; updates status
- New helper `is_minor(_user_id)` SQL function + RLS guards: minors blocked from posting in community, leaderboard opt-out by default
- Profile page shows minor badge + parental status

### 3. Retention Auto-Purge Jobs

- New edge function `retention-purge` (service-role; idempotent)
  - Anonymises bookings >8 years old (clear notes, set user_id null where FK allows; keep financial totals)
  - Purges `consent_log` rows >7 years past account closure (joined via `deletion_requests`)
  - Deletes guest `profiles` with no activity for 2 years (no bookings, no orders, no league entries)
  - Logs each run into new `retention_runs` table (`id, run_at, rows_anonymised, rows_purged_consent, rows_purged_guests, duration_ms, status, error`)
- Schedule via pg_cron weekly (Sunday 03:00 IST) — uses `supabase--insert` per the scheduled-jobs guide
- Admin can view last 20 runs in new `AdminRetentionTab.tsx` (under Compliance section in admin sidebar)

### 4. Nomination (Right of Nomination, DPDP §13)

- New table `nominations` (`id, user_id, nominee_name, nominee_email, nominee_phone, relationship, notes, status, created_at, updated_at, revoked_at`)
  - One active nomination per user (partial unique on `status='active'`)
- RLS: user can CRUD own; admins can read all
- New component `NominationCard.tsx` in `Profile.tsx`: form to add/edit/revoke nominee
- New edge function `nominee-invoke` (placeholder admin workflow): accepts death-certificate upload + nominee identity; opens a grievance ticket of category `nomination_invocation` for admin manual review
- No automated data transfer — manual admin process; DPDP-compliant disclosure

---

### Technical sections

#### New tables
```sql
create table cookie_consents (...);
create table retention_runs (...);
create table nominations (...);
-- profiles: add date_of_birth, parent_email, parent_consent_status, parent_consent_token, parent_consent_at
```

#### New helper functions
- `public.is_minor(_user_id uuid) returns boolean`
- `public.age_years(dob date) returns int`

#### New edge functions
- `request-parental-consent` — sends signed token email
- `confirm-parental-consent` — validates token, updates status
- `retention-purge` — service-role purge job
- `nominee-invoke` — opens grievance for nominee data access

#### Frontend additions
- `src/components/CookieBanner.tsx` (mounted in `App.tsx`)
- `src/components/NominationCard.tsx` (in `Profile.tsx`)
- `src/pages/ParentalConsent.tsx` (public route `/parental-consent/:token`)
- `src/components/admin/AdminRetentionTab.tsx`
- `Auth.tsx` — DOB field; minor branch
- `PhoneCompletionModal.tsx` — DOB capture if missing
- `Profile.tsx` — minor badge + parental status display
- Footer — add "Cookie Policy" link

#### Policy updates
- Bump `policy_versions` privacy → 2.1 with cookie + minor + nomination clauses
- Seed `/page/cookies` content

---

### Build order
1. Migration: 3 new tables + profile columns + helper functions + RLS
2. Cookie banner UI + edge-function-free local write
3. Parental consent: edge functions + DOB capture + Parent page
4. Retention purge edge function + pg_cron schedule + admin tab
5. Nomination card + table CRUD + nominee-invoke function
6. Policy content bump to v2.1
7. Footer + routing wiring

### Out of scope (deferred to P2)
- Granular per-purpose consent on every action
- Sub-processor public list page
- DPIA internal doc
- Breach notification admin workflow
- Audit log regulator export
- Reconsent automation email blast
- Correction request form
