## Cleanup & Configurable Grievance Officer

### Problem
1. The Privacy Policy page (`/page/privacy`) has a chunk of raw markdown (`--- ## Update — 23 May 2026 (v2.1) ...`) appended after section 14. Since the page renders HTML, the markdown is shown literally — looks broken.
2. Section "14. Contact" duplicates info that already lives in the `contact` page (`/page/contact`). It should not be hardcoded inside the Privacy Policy.
3. Grievance Officer name + email are hardcoded in 4 places (`Grievance.tsx`, `PrivacyDataCard.tsx`, `Footer.tsx`, `account-deletion-request` edge function) and inside the privacy HTML — making them impossible to change without a code edit.

### Fix

**1. Clean the Privacy Policy content (DB migration, content update only):**
- Remove the trailing `---` markdown block and the duplicated section 14.
- Convert the v2.1 update note into proper HTML and place it as a short "Update — 23 May 2026 (v2.1)" block at the top, before section 1.
- Replace section 14 with a single sentence: *"See our [Contact page](/page/contact) for how to reach our Grievance Officer and general team."*

**2. Make Grievance Officer configurable via `admin_config`:**
- Seed two keys: `grievance_officer_name` (default "Grievance Officer, Teetime Ventures Pvt Ltd") and `grievance_officer_email` (default "grievance@golfers-edge.in").
- Add a new `useGrievanceOfficer()` hook that reads both keys with TanStack Query.
- Wire it into:
  - `src/pages/Grievance.tsx` — the "Grievance Officer Contact" card.
  - `src/components/PrivacyDataCard.tsx` — wherever the email is shown.
  - `src/components/layout/Footer.tsx` — if displayed.
- Edge function `account-deletion-request` will read `grievance_officer_email` from `admin_config` at request time (instead of a hardcoded string).

**3. Settings panel in the Grievances admin tab:**
- Add a collapsible "Settings" card at the top of `AdminGrievancesTab.tsx` with two inputs (Name, Email) and a Save button.
- On save, upsert both keys into `admin_config` and invalidate the `useGrievanceOfficer` query.

### Out of scope
- No changes to grievance ticket schema, RLS, retention, cookie banner, parental consent, or nominee flow.
- Contact page itself is already managed via Page Settings — left untouched.

### Files
- Migration: clean `page_content` row for `privacy`; seed two `admin_config` keys.
- New: `src/hooks/useGrievanceOfficer.ts`.
- Edit: `AdminGrievancesTab.tsx`, `Grievance.tsx`, `PrivacyDataCard.tsx`, `Footer.tsx`, `supabase/functions/account-deletion-request/index.ts`.
