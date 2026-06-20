# Quick Competition as a SaaS — multi-gateway, tenant-scoped

External customers sign up as a "QC-only tenant", log in to a scoped admin workspace, run Quick Competitions, and collect entry fees through **their own payment gateway** (Razorpay today; Stripe / PayPal / Square pluggable via the same row shape).

## Architecture

```text
auth.users ──┐
             ├── qc_only_admins(user_id, tenant_id, role)
             │
tenants (kind='qc_only') ──┬── quick_competitions
                           ├── payment_gateways(tenant_id, provider, ...)
                           └── qc_entries (via competition)
```

Gateway resolution in QC functions, in order:
1. `payment_gateways where tenant_id = comp.tenant_id and is_active` (BYO)
2. `payment_gateways where city = tenant.city and is_active` (legacy)
3. Error: "Payments not configured"

`payment_gateways.name` already stores the provider (`razorpay`, `stripe`, …). Order-create / verify dispatch on it. Razorpay is implemented now; Stripe/PayPal/Square slot in as new branches without schema change.

## Changes

### 1. Migration (one)
- `tenants`: add `kind text not null default 'full'` (`'full' | 'qc_only'`), `display_name text`.
- `payment_gateways`: add `tenant_id uuid null → tenants`, partial unique `(tenant_id, name) where tenant_id is not null`. `city` becomes nullable when `tenant_id` is set (enforced by trigger: exactly one of `city` / `tenant_id`).
- New table `qc_only_admins (user_id, tenant_id, role default 'owner')` + grants + RLS.
- Helper `public.is_qc_tenant_admin(uuid, uuid)` SECURITY DEFINER.
- RLS on `quick_competitions`, `qc_entries`, `quick_competition_players`, `quick_competition_categories`, `quick_competition_attempts`, `quick_competition_audit`: add `is_qc_tenant_admin(auth.uid(), tenant_id)` alongside existing admin policies.
- RLS on `payment_gateways`: tenant admins can manage rows where `tenant_id` matches.

### 2. Edge functions (minimal diff)
- `qc-create-entry-order`, `qc-verify-entry-payment`, `qc-refund-entry`: replace the `payment_gateways` lookup with a small `resolveGateway(supabase, comp)` helper that tries `tenant_id` then `city`. Dispatch on `gateway.name`. Razorpay branch unchanged.
- `razorpay-webhook`: when `notes.tenant_id` present, look up secret by `tenant_id` first, fall back to `city`. Two added lines.

### 3. Frontend
- `useQcAdmin()` hook — returns `{ tenants, loading }` from `qc_only_admins`.
- `QcAdminRoute` guard.
- `/qc-admin` page, three tabs: **Competitions**, **Entries**, **Payments** (form to save provider + key/secret into `payment_gateways` for the active tenant; provider dropdown: Razorpay today, others disabled with "Coming soon" so the UI is honest).
- Login redirect: if user is in `qc_only_admins` and not a platform admin, send to `/qc-admin`.
- Super-admin: new "QC SaaS" section under Admin to create tenants and assign owners by email.

### 4. Tests
- Gateway resolution: tenant_id wins over city; falls back to city; errors when neither set.
- RLS isolation: tenant-A QC admin cannot read tenant-B competitions/entries.
- `QcAdminRoute`: redirects unauth → `/auth`, non-qc-non-admin → `/dashboard`.

## Out of scope (next)
- Self-serve tenant signup, teammate invites, platform fees, Stripe/PayPal/Square implementations (schema ready; one edge-function branch each when needed).
