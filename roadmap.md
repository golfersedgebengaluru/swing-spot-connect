# Roadmap

## Bookings calendar (approved 12 November)
- [x] Day View moved into Bookings as a Calendar tab (opens first) next to List; Manual Booking button kept at the top; removed from the sidebar (old links open Bookings)
- [x] Clicking a free, open time fills in the city, bay, date and start time in Manual Booking; booked, blocked and closed times are not clickable
- [x] Notification links with filters open on the List tab; pending count shown on the List tab
- [x] 120 files / 1037 tests passed
- [ ] Visual check with a staff account (preview account has no staff access)

## Repeating block-outs (11 November)
- [x] Weekly repeat with chosen days, start date and optional end date; one bay or all bays; booking availability and Day View follow it
- [x] Remove "only this day" or "this and following days"; staff own-city only
- [x] 118 files / 1034 tests passed; live Bengaluru availability unchanged; public access refused
- [ ] Day View visual check: test account lacks staff access
- [ ] Chennai set-up: waiting on answers to the Chennai questions (bookings vs blocks, Mondays, early hours, one-off entries)

## Opening-hours gaps (approved 11 November)
- [x] Server re-checks customer bookings against opening hours, off days and holidays; staff override
- [x] Day View shows each bay's full hours (incl. early access, day-specific hours, holidays) and greys out closed times
- [x] 117 files / 1017 tests passed; functions deployed; live out-of-hours checkouts refused with no hold created
- [ ] Day View visual check: test account lacks staff access

## Security batch 2 (approved 9 November: items 1–3)
- [x] Reward points: one authorized action for staff awards and member redemptions; raw helpers service-only; direct balance edits blocked; live anon/member attempts refused
- [x] Calendar choice: bookings, walk-ins and availability always use the bay's calendar; live Chennai availability unchanged with an outside calendar supplied
- [x] Invoice print/viewer and event pages: stored text escaped/sanitized
- [x] 112 files / 970 tests passed; calendar-sync deployed; site published with the change
- [ ] Decisions pending: coach student assignment (item 4) and public quick-competition records (item 5)

## Low-effort reliability fixes (approved 6 November)
- [x] Restrict legacy cancellation to internal service calls; verified live anon/member denial and service access; existing paid-cancellation regressions pass
- [ ] Verify real CI runs and merge enforcement: GitHub connection exposes no repositories; existing test/build workflow unchanged, migration-drift automation separate
- [x] Make manual invoice creation/deletion transactional, with explicit booking attribution, rollback and replay tests; leave historical outstanding/deferred entries unchanged
- [x] Restore transactional site-admin city assignment with internal-only access, city validation and rollback tests
- [x] Surface and persist email failures without rolling back confirmed bookings or adding automatic retries; deployed notification sender and calendar-sync
- [x] Full regression suite: 109 files / 938 tests passed; preview build OK; verified current database permissions and unchanged outstanding invoice balances
- [ ] Authorized live invoice/staff-operation end-to-end checks: requesting-user screen shows Access Denied; sandbox database role cannot execute new RPCs or assume authenticated role; no real financial records altered
- [ ] Separate approval for deep-scan findings: scan reports checkout/finalization authorization and pricing, email authorization, and unsafe HTML rendering risks; not included in this five-fix release

## Atomic paid-booking cancellation (approved)
- [x] Commit cancellation, loyalty reversal, signed refund, credit note and advance credit in one authorized transaction
- [x] Route member and admin paid cancellations through it; run calendar cleanup only after commit and report actual credit outcomes
- [x] Test rollback, retries, simultaneous submissions, ownership, cancellation boundaries and unchanged manual/hour-only flows; 108 files / 915 tests passed, preview build OK
- [x] Deploy calendar-sync and verify server-only permissions; do not repair historical financial exceptions automatically
- [ ] Live paid-cancellation end-to-end verification blocked: requesting user's history contains no eligible paid booking; no real customer booking cancelled or synthetic financial records added

