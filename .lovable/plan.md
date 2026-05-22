## Part 1 — Audit of your current Privacy Policy

Your existing policy (`/page/privacy`, last updated 15/03/2026) is a **decent pre-DPDP policy but not DPDP-compliant**. Here's exactly what's missing / wrong:

### What's OK
- Lists categories of data collected
- Lists purposes of use
- Names a contact email
- Mentions children, cookies, security, policy updates

### What's missing for DPDP (must add)
1. **Data Fiduciary identity not formal** — must say "Teetime Ventures Pvt Ltd, [registered address], CIN: [____] is the Data Fiduciary under the DPDP Act, 2023"
2. **No Grievance Officer named** — DPDP §8(10) mandates a named officer + email + response SLA
3. **No DPO / Contact Person** — required for cross-border / significant processing
4. **No legal basis** stated — every purpose must cite consent or "legitimate use" (DPDP §7)
5. **No retention periods** — must say how long each data category is kept
6. **No data principal rights enumerated** — DPDP §11–14: access, correction, erasure, grievance, nomination (death)
7. **Children's clause is wrong** — DPDP says <18 (not 13) and requires *verifiable parental consent*, not just "supervision"
8. **No cross-border transfer disclosure** — your data hits Lovable Cloud / Supabase (EU/US) — must disclose
9. **No mention of automated decision-making** (loyalty tiers, pricing) — DPDP §11(1)(b)
10. **No withdrawal-of-consent mechanism** — must be as easy as giving it
11. **No breach notification commitment** to data principals
12. **"We may share with partners"** is too vague — DPDP requires named sub-processor categories
13. **No DPDP-specific language** — the act isn't even mentioned by name
14. **No franchisee/multi-tenant disclosure** — once you franchise (Option A), franchisees become joint/independent Data Fiduciaries for their city — policy must say so

**Verdict:** Rewrite required, not patch. I'll generate a DPDP-compliant replacement as part of P0.

---

## Part 2 — P0 DPDP Bundle (what I'll build)

Six features, all server-enforced, minimal UI surface.

### 1. Signup consent capture + audit log
- New table `consent_log` (immutable, append-only)
  - `id, user_id, consent_type, granted, policy_version, ip, user_agent, created_at`
  - `consent_type` enum: `tos`, `privacy`, `marketing_email`, `marketing_whatsapp`
- Add **2 checkboxes** to `src/pages/Auth.tsx` signup form:
  - [Required] "I agree to the Terms of Service and Privacy Policy v{X}"
  - [Optional] "Send me marketing emails and offers"
- Submit blocks until required consent is ticked
- On signup success, write 2–3 rows to `consent_log`
- For existing users: re-consent banner on next login (`needs_reconsent` check against latest policy version)

### 2. Policy versioning
- New table `policy_versions` (`slug, version, content, published_at, published_by`)
- When `/page/privacy` or `/page/terms` is edited in admin, a new version row is written automatically
- Public page shows current version + "Last updated" + link to "Previous versions" archive
- `consent_log.policy_version` references this so we can prove *what* the user agreed to

### 3. Self-serve data export (DSAR — Right to Access)
- New "Privacy & Data" section on `src/pages/Profile.tsx`
- "Download my data" button → calls edge function `dsar-export`
- Edge function gathers ALL rows across ~30 tables keyed to user_id (bookings, points, hours, transactions, league entries, coaching, gifts, consent_log, etc.)
- Returns a single ZIP with one JSON file per table + a `README.txt` explaining structure
- Rate-limited to 1 export / 24 hrs / user
- Logged to `dsar_requests` table for audit

### 4. Self-serve account deletion (Right to Erasure)
- "Delete my account" button on Profile → confirmation dialog (type email to confirm)
- Calls edge function `account-deletion-request`
- **Soft-delete model** (not hard delete — you need financial records for GST/income tax 8 yrs):
  - Profile anonymized: `display_name='Deleted User'`, `email=NULL`, `phone=NULL`, `avatar=NULL`
  - `auth.users` row deleted (login killed)
  - Bookings/transactions retained but de-identified (replace user_id with NULL on non-FK columns; keep FK for ledger integrity)
  - Community posts: option to "delete content" or "keep as anonymous"
- Logs to `deletion_requests` table with reason + timestamp
- Policy discloses 30-day retention + which data is kept for legal reasons

### 5. Grievance Officer form + workflow
- New table `grievance_tickets` (`id, user_id, category, subject, body, status, response, created_at, resolved_at`)
- Public form at `/grievance` (or contact page) — no login required (per DPDP)
- Admin tab "Grievances" in admin panel: list, respond, mark resolved
- Email notification to Grievance Officer on new ticket + auto-ack email to complainant
- 30-day SLA tracking with overdue badge

### 6. DPDP-compliant Privacy Policy + Terms rewrite
- Replace `/page/privacy` content with a full DPDP-compliant template (covers all 14 gaps above)
- Add new `/page/terms` if missing
- Include franchisee/multi-tenant clause so the same policy works after Option A franchising
- Set initial `policy_versions` row to v2.0

---

## Technical sections

### New tables (migration)
```sql
-- consent_log (append-only)
create table public.consent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  consent_type text not null check (consent_type in ('tos','privacy','marketing_email','marketing_whatsapp')),
  granted boolean not null,
  policy_version text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
-- RLS: user can SELECT own rows; only service role inserts. No UPDATE/DELETE policies.

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version text not null,
  content text not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id),
  unique(slug, version)
);
-- RLS: SELECT public; INSERT admin only.

create table public.dsar_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  file_size_bytes int
);

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  reason text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'pending' check (status in ('pending','completed','cancelled'))
);

create table public.grievance_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  name text,
  category text not null,
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  response text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  due_at timestamptz generated always as (created_at + interval '30 days') stored
);
-- RLS: INSERT public (anyone can file); SELECT own + admins; UPDATE admins only.
```

### Edge functions
- `dsar-export` — gathers user data into ZIP, returns signed URL
- `account-deletion-request` — performs soft-delete + anonymization
- Existing `send-notification-email` reused for grievance ack + officer alert

### Frontend additions
- `src/pages/Auth.tsx` — 2 checkboxes + validation
- `src/pages/Profile.tsx` — new "Privacy & Data" card with 3 buttons
- `src/pages/Grievance.tsx` — public form (new route)
- `src/components/admin/GrievancesTab.tsx` — admin queue
- `src/components/ReconsentBanner.tsx` — shown when policy version changes
- Footer link added for "Grievance Officer"

### Out of scope (P1 — for later)
- Granular per-purpose consent on every action
- Verifiable parental consent flow
- Cookie banner (we use functional-only cookies; light banner sufficient — P1)
- DPIA documentation
- Sub-processor public list page

---

## Build order
1. Migration (5 tables + RLS + helper functions)
2. Privacy + Terms content rewrite (write to `page_content` + seed `policy_versions` v2.0)
3. Auth.tsx consent checkboxes + signup integration
4. Profile.tsx Privacy & Data section
5. `dsar-export` edge function
6. `account-deletion-request` edge function
7. `/grievance` public page + email notifications
8. Admin Grievances tab
9. Reconsent banner
10. Footer + routing wiring
