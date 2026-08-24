# Bullet-proof Revenue Capture & Category Reporting (revised, small-business scope)

## What changed in my thinking

Three simplifications from your input:

1. **No new taxonomy.** Revenue categories = the **Product & Service Categories already defined in General Settings** (`product_categories`: Food & Beverage, Equipment, Apparel, Bay Usage, Coaching, Other — plus any you add later). Every rupee resolves to a catalogue product, and the category is read off that product. Nothing inferred in code, nothing hardcoded in the UI.
2. **Coaching is not a stream.** The Coaching tab is notes and drills only, no money. Coaching revenue arrives as a booking with `session_type = 'coaching'` or as a membership/hour-package sale — so this is a *classification* fix, not a new capture path.
3. **Chennai is not GST-registered.** So Chennai must issue **non-GST invoices** (no GSTIN, no CGST/SGST lines, no HSN/SAC requirement, excluded from GSTR-1). Only Bengaluru feeds GSTR-1. That deletes most of the tax complexity from the earlier plan.

## What I found wrong (verified against live data)

### 1. Chennai's GST profile is impersonating Bengaluru — highest priority

`gst_profiles` for Chennai currently holds **Bengaluru's GSTIN `29AAJFT3960B1Z3`**, state Karnataka, state code 29, and `default_service_gst_rate = 18`. Chennai has 347 confirmed revenue rows. Any Chennai invoice that rendered a GSTIN or tax line has been showing another entity's registration number, and anything Chennai in GSTR-1 is an over-declaration. There is no "unregistered" concept in the schema at all today — that's the root cause.

### 2. Session-type keys mix two different questions, so 803 bookings have no product

`bookings.session_type` uses `practice` (577), `coaching` (226), `individual` (118), `couple` (48), `group` (13).
`bay_pricing.session_type` uses `individual`, `couple`, `group`, `coaching_60`.

These are two different questions crammed into one column: **what was sold** (bay rental vs coaching) and **how it was priced** (individual / couple / group). So `practice` and `coaching` match nothing on the pricing side, `service_product_id` never resolves for those 803 bookings, and coaching can't be separated from bay rental in the report. Chennai's `couple`/`group`/`individual` rows have `service_product_id` NULL outright.


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


### Step 2 — Split "what was sold" from "how it was priced", then point both at the catalogue

The taxonomy fix, not a rename. Two orthogonal ideas instead of one flat list:

- **Service** (revenue category): `practice` or `coaching` — this is what resolves to a catalogue product and drives the report.
- **Rate tier** (pricing only): `individual` / `couple` / `group` — never a category, only a price lookup.

Implementation, forward-only and non-destructive:

- One small pure module `src/lib/session-taxonomy.ts` (mirrored in `_shared/` for edge functions) exposing `resolveService(session_type)` and `resolveTier(session_type)`. Existing stored values keep working: `practice`/`coaching` map to service with tier `individual`; `individual`/`couple`/`group` map to service `practice` with that tier. This is the only place the legacy mapping lives — every call site stops doing its own string matching.
- New bookings write both fields: `session_type` keeps the service key, and the existing tier is stored in the pricing tier field so the two questions stop colliding.
- `bay_pricing` is keyed on **(service, tier)** — add the missing `practice` rows per city/day-type and retire `coaching_60` in favour of `(coaching, individual)`.
- Add `hour_packages.service_product_id` and point each package at a catalogue service product (Bay Usage or Coaching).
- Add `leagues.service_product_id` and a Competition entry-fee product for QC.

**On renaming `practice` → "Bay Rental":** display-label only. The stored key stays `practice`; the catalogue product and UI can read "Bay Rental". Rewriting the stored value would touch 577 rows plus every edge-function string comparison for zero functional gain — that would *add* debt, not remove it.

After this, one lookup answers "what category is this rupee?" for every revenue source, and one module answers "what tier priced it?".


### Step 3 — One ledger writer

- `revenue_transactions` gets exactly two new columns: `product_id` (FK) and `source_ref` (text, unique) for idempotency. **No `revenue_category` column** — category is joined from the product.
- New `supabase/functions/_shared/revenue-ledger.ts` exporting a single `recordRevenue()`: resolves the product, writes one row, upserts on `source_ref` so webhook replays can't double-count.
- Rewire every finalizer to call it: `calendar-sync` (member + guest bookings), `complete_hour_purchase`, `legacy-league-finalize`, `qc-finalize`, and shop orders — with the shop write **moved server-side to payment confirmation**, out of the browser. Widen the `transaction_type` CHECK to cover `product_order`, `league_registration`, `qc_entry`.
- `coaching_sessions` stays untouched, with a comment recording that it is notes-only by design.

Net effect on the codebase: five bespoke insert sites collapse into one helper.

### Step 4 — Invoice everything, going forward

- Widen the auto-invoice trigger to all newly confirmed, positive, non-refund, non-`hours_deduction` rows.
- Tax resolution: registered city → product's own `gst_rate`/HSN/SAC, falling back to the city GST profile default; unregistered city → no tax fields at all.
- **No retroactive rewrites.** Historic rows (the ₹1,10,492 league fees, the 39 invoice-less rows, the 803 mis-tagged bookings) stay exactly as they are. They surface in a read-only admin "Legacy gaps" report so you can decide case by case; nothing is auto-generated against closed periods.

### Step 5 — Category reporting driven by General Settings

- `useRevenue.ts`: delete the inference block (lines 256-333) and group by the product's category. Fallback for anything unresolved is **"Uncategorised"**, never "Membership" — historic rows will land there, which is honest rather than misleading.
- `AdminRevenueTab`: replace the five hardcoded tiles (`F&B, Equipment, Apparel, Membership, Bay Usage`) with tiles generated from `product_categories`. Add a category to General Settings and it appears in the report with no code change.
- Add a small **Reconciliation** strip per city/month: ledger total vs invoiced total vs (Bengaluru only) GSTR-1 taxable + tax, with any unmatched row listed. Advances shown separately as receipts. This is what makes it bullet-proof going forward — a new revenue stream that skips the ledger becomes visible immediately instead of at year-end.

### Step 6 — Tests

- Every payment path writes exactly one ledger row with the correct product and category.
- Replayed webhook → still one row (idempotency).
- Every `bookings.session_type` value resolves to a `bay_pricing` row in every configured city — this is the test that stops issue #2 recurring.
- Unregistered city: invoice renders titled "Invoice" with no GSTIN and no tax lines, and is absent from GSTR-1.
- Advance deposit and drawdown produce zero ledger rows; a credit note reduces invoiced revenue exactly once.

## Sequencing

1. Chennai GST correction (Step 1) — smallest change, biggest compliance risk removed.
2. Catalogue link repair (Step 2) — coaching separates from practice for all new bookings.
3. Shared ledger writer, rewiring paths that already work (Step 3, no behaviour change).
4. Close the holes: league, competition, shop.
5. Widen invoicing (Step 4), then category reporting + reconciliation (Step 5).

Tests ship with each step.

## Out of scope

- Any backfill or re-tagging of historic revenue, invoices or bookings — forward-only, surfaced as a report instead.
- `coaching_sessions` — notes only, no money, no changes.
- Historic HSN backfill on Bengaluru line items.
- Any new category taxonomy — General Settings remains the single place categories are defined.