## Member booking timezone display (approved)
- [x] Resolve each member booking's timezone from its bay calendar without exposing calendar identifiers
- [x] Align desktop, mobile and CSV dates/times and timezone labels; leave booking instants and cancellation rules unchanged
- [x] 106 files / 894 tests passed; preview build OK; signed-in real-history desktop/mobile and CSV verified under Korea device timezone without overflow or runtime errors; Russell's exact noon–2PM instants covered by regression

## Users report alignment (approved)
- [x] Align Visits and personal net spend with explicit date bounds; default to all activity, with matching sorting and export
- [x] Use the top-level city as the only directory location selector; preserve authorized customer access and account-wide balances
- [x] Distinguish membership type from customer status; unify next-booking display and clarify booking-history revenue
- [x] Focused and full regressions: 105 files / 884 tests passed; preview build OK
- [ ] Authorized Users visual/end-to-end verification blocked: requesting-user session shows Access Denied; no privileges changed

## Customer Finance correction (approved)
- [x] Show invoices and credit notes only; retain separate advance history and shared lifetime spend
- [x] Restore Rohan's ₹25,000 Birdie invoice …/1582 dated 3 November 2026 against the existing payment, without granting hours or posting revenue again; remove recycled number and retain August purchase in notes
- [x] Verify invoice/tax/payment link and unchanged 11 revenue rows totaling ₹40,053.76 and 25 purchased / 15.75 used hours; 103 files / 874 tests pass
- [ ] Authorized Finance screen verification: requesting user's signed-in session still shows Access Denied; no privileges changed

## Users totals audit (approved)
- [x] Audit Zaheen's visits and all invoice/payment attribution: 11 paid bookings; 818 issued invoices all linked with matching amounts/dates; five orphan manual-revenue entries and eight partial/unpaid invoices identified, not changed
- [x] Replace directory period visits/spend with total columns and aligned sorting; recognize paid booking revenue/invoice evidence and invoice/hours customer ownership without double-counting
- [x] Establish Rohan Pada's earliest 25-hour purchase: 2 August 2026, 13:04 IST; exact tier assignment and initial payment remain unsupported by retained records
- [x] Run regressions: 102 files / 869 tests passed; live evidence confirms 11 Zaheen visits; preview build OK
- [ ] Staff-screen verification: requesting-user session still shows Access Denied; no privileges changed
- [ ] Historical finance exception resolution: Rohan's ₹25,000 Birdie invoice restored; remaining four invoice-less entries require source confirmation

## Actionable dashboard (approved)
- [x] Replace Top Members with short renewal and inactive-repeat customer views using shared authorized reporting
- [x] Mark evidenced first visits at the booking's location; preserve unknown guest history as unknown
- [x] Link customer rows to Member360 and the existing full reports; leave booking/payment workflows unchanged
- [x] Run rule and navigation regressions, including city boundaries and unknown/ambiguous guest history: 102 files / 860 tests passed; preview build OK
- [ ] Verify authorized desktop/mobile dashboard, first-arrival markers and full-report links: requesting-user session still shows Access Denied; no privileges were changed

## CRM Phase 3 — awaiting approval
- [x] Prepare customer notes, assigned follow-ups and due-list proposal without application changes
- [x] Reassess necessity of general notes against the user's priority: essential centre operations and staff ease of use, without bells and whistles
- [ ] Agree whether a minimal follow-up list solves an actual staff need before implementation; the earlier notes proposal is not approved

## All Users action visibility (approved column-only change)
- [x] Review the existing three-dot menu, hours/points actions and advance deposit entry
- [x] Confirm with user that actions exist off-screen; recommend column reorganization rather than rebuilding workflows
- [x] Move Actions beside User; pin both columns while scrolling; keep menus, filters, exports and handlers unchanged
- [x] Run focused customer regressions: 10 tests passed; preview build OK
- [ ] Verify menu visually with authorized admin access: requesting-user session still shows Access Denied

## CRM execution planning
- [x] Tighten the proposed CRM plan around the smallest reportable release and present it for approval

