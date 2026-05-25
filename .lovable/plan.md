# City-Scoped Corporate Billing (SaaS-lite)

## Goal
Each city admin (franchisee) sees only the corporate customers and sessions booked **in their own city**, and generates an invoice using **their city's GST profile** — even though the end customer (e.g. Aspirational Delight) is the same across cities.

## Audit — what exists today

- `AdminCityContext.selectedCity` already scopes most admin views; the Corporate Accounts tab currently ignores it.
- `corporate_accounts` table is **global** (no city column). One row per customer, shared across all cities — this is correct, we keep it.
- `profiles.corporate_account_id` links members to a corporate. Members are not city-bound either — correct (a member can play in any city).
- `useCorporateAccounts()` returns **every** active corporate, regardless of city.
- `useDeferredItemsForCorporate()` pulls deferred bookings/coaching for *all* members across *all* cities for the date range.
- `BillingPanel` picks the **majority city** from those sessions and uses that single city's `gst_profiles` row to build **one consolidated invoice**. This is wrong for multi-city corporates — wrong CGST/SGST vs IGST, wrong place-of-supply, and a Chennai franchisee can see Bengaluru sessions.
- `gst_profiles` is already keyed by `city` — good, we can reuse it directly per city.
- Invoices already carry a `city` column — already city-stamped.

## Proposed Plan

### 1. City-scope the Corporate Accounts list
- Read `selectedCity` from `AdminCityContext` in `AdminCorporateAccountsTab`.
- When a city is selected, show only corporate accounts that have **at least one deferred booking/coaching session in that city** (any time) — or, simpler and faster, accounts that have **at least one member who has ever booked in that city**. Computed via a single RPC or a `select distinct corporate_account_id` query joining `bookings.city = selectedCity` → `profiles` → `corporate_accounts`.
- "All Cities" (only available to global admins) keeps current behaviour.
- Result: a Chennai admin only sees "Aspirational Delight" if Aspirational Delight has Chennai activity. Bengaluru admin sees it too if they have Bengaluru activity. Same row, two cities, independently visible.

### 2. City-scope the Billing panel
- `useDeferredItemsForCorporate(accountId, start, end, city)` — add a `city` parameter and pass `selectedCity` into the `.eq("city", city)` filter on both `bookings` and `coaching_sessions`.
- Drop the "majority city" heuristic entirely.
- The deferred-items table now only shows sessions for **this city**.

### 3. Use the city's GST profile for the invoice
- Lookup `gst_profiles` by `selectedCity` (not by the heuristic).
- `getGstType(cityGstProfile.state_code, account.gstin)` decides IGST vs CGST+SGST correctly per franchisee state.
- `createInvoice({ ..., city: selectedCity })` so the invoice is stamped with the franchisee's city, surfaces in their Invoices tab and their GSTR-1 export only.
- Invoice number prefix already follows city — naturally separates Chennai and Bengaluru invoices.
- Notes line updated to read: `Consolidated invoice for <N> session(s) booked in <City> from <start> to <end>.`

### 4. Mark sessions invoiced (unchanged)
- After invoice creation, mark only the city-scoped `bookings.id` / `coaching_sessions.id` as `billing_status = invoiced` with the new `invoice_id`. The other city's sessions stay deferred and remain available for that city's own end-of-month run.

### 5. Guardrails
- If "All Cities" is selected, hide/disable the Generate button and show: "Pick a city to generate its invoice."
- If the selected city has no deferred sessions for the account in range, show the existing empty state (unchanged).
- If `gst_profiles` for the selected city is missing, block with a clear error pointing to City Settings.

### 6. Members panel
- Keep members list **global** (a member can be served by any city). Show a subtle "Active in: Chennai, Bengaluru" chip per member computed from their historical booking cities — read-only, no behaviour change.

### 7. Permissions
- Existing role gating (`admin` sees all cities, `site_admin` is auto-scoped to assigned cities via `AdminCityContext`) already enforces who can switch cities. No new RLS needed because `bookings`/`coaching_sessions`/`invoices` are already RLS-protected and `selectedCity` only narrows the query.

## Technical Details

**Files to touch (no schema changes):**
- `src/hooks/useCorporateAccounts.ts`
  - `useCorporateAccounts(includeInactive, cityFilter?)` — when `cityFilter` is set, restrict via a 2-step query: distinct `user_id` from `bookings` where `city = cityFilter` → distinct `corporate_account_id` from `profiles` → filter accounts.
  - `useDeferredItemsForCorporate(accountId, start, end, city?)` — add `.eq("city", city)` on both bookings + coaching when `city` is set.
- `src/components/admin/AdminCorporateAccountsTab.tsx`
  - Wire `useAdminCity().selectedCity` into both hooks.
  - `BillingPanel`: drop majority-city useMemo; use `selectedCity` directly; gate Generate behind a selected city; update notes and toast copy; pass `city: selectedCity` to `createInvoice`.

**No DB migration required** — `bookings.city`, `coaching_sessions.city`, `invoices.city`, and `gst_profiles.city` already exist.

**Backwards compatibility** — old "All Cities" generation path is removed (it was the buggy one). Existing already-generated invoices are unaffected.

## Out of Scope (call out for later if needed)
- Cross-city consolidated invoice (a single PDF spanning cities). Not requested and conflicts with per-city GST and per-franchisee P&L.
- Automated end-of-month cron — still manual per city, same as today.
