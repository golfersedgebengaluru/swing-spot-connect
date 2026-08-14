# Bullet-proof Revenue Capture & Category Reporting (revised, small-business scope)

## What changed in my thinking

Three simplifications from your input:

1. **No new taxonomy.** Revenue categories = the **Product & Service Categories already defined in General Settings** (`product_categories`: Food & Beverage, Equipment, Apparel, Bay Usage, Coaching, Other — plus any you add later). Every rupee resolves to a catalogue product, and the category is read off that product. Nothing inferred in code, nothing hardcoded in the UI.
2. **Coaching is not a stream.** The Coaching tab is notes and drills only, no money. Coaching revenue arrives as a booking with `session_type = 'coaching'` or as a membership/hour-package sale — so this is a *classification* fix, not a new capture path.
3. **Chennai is not GST-registered.** So Chennai must issue **non-GST invoices** (no GSTIN, no CGST/SGST lines, no HSN/SAC requirement, excluded from GSTR-1). Only Bengaluru feeds GSTR-1. That deletes most of the tax complexity from the earlier plan.

## What I found wrong (verified against live data)

### 1. Chennai's GST profile is impersonating Bengaluru — highest priority

`gst_profiles` for Chennai currently holds **Bengaluru's GSTIN `29AAJFT3960B1Z3`**, state Karnataka, state code 29, and `default_service_gst_rate = 18`. Chennai has 347 confirmed revenue rows. Any Chennai invoice that rendered a GSTIN or tax line has been showing another entity's registration number, and anything Chennai in GSTR-1 is an over-declaration. There is no "unregistered" concept in the schema at all today — that's the root cause.

### 2. Session-type keys don't match, so 803 bookings have no product

`bookings.session_type` uses `practice` (577), `coaching` (226), `individual` (118), `couple` (48), `group` (13).
`bay_pricing.session_type` uses `individual`, `couple`, `group`, `coaching_60`.

`practice` and `coaching` match nothing, so `service_product_id` never resolves for those 803 bookings. Result: coaching and bay practice can't be separated in the report — both fall through to a generic bucket. Chennai's `couple`/`group`/`individual` rows have `service_product_id` NULL outright.

### 3. Hour packages have no catalogue link

`hour_packages` (Birdie Member ₹25,000, Pro Pack, Starter Pack — 86 purchases) has no product link, so membership revenue has no category. Worse: a coaching package and a practice package are indistinguishable in the report.

### 4. League registrations are entirely off-books

28 paid teams, **₹1,10,492**, zero ledger rows, zero invoices. `_shared/legacy-league-finalize.ts` marks `payment_status = 'paid'` and stops.

### 5. Quick Competition entries — same silent path

`_shared/qc-finalize.ts` sets `status = 'paid'` and stops. No paid entries yet, so it's a hole to close, not a backfill.

### 6. Shop orders never reach the ledger

`useOrders.ts:57` inserts `transaction_type: 'product_order'`, which the live CHECK constraint rejects (`payment, hours_deduction, guest_booking, refund, booking, purchase`) — zero such rows exist. It also fires from the browser at order *placement*, before payment.

### 7. 39 confirmed revenue rows have no invoice

31 Chennai, 8 Bengaluru. Auto-invoicing only triggers for `guest_booking` and `payment`, so walk-in `purchase`/`booking` rows never invoice.

### 8. Advances and credit notes are fine — and must stay untouched

Advance deposits (₹10,000), vendor payments (₹13,500), credit-note credits (₹8,200), drawdowns (₹9,565) and the 10 credit notes (₹14,916) are correctly *not* revenue. Deposits are receipts; drawdowns settle invoices where revenue was already recognised. The plan adds regression tests to keep it that way.

## The plan

### Step 1 — GST registration becomes a first-class per-city flag

- Add `gst_profiles.is_gst_registered` (boolean, default true). Set Chennai to **false** and clear its borrowed GSTIN/state/state code and default rate.
- Invoice rendering, `useInvoices`, and `CreateInvoiceDialog` branch on the flag: unregistered city → document still titled **"Invoice"**, but with no GSTIN, no CGST/SGST breakup, no tax column and no HSN/SAC block. Chennai products carry no GST component at all.
- `gstr1-export.ts` filters to GST-registered cities only. Chennai simply doesn't appear.
- Because Chennai products are all 0% anyway, this is mostly *hiding* tax scaffolding rather than changing numbers — the risk is low and the correctness gain is large.