## CRM reporting foundation (approved Phases 1 and 2)
- [x] Audit online-customer coverage without historical writes: all 211 completed online guest bookings have explicit payment-order/booking/profile links; seven email mismatches are not missing customers
- [x] Inspect deployed account-claim behavior and test dual-key reporting continuity; actual signup/duplicate-merge end-to-end remains unverified
- [x] Add authorized shared customer summaries and strict location filtering
- [x] Add directory presets, period filters and complete safe exports; align Member360/Finance summaries
- [x] Run rule/regression tests: 101 files / 852 tests passed; preview build OK; live non-admin RPC denies with 403
- [ ] Verify authorized admin/city-admin reporting and real account-claim end-to-end: available requesting-user session has neither role; browser correctly shows Access Denied
- [x] Stop before follow-up workflows, booking-source writes and historical identity repairs; no missing online-guest customer links found

## Corporate multi-account registration and booking
- [ ] Add secure memberships, atomic registration/assignment, and explicit session attribution
- [ ] Convert registration, member management, booking choice, monthly billing and calendar labels
- [ ] Verify legacy attribution, account-claim compatibility and city permissions
- [ ] Run focused/full tests and verify authorized admin end-to-end flow

## Auditor-focused GSTR-1 export
- [x] Verify current official HSN/report requirements and document supported scope
- [x] Consolidate HSN by supply type, code, rate and UQC; add signed invoice-line breakdown
- [x] Add review exceptions and reconciliation without changing historical invoices; correct B2CL routing and recorded document ranges
- [x] Cover grouping, discounts, credits, missing metadata and workbook integration; full regression: 97 files / 814 tests, current preview build OK
- [ ] Live financial export verification: blocked because requesting user's available session has no admin/report access; browser correctly denies access
- [ ] Filing readiness: auditor must confirm official HSN descriptions, historical goods UQC, turnover digit requirements and applicability of unmodelled return sections listed in Filing Notes; source data is unavailable and must not be invented

## Pass 3 — refunds & cancellations (done)
- [x] `record_refund` RPC: negative amounts, source_ref idempotency, over-refund guard, inherits city/currency/product/customer
- [x] Insert trigger: refunds must be negative, sales may not be
- [x] Stop writing zero-value refund revenue rows (hours-only cancellations)
- [x] Backfill: 22 positive refunds flipped negative, 154 zero-value refund rows removed, city/month nets unchanged
- [x] Unify member + admin cancellation disposition logic (one shared routine, errors surfaced)
- [x] Credit note + advance written together; store credit refused for guest sales (no account)
- [x] Invoice cancellation reverses the linked revenue, dated to the credit note
- [x] Reports: signed refunds in summary, dashboard, P&L, revenue list
- [x] Tests: RPC contract, shared writer, cancellation paths, invoice cancellation, report arithmetic

## City guardrail (done)
- [x] `record_revenue` resolves the city from the booking/bay, then the member's preferred city, and refuses a paid sale if it still can't
- [x] Table trigger blocks any non-zero row with a blank city (last defence, zero-value rows unaffected)
- [x] 11 legacy zero-value blank-city rows deleted; 0 remain
- [x] Tests: writer + trigger contract, live rejection/recovery checks

## Pass 4 — product & tax-code stamping (done)
- [x] HSN/SAC codes trimmed on products and invoice lines; a normaliser keeps them clean (no more " 999652" phantom GSTR-1 row)
- [x] One shared resolver decides which product a sale was for (metadata → bay pricing → hour package → league → itemised invoice)
- [x] Revenue rows stamped with the product on insert and when a booking/hours link appears later
- [x] Invoice lines inherit HSN/SAC and item type from their product
- [x] New taxable products must carry a code; an existing code cannot be cleared (form check + database guard)
- [x] Manual invoice refuses to save a taxable line with no code
- [x] Backfill: sales without a product 649 → 42, uncoded invoice lines 390 → 231 (only 26 of them taxable); amounts, cities and dates untouched
- [x] Tests: pure tax-code helpers, migration contract (resolver, triggers, backfill, revokes)

## August 2026 code fill — Bengaluru only (done)
- [x] Bengaluru is the only GST-registered city and August is the only unfiled GSTR-1, so the fill is scoped to that city and month
- [x] Re-runnable, date + city scoped `backfill_invoice_line_tax_codes(from, to, city)` — codes only, never amounts/dates/numbers
- [x] "500 coaching" catalogue item given the standard coaching code; its Bengaluru August line filled
- [x] Chennai lines that were briefly filled have been reverted (not GST registered)
- [x] Bengaluru August: 0 of 48 invoice lines now missing a code
- [x] Tests: scope, idempotency, code-only guarantee, browser revoke

