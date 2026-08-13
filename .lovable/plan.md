# Revenue Capture & Category Reporting — Revised Strategy

## Correction to my earlier read

You're right on both counts, and it changes the design for the better:

- **Coaching is not a revenue stream of its own.** `coaching_sessions` is a notes/drills log — it carries no money and should never write revenue. Coaching money arrives as either a **booking with `session_type = 'coaching'`** or a **membership/hour-package sale**. So there is nothing to "add" for coaching; there is something to *classify* correctly.
- **Customer advances and credit notes are not revenue events** and must stay out of the ledger. Advance top-ups are receipts (`manual_deposit` credit), drawdowns settle invoices, credit-note refunds credit the advance. Live data: ₹10,000 deposits, ₹13,500 vendor payments, ₹8,200 credit-note credits, ₹9,565 drawn down, plus 10 credit notes (₹14,916, one dispositioned to advance credit). None of that should create or duplicate revenue.

That kills my previous idea of a new `revenue_category` enum with `coaching` and `advance` members. It was inventing a second taxonomy alongside one you already have.

## The actual spine: your product catalogue is already the taxonomy

You already have exactly what's needed and it's clean:

- `product_categories` — Food & Beverage, Equipment, Apparel, Bay Usage, Coaching, Other (plus free-text ones in use: Merchandise, Caps, Gloves, Golf Balls, Head Covers)
- `products` — `category`, `item_type` (product/service), `gst_rate`, `hsn_code`, `sac_code`
- `bay_pricing.service_product_id` — already maps a session to a service product

So the strategy is not "add a category column". It is: **make every rupee resolve to a catalogue product, and derive category + GST + HSN/SAC from that product.** One taxonomy, one source of tax data, no inference code.

## Where the chain is actually broken (verified against live data)

### 1. Session-type key mismatch — the real coaching/practice bug

`bookings.session_type` holds `practice` (577), `coaching` (226), `individual` (118), `couple` (48), `group` (13).
`bay_pricing.session_type` holds `individual`, `couple`, `group`, `coaching_60`.

`practice` and `coaching` **match nothing**, so `service_product_id` resolution fails for 803 of 982 bookings. Consequences: the auto-invoice falls back to the city default (18%, SAC default, `hsn_code` NULL), and the revenue report can't tell coaching from bay practice — both land in "Bay Usage" via the `booking_id` shortcut. Chennai makes it worse: its `couple`/`group`/`individual` rows have `service_product_id` NULL entirely.

Also worth noting: the `Coach60` product (Chennai) has `gst_rate = 0` and no SAC, while `Coaching60` (Bengaluru) is 18% / SAC 9956. Same service, two tax answers.

### 2. Hour packages have no catalogue link

`hour_packages` (Birdie Member ₹25,000, Pro Pack, Starter Pack) has no `service_product_id`. So 86 purchases (₹8.9L of `purchase`/`payment` revenue) carry no category, no HSN/SAC, and get the 18% default. And because coaching can be sold as a package, membership revenue can't be split coaching vs practice at all.

### 3. League registrations — entirely off-books

28 paid teams, **₹1,10,492**, no ledger row, no invoice, not in GSTR-1. `_shared/legacy-league-finalize.ts` marks `payment_status = 'paid'` and stops — even though the registration row already stores `gst_mode`, `gst_rate`, `sac_code`, `taxable_amount`, `gst_amount`. Tax intent captured, then discarded.

### 4. Quick Competitions — same silent path

`_shared/qc-finalize.ts` sets `qc_entries.status = 'paid'` and stops. No paid entries yet, so this is a hole to close before it's used, not a backfill.

### 5. Shop orders — the insert fails silently

`useOrders.ts:57` writes `transaction_type: 'product_order'`, which is not in the live CHECK list (`payment, hours_deduction, guest_booking, refund, booking, purchase`). Zero such rows exist. It's also fired from the browser at *order placement*, i.e. before payment — so even if it worked it would recognise revenue on an unpaid order. Same latent problem with `'credit'` in `useInvoices.ts` and `calendar-sync`.

### 6. Auto-invoicing gated to two transaction types

The trigger and `backfill_missing_invoices()` only fire for `guest_booking` and `payment`. Walk-in `purchase`/`booking` rows (360 of them) never auto-invoice; 26 confirmed revenue rows currently have no invoice at all, so they're outside GSTR-1.

### 7. HSN/SAC gaps

323 of 637 invoice line items have neither HSN nor SAC. Most apparel/merchandise products have `gst_rate = 0` and blank HSN. GSTR-1's HSN summary is therefore incomplete regardless of the fixes above.

## Revised plan

### Step 1 — Repair the catalogue link (no new schema concepts)

- Align `bay_pricing.session_type` with the values `bookings` actually uses: `practice`, `coaching`, `individual`, `couple`, `group`. One migration renames `coaching_60` → `coaching`, adds the missing `practice` rows per city/day-type, and fills Chennai's NULL `service_product_id`s.
- Add `hour_packages.service_product_id` and point each package at a catalogue service product (Bay Usage or Coaching as appropriate).
- Add `leagues.service_product_id` (league entry fee, SAC 9996 as already recorded on registrations) and a competition entry-fee product for QC.
- Result: every priced thing in the business has exactly one catalogue row behind it, carrying its own GST rate and HSN/SAC.