### Step 2 — Every priced thing points at a catalogue product

One migration, no new concepts:

- Align `bay_pricing.session_type` with the values `bookings` actually uses (`practice`, `coaching`, `individual`, `couple`, `group`); add the missing `practice` rows per city/day-type; fill Chennai's NULL `service_product_id`s.
- Add `hour_packages.service_product_id` and point each package at a catalogue service product (Bay Usage or Coaching).
- Add `leagues.service_product_id` and a Competition entry-fee product for QC.

After this, one lookup answers "what category is this rupee?" for every revenue source.

### Step 3 — One ledger writer

- `revenue_transactions` gets exactly two new columns: `product_id` (FK) and `source_ref` (text, unique) for idempotency. **No `revenue_category` column** — category is joined from the product.
- New `supabase/functions/_shared/revenue-ledger.ts` exporting a single `recordRevenue()`: resolves the product, writes one row, upserts on `source_ref` so webhook replays can't double-count.
- Rewire every finalizer to call it: `calendar-sync` (member + guest bookings), `complete_hour_purchase`, `legacy-league-finalize`, `qc-finalize`, and shop orders — with the shop write **moved server-side to payment confirmation**, out of the browser. Widen the `transaction_type` CHECK to cover `product_order`, `league_registration`, `qc_entry`.
- `coaching_sessions` stays untouched, with a comment recording that it is notes-only by design.

Net effect on the codebase: five bespoke insert sites collapse into one helper.

### Step 4 — Invoice everything

- Widen the auto-invoice trigger and `backfill_missing_invoices()` to all confirmed, positive, non-refund, non-`hours_deduction` rows.
- Tax resolution: registered city → product's own `gst_rate`/HSN/SAC, falling back to the city GST profile default; unregistered city → no tax fields at all.
- One reviewable backfill migration for the ₹1,10,492 league revenue and the 39 invoice-less rows, dry-run report first.

### Step 5 — Category reporting driven by General Settings

- `useRevenue.ts`: delete the inference block (lines 256-333) and group by the product's category. Fallback for anything unresolved is **"Uncategorised"**, never "Membership" — and after Step 2 it should read zero, which is itself the health signal.
- `AdminRevenueTab`: replace the five hardcoded tiles (`F&B, Equipment, Apparel, Membership, Bay Usage`) with tiles generated from `product_categories`. Add a category to General Settings and it appears in the report with no code change.
- Add a small **Reconciliation** strip per city/month: ledger total vs invoiced total vs (Bengaluru only) GSTR-1 taxable + tax, with any unmatched row listed. Advances shown separately as receipts. This is what makes it bullet-proof going forward — a new revenue stream that skips the ledger becomes visible immediately instead of at year-end.

### Step 6 — Tests

- Every payment path writes exactly one ledger row with the correct product and category.
- Replayed webhook → still one row (idempotency).
- Every `bookings.session_type` value resolves to a `bay_pricing` row in every configured city — this is the test that stops issue #2 recurring.
- Unregistered city: invoice renders no GSTIN and no tax lines, and is absent from GSTR-1.
- Advance deposit and drawdown produce zero ledger rows; a credit note reduces invoiced revenue exactly once.

## Sequencing

1. Chennai GST correction (Step 1) — smallest change, biggest compliance risk removed.
2. Catalogue link repair (Step 2) — coaching separates from practice immediately.
3. Shared ledger writer, rewiring paths that already work (Step 3, no behaviour change).
4. Close the holes: league, competition, shop + league backfill.
5. Widen invoicing (Step 4), then category reporting + reconciliation (Step 5).

Tests ship with each step.

## Two decisions I need from you

- For Chennai, should the document read **"Invoice"** or **"Bill of Supply"**? (Both are acceptable for an unregistered seller; Bill of Supply is the more conventional label.)
- The 803 already-invoiced practice/coaching bookings: re-tag them retroactively so historic reports split correctly, or apply the fix from now on only?

## Out of scope

- `coaching_sessions` — notes only, no money, no changes.
- Historic HSN backfill on Bengaluru line items — surfaced as an admin data report, not an automated rewrite of issued invoices.
- Any new category taxonomy — General Settings remains the single place categories are defined.