## Later
- [ ] 124 catalogue items still have no HSN/SAC (all zero-rated bar one) — codes need to be confirmed per item, not guessed
- [ ] Chennai historical lines left uncoded on purpose (city not GST registered)
- [ ] 3 hour packages have no linked catalogue item, so those purchases stay untagged
- [ ] Decision needed: should coaching be taxed at 18%?


- [x] Sales by SKU report (category + vendor drill-down, complete CSV export)
- [x] products.vendor_id (optional, physical products only)
- [ ] CRM features derived from the same revenue ledger (later)

## Gateway credential isolation (in progress)
- [x] Deploy authenticated server-only gateway status and credential-management operation
- [x] Move platform, city, and QC admin payment screens to the server-only operation
- [x] Regression-test role boundaries, secret-free responses, sanitized errors, and unchanged live/test settings
- [x] Re-authorize the target gateway scope on every update before blank-retain credential merging
- [x] Treat omitted is_test_mode as unchanged; only an explicitly supplied boolean may change it
- [ ] Verify preview admin flows; available test account is not an admin; await authorized platform/city/QC accounts and owner-led real-user live payment and webhook verification
- [x] Isolated revocation: all direct payment_gateways privileges removed from anon and authenticated; direct reads return 401/403
- [ ] Separately isolate admin_config.admin_password after its replacement path is verified

## Reconciliation endpoint authentication (in progress)
- [ ] Require a dedicated shared-secret header before any payment reconciliation logic runs
- [ ] Update both active five-minute production schedules to send the secret
- [ ] Add CI-suite regression tests for missing, incorrect, and valid authentication
- [ ] Verify deployed missing/wrong-secret calls return 401 and authenticated cron calls succeed
- [ ] Follow-up decision: keep or consolidate the duplicate cron jobs `reconcile-pending-payments-every-5-min` and `reconcile-pending-payments-every-5min` after stability is confirmed

## Password reset abuse protection (approved)
- [x] Use `pg_advisory_xact_lock` inside the atomic limiter function transaction; never use session-scoped `pg_advisory_lock`
- [ ] Reuse only the restored `rate_limit_attempts` table for hashed-email cooldown and hashed-IP limiting
- [ ] Suppress reset emails for OAuth-only accounts, preserve uniform HTTP 200 success responses, redact logs, and allowlist redirects
- [ ] Add and run the six approved regression cases, then run the full test suite
- [ ] Deploy the database function and password-reset endpoint, then verify no `anon` or `authenticated` table/function grant exists
- [x] Restore the originally designed `rate_limit_attempts` table in production with service-only access

## Razorpay webhook dead writes
- [x] Remove the four dead `orders`/`bookings` payment-column update attempts
- [x] Log errors returned by every remaining database update in the webhook
- [x] Run the full regression suite and report the pass count (88 files, 756 tests)

## GitHub Actions CI and migration drift detection
- [ ] Before creating any production connection secret, identify whether a dedicated read-only migration-ledger role already exists
- [ ] If absent, report the proposed role and exact minimal grants before making database or workflow changes
- [x] Existing credential-free workflow runs tests and production compilation on pushes/pull requests to main
- [ ] Verify real GitHub runs and required `Test and build` merge check; Hari's GitHub API returns no accessible repositories, so provider-side enforcement is unverified
- [ ] Add the separate scheduled read-only migration-ledger comparison only after the restricted role is approved

## Product vendor persistence
- [x] Review the proposed vendor persistence and CSV design for clean, scalable architecture
- [x] Expose the existing product vendor link through the safe catalogue view without adding a table
- [x] Preserve the vendor through save, refresh, reopen, and resave
- [x] Display the saved vendor in product rows
- [x] Export vendor ID/name and safely resolve CSV imports by ID or exact name and city
- [x] Add view, form-persistence, ambiguity, and CSV round-trip regression coverage

