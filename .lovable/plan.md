# Revenue Capture & Category Reporting — Audit and Fix Plan

## What I found (audit)

Money is collected in seven places, but only three of them write to the revenue ledger. Everything else is invisible to the Revenue report and to GSTR-1.

### Confirmed against live data

| Stream | Ledger row? | Invoice? | In GSTR-1? | Live evidence |
|---|---|---|---|---|
| Bay booking (member, online) | Yes (`payment`) | Yes (auto) | Yes | 44 rows, ₹2.07L |
| Bay booking (guest) | Yes (`guest_booking`) | Yes (auto) | Yes | 160 rows, ₹2.60L (10 missing invoices) |
| Walk-in / manual invoice | Yes (`booking`/`purchase`) | Yes (created together) | Yes | 360 rows |
| Hour packages | Yes, but labelled `payment` | Yes | Yes, mislabelled | indistinguishable from bay revenue |
| **League registrations** | **No** | **No** | **No** | **28 paid teams, ₹1,10,492 completely off-books** |
| **Quick Competitions** | **No** | **No** | **No** | no rows yet, but code path is silent |
| **Shop orders (apparel/merch)** | **Insert fails** | **No** | **No** | 2 orders ₹2,594; 0 `product_order` rows exist |
| **Coaching sessions** | **No** | **No** | **No** | 20 sessions, 0 invoices |

### Root causes

1. **League + QC finalizers never write revenue.** `_shared/legacy-league-finalize.ts` and `_shared/qc-finalize.ts` mark their own table `paid` and stop. Ironically the registration row already captures `gst_mode`, `gst_rate`, `sac_code`, `taxable_amount`, `gst_amount` — the tax intent is recorded and then thrown away.
2. **Silent insert failure for shop orders.** `useOrders.ts:57` inserts `transaction_type: 'product_order'`, but the live CHECK constraint only allows `payment, hours_deduction, guest_booking, refund, booking, purchase`. Same for `'credit'` used in `useInvoices.ts` and `calendar-sync`. The insert is un-awaited for errors, so it fails quietly. Zero such rows exist in the database.
3. **Auto-invoicing is gated too narrowly.** The trigger and `backfill_missing_invoices()` both fire only for `transaction_type IN ('guest_booking','payment')`. So walk-in `purchase`, `booking`, and shop revenue never auto-invoice, and therefore never reach GSTR-1 unless an admin hand-keys an invoice.
4. **Category is inferred, not stored.** `useRevenue.ts:256-333` guesses: `booking_id` → Bay Usage, `hours_transaction_id` → Membership, everything else → join to invoice line items → `products.category`, residual → "Other". There is no first-class revenue category, so apparel vs merchandise vs coaching vs leagues cannot be reported. Also 26 dead migration references to `league_team_registration` / `qc_entry` / `hour_purchase` prove this was planned and abandoned.
5. **GSTR-1 is invoice-only.** `gstr1-export.ts` reads `invoices` + `invoice_line_items` only. Anything without an invoice is legally invisible. Additionally 323 of 637 existing line items have neither HSN nor SAC code.

## The fix — one concept, not seven patches

Introduce a single stored `revenue_category` on `revenue_transactions` and make **every** payment finalizer write exactly one ledger row through **one shared helper**. Invoicing and reporting then become pure functions of the ledger. This removes the guessing logic entirely rather than extending it.

### 1. Schema (one migration)

- Add `revenue_category text NOT NULL` with a CHECK list: `bay_booking`, `hour_package`, `league`, `competition`, `coaching`, `apparel`, `merchandise`, `food_beverage`, `advance`, `other`.
- Widen the `transaction_type` CHECK to include `product_order`, `league_registration`, `qc_entry`, `credit` (aligning the constraint with code that already exists).
- Backfill `revenue_category` for all 1,132 existing rows using the current inference rules, so historical reports do not change value.
- Add `revenue_transactions.source_table` + `source_id` (nullable) so a ledger row can point back to a league registration, QC entry, coaching session or shop order. Unique partial index on `(source_table, source_id)` → idempotency, no double-counting on webhook retries.
- Add `default_hsn_code` handling so line items always carry HSN **or** SAC.

### 2. One shared ledger writer

New `supabase/functions/_shared/revenue-ledger.ts` exporting a single `recordRevenue()` that takes amount, currency, city, category, source, customer and gateway refs; it upserts on `(source_table, source_id)` and returns the row. Every finalizer calls it:

- `_shared/legacy-league-finalize.ts` → `league`, carrying the registration's existing `sac_code`/`gst_rate`/`taxable_amount`.
- `_shared/qc-finalize.ts` → `competition`.
- `calendar-sync` booking/guest paths → `bay_booking` (replaces inline inserts).
- `complete_hour_purchase` → `hour_package` (currently mislabelled `payment`).
- Coaching: on session save with `billing_status = 'immediate'` → `coaching`.
- Shop orders: move the insert **out of the browser** into the order-confirmation path so RLS can't silently drop it, and only on payment, not on order placement (today it would recognise revenue for an unpaid pending order).

Client-side revenue inserts are removed entirely — the ledger becomes service-role only.

### 3. Invoicing covers everything

- Widen the auto-invoice trigger and `backfill_missing_invoices()` from two transaction types to **all non-refund, non-hours_deduction categories**.
- Category → HSN/SAC/GST-rate resolution order: explicit product → source row's own tax fields (league registrations already have them) → city GST profile default. Never leave both HSN and SAC null.
- Extend `CreateInvoiceDialog` invoice categories beyond `booking`/`purchase` to the full category list so manual invoices carry the same taxonomy.
- One-time backfill script for the ₹1,10,492 of league revenue and the 26 orphan bookings/purchases missing invoices, run as a reviewable migration with a dry-run report first.

### 4. Reporting

- `useRevenue.ts`: delete the inference block; group by the stored `revenue_category` with a display-label map. ~70 lines of fragile joins removed.
- `AdminRevenueTab`: category cards for Bay Usage, Hour Packages, Leagues, Competitions, Coaching, Apparel, Merchandise, F&B, Other — with drill-down to the transactions behind each.
- New **Reconciliation** panel: for the selected city/month, show three totals side by side — ledger revenue, invoiced revenue, GSTR-1 taxable + tax — and flag any row present in one and absent in another. This is the ongoing guard so a future new revenue stream can never go unnoticed.

### 5. Tests

- Parity tests per finalizer: every payment path produces exactly one ledger row with the right category (mirrors the existing `booking-notifications.test.ts` pattern).
- Idempotency: replaying a webhook produces no second row.
- `groupByCategory` unit tests covering every category and refunds netting.
- GSTR-1 completeness test: fixture ledger where every confirmed row has a matching invoice line, asserting zero unmatched.

## Sequencing (each step independently shippable)

1. Migration: `revenue_category`, widened CHECKs, source columns, backfill of history. Reports unchanged in value, now stored not guessed.
2. Shared `recordRevenue()` + rewire the three already-working paths. No behaviour change, less code.
3. Close the holes: league, competition, coaching, shop. Plus the historical league backfill.
4. Widen invoicing + HSN/SAC guarantee.
5. Category reporting UI + reconciliation panel.

## Not in scope unless you say so

- Chennai's wrong GST state code / GSTIN (flagged in the earlier July audit) — data correction, not code.
- Whether league fees should invoice per team or per player.
- Retro-invoicing the 20 coaching sessions (needs your call on whether they were billed offline).