### Step 2 — One ledger writer, product-aware

`revenue_transactions` gets two columns only: `product_id` (nullable FK) and `source_ref` (`text`, e.g. `league_registration:<uuid>`) with a unique index for idempotency. No new category enum — category is read through `products.category`.

New `supabase/functions/_shared/revenue-ledger.ts` with a single `recordRevenue()` that every server-side finalizer calls: resolves the product, writes one row, upserts on `source_ref` so webhook replays can't double-count. Rewire in this order:

- `calendar-sync` booking + guest paths → product from `bay_pricing` by (city, day_type, session_type) — now that the keys match, coaching and practice separate themselves.
- `complete_hour_purchase` → product from `hour_packages.service_product_id`, and label it `hour_purchase` instead of the generic `payment`.
- `_shared/legacy-league-finalize.ts` → league product, reusing the registration's own `gst_rate`/`sac_code`/`taxable_amount`.
- `_shared/qc-finalize.ts` → competition product.
- Shop orders → move the write out of the browser into the payment-confirmation path; recognise revenue on payment, not placement. Widen the `transaction_type` CHECK to include `product_order`, `league_registration`, `qc_entry`, `credit`.

`coaching_sessions` is left completely untouched — documented in code as a notes-only table.

### Step 3 — Keep advances and credit notes out, verifiably

- No advance transaction ever creates a revenue row. Drawdowns are settlement, not revenue; revenue was already recognised on the invoice they settle.
- Credit notes stay as `invoices` rows with `invoice_type = 'credit_note'`; refunds stay as `refund` revenue rows. The reconciliation view (Step 5) nets them on both sides so credit-note-to-advance dispositions can't read as lost revenue.
- Regression tests pin this: an advance deposit and a drawdown produce zero ledger rows, and a credit note reduces invoiced revenue by exactly its amount once, not twice.

### Step 4 — Invoice everything, with real HSN/SAC

- Widen the auto-invoice trigger and `backfill_missing_invoices()` to all confirmed, positive, non-refund, non-`hours_deduction` rows.
- Tax resolution order becomes: revenue row's `product_id` → source row's own tax fields (league registrations) → city GST profile default. The default becomes the rare exception rather than the norm.
- Admin guard: warn on saving a taxable catalogue product with a non-zero rate and no HSN/SAC, and add an admin report listing catalogue rows missing HSN/SAC so the 323 gap can be closed as data work.
- One reviewable backfill migration: the ₹1,10,492 of league revenue plus the 26 invoice-less revenue rows, dry-run report first.

### Step 5 — Reporting

- `useRevenue.ts`: delete the whole inference block (lines 256-333). Group by `products.category` via the new `product_id`, falling back to invoice line items only for genuinely multi-item invoices, and "Uncategorised" (never "Membership") for anything unresolved — which after Step 1 should be zero.
- `AdminRevenueTab`: category cards driven by `product_categories` — Bay Usage, Coaching, Leagues, Competitions, Apparel, Merchandise, Equipment, Food & Beverage, Golf Balls, Gloves, Caps, Head Covers, Other — each drilling into its transactions. Categories come from the table, so adding a category later needs no code change.
- New **Reconciliation** panel per city/month: ledger revenue vs invoiced revenue vs GSTR-1 taxable+tax, side by side, with any row present in one and missing in another listed explicitly. Advances shown separately as receipts, not revenue. This is the standing guard so the next new revenue stream can't go unnoticed.

### Step 6 — Tests

- Per-finalizer parity: each payment path writes exactly one ledger row with the right product and category.
- Idempotency: replayed webhook → still one row.
- Session-type mapping: every `bookings.session_type` value resolves to a `bay_pricing` row in every configured city (this test is what stops the mismatch recurring).
- Advance/credit-note neutrality, per Step 3.
- GSTR-1 completeness: fixture where every confirmed revenue row has a matching invoice line; assert zero unmatched and zero lines missing both HSN and SAC.

## Sequencing

Each step ships independently and the reports stay readable throughout:

1. Catalogue link repair (Step 1) — immediately splits coaching from practice, no code changes to reports yet.
2. Shared ledger writer + rewire the working paths (Step 2, first half) — no behaviour change, less code.
3. Close the holes: league, competition, shop (Step 2, second half) + league backfill.
4. Widen invoicing + HSN/SAC guards (Step 4).
5. Category reporting + reconciliation panel (Step 5).

Tests land with each step, not at the end.

## Decisions I need from you

- Chennai's `Coach60` is 0% GST with no SAC while Bengaluru's `Coaching60` is 18% SAC 9956. Which is correct? (This also affects whether past Chennai coaching invoices need credit-note correction.)
- League fee invoicing: one invoice per team to the captain, or per player? Registrations are captured per team, so per-team is the natural default.
- Whether the 803 already-invoiced practice/coaching bookings should be re-tagged retroactively (report-only correction) or left as-is with the fix applying from now on.

## Explicitly out of scope

- `coaching_sessions` — stays notes-only, no money.
- Chennai's incorrect GST state code / GSTIN from the earlier July audit — data correction, not code.
- Historic HSN backfill on the 323 line items — proposed as an admin data report, not an automated rewrite of issued invoices.