## Members consolidation and Member360 (done)
- [x] Merge Members into All Users with URL-backed type filtering and compatibility redirects
- [x] Consolidate hours adjustment/history while preserving offline revenue recording
- [x] Add the authorized, dual-key Member360 page using existing data only
- [x] Add regression coverage and mobile-layout safeguards (91 files, 778 tests; authenticated preview access correctly denied for the available non-admin account)

## Training and self-directed logs (done)
- [x] Add explicit self-directed/coach-directed session classification and immutable ownership
- [x] Enforce private self-directed access while preserving coach, student, and city-admin rules
- [x] Add `/training` routes, Training labels, My Training, Coach Sessions, and completed-log flow
- [x] Suppress coaching notifications and all billing/booking effects for self-directed logs
- [x] Add regression coverage to the existing `npm test` CI command and confirm the test total increases
- [x] Run the full suite, production build, and mobile/authenticated browser verification (93 files, 783 tests)

## Training audit corrections (done)
- [x] Complete the visible Training rename and correct the audited security, validation, error-state, testing, and documentation gaps
- [x] Keep coaches in their existing student workspace; do not add My Training or Start Training to the coach experience
- [x] Deny coach accounts at `/training`, `/training/start`, and the underlying self-directed database operation; verified with a real coach account
- [x] Verify production trusted snapshots against an active focus/drill using an isolated QA account, then delete the QA record

## Auto-gift endpoint authorization (complete)
- [x] Derive the gift recipient only from a validated signed-in user session
- [x] Reject missing, anonymous, invalid, service-role, and other non-user tokens before privileged database access
- [x] Key both rule-limit checks and gift/notification writes from the same validated user ID
- [x] Test anonymous denial, privileged-token denial, forged-user denial, and the legitimate sign-in path
- [x] Deploy, run the full regression suite and build, then confirm resolution with a fresh security scan

## Quick Competition entry ownership (approved scope)
- [x] Reconfirm the live `qc_entries` row count (0 rows); no legacy-row transition is required
- [x] Replace editable-phone ownership with validated authenticated user identity
- [x] Add a hashed, high-entropy guest claim flow with no direct guest table access
- [x] Secure create, retry, payment verification, and status retrieval without changing payment accounting
- [x] Test cross-user phone impersonation, own-entry access, and cross-guest isolation
- [x] Deploy, verify production policies/grants and isolated QA paths, then run full regression/build/security scan

## All Users column sorting (approved)
- [x] Add whitelisted server-side sorting (_sort/_dir) to the shared customer report; unknown values last, name tiebreaker, invalid keys rejected
- [x] Make every Users table column except Actions clickable with direction indicators; export follows the same ordering
- [x] Run rule and regression tests: 102 files / 865 tests passed; preview build OK
- [ ] Verify sorting visually with authorized admin access: requesting-user session still shows Access Denied
- [answered] Q: current payment hold — none today

## App calendar as booking record of truth (approved plan)
- [x] 1. Bay types + Bunker hours settings + bay-type pricing (database, admin screens, all booking screens)
- [x] 2. App availability, 10-min payment holds, auto bay choice by type; checkout closes at 10 min; late payment books if free, else refunds
- [x] 3. Staff Day View (all bays) with block-outs
- [x] 4. "Not on Google yet" markers with retry; per-city switch in Locations
- [ ] Publish the site (pricing screen on live site needs it)
- [ ] Gurugram go-live: Bunker/Standard prices, payment account, invoice/GST profile (owner to supply), then switch on app calendar
- [ ] Chennai/Bengaluru: re-enter Google-only blocks as app block-outs, then switch each city
- [ ] Visual check of Day View with a staff account (current preview account has no staff access)

## Adjust Hours dialog is hours-only (approved)
- [x] Remove Paid By and Amount Collected from the Adjust Hours dialog; Add Hours confirms on hours + reason + note
- [x] Drop the now-unreachable offline hours-sale ledger write from that dialog (members buy hours by gateway; cash sales go through Finance)
- [x] Tests: dialog render guard + revenue single-writer rule; 119 files / 1033 tests passed; build OK
- [ ] Visual check in the live Users screen with an admin account (minted preview session is not an admin)
