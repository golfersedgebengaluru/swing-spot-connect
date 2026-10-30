# CRM foundation: customer reporting and follow-ups

## Goal
Build on All Users and Member 360 so staff can reliably find customers, run useful reports and manage follow-ups. Keep one customer identity and reuse existing booking, finance and permission rules.

No application changes are made during planning. Approval authorizes the phases below, in order, with a verification checkpoint after each phase.

## Scope and guardrails
- Keep All Users as the directory and Member 360 as the customer detail view; include guests without requiring login accounts. No additional CRM directory or navigation rename in this release.
- Keep customer status separate from booking channel and corporate affiliations. Preserve existing membership classifications; do not create an editable “Online” customer type.
- Cities come from configured locations. Separate Preferred City from Visited Location; do not silently change a customer's preferred city based on visits.
- Preserve payment, pricing, cancellation, GST, invoice dates, corporate billing and issued financial records. Reporting is read-only.
- Reuse existing consent and email history where reliably linked. Booking contact information does not imply marketing permission.

## Phase 1 — Trustworthy customer coverage and metric definitions

### Customer reconciliation
- Check completed online bookings against existing profiles using both profile ID and login user ID, then reliable booking links and contact evidence.
- Investigate the seven completed bookings without an email-matched profile; phone matching may already explain them. Do not assume seven missing customers.
- Produce a small reconciliation result: linked, safely recoverable, ambiguous, or missing contact details.
- Repair only confirmed omissions through an authorized, repeat-safe operation. Do not automatically merge conflicting email/phone records or rewrite historical invoices and payments. Ambiguous cases require administrator confirmation.
- Verify guest-to-registered account claiming preserves bookings, memberships and future CRM activity.

### Agree on reporting rules in code and tests
- **Visits:** reuse the existing qualifying past-booking rule and parent-booking deduplication. Cancelled, pending and unpaid bookings do not count; retain eligible corporate deferred/invoiced sessions. Linked training is not another visit. These are qualifying recorded sessions, not independently verified physical attendance.
- **Last visit:** derive from that same qualifying set, not simply the latest past confirmed booking. **Next booking:** earliest eligible future booking, excluding cancelled/failed records.
- **Net customer spend:** confirmed signed revenue ledger only; refunds subtract once. Never add invoices, orders and ledger amounts together. Advance deposits and prepaid-hour consumption are not additional sales. Keep corporate-paid activity distinguishable from personal spend; do not allocate a corporate invoice to individual members without reliable source attribution.
- Keep currencies separate; use the existing business revenue date for spend and location-local booking dates for visit reporting. Unlinked financial rows remain visible as reconciliation exceptions rather than being assigned by guesswork.

**Existing issues to address within this scope:** Member 360's commerce “Total spend” currently totals only its latest eight orders. Customer Finance's lifetime formula subtracts refund amounts even though ledger refunds are already negative. Reuse one signed-ledger calculation for the CRM total and that existing lifetime figure; do not change financial write paths.

**Checkpoint:** explain remaining reconciliation exceptions and verify sample customer totals against underlying records before adding reports.

## Phase 2 — A reportable customer directory

### Directory and Member 360
- Add Last Visit, Visit Count, Next Booking and Net Spend to the customer directory, using compact columns and existing location/financial visibility permissions.
- Show consistent summary figures in Member 360. Keep recent commerce history separately labelled; it must not masquerade as lifetime spend.
- Filters: customer status, Preferred City, Visited Location, visit-date range, spend-date range, visit count, spend range, and booking channel.
- The top location selector scopes location-based activity. A separate Preferred City filter narrows customer preference. Customers with neither a matching preference nor activity must not appear merely because their preferred city is blank. This resolves the previously identified Bengaluru-list issue.
- Label filtered-period figures separately from lifetime figures. Site administrators never gain cross-city or financial access through filtering or export.

### Four reusable report presets
1. **First-time visitors:** first qualifying visit falls in the selected period; determined from lifetime qualifying history, not just the filtered window.
2. **Repeat visitors:** at least two distinct qualifying visits in the selected period.
3. **Inactive customers:** at least one previous qualifying visit, none during the last 60 days, and no upcoming booking; customers who have never visited are a separate group.
4. **Low-hours members:** an existing hours account with remaining hours at or below the current one-hour low-hours threshold.

These are preset filters over the same directory, not four separately maintained reports. Presets remain adjustable through ordinary filters.

### Export
- Export all rows matching the active filters, not only the visible page, with stable ordering.
- Include the selected scope, reporting dates, currencies and metric definitions in an accompanying export summary.
- Preserve field escaping and protect spreadsheet exports against formula injection. Exclude restricted contact/financial fields according to permissions.

### Booking channel
- Record Online or Staff-created on new bookings at the trusted creation path, without changing payment or customer status.
- Recover historical channel only from reliable origin evidence. Gateway name alone is insufficient; uncertain history remains Unknown.
- Channel filtering means “has a qualifying booking through this channel in the selected booking period,” not an exclusive customer label.

**Checkpoint:** compare directory, Member 360 and exported totals for the same scope; verify complete exports and all four presets.

## Phase 3 — Minimal relationship management
- Add a customer activity section in Member 360 for staff notes and follow-ups.
- A follow-up has a subject, responsible staff member, due date and Open/Completed status; completing it records who and when.
- Show creator and timestamps for notes and follow-ups. Preserve an audit trail for changes; notes are not a second copy of booking or training notes.
- Add one Follow-ups Due view, filterable by location, responsible staff member and overdue/due date, with a direct link to Member 360.
- Give each activity an explicit location context so shared customers do not expose another city's private notes to site administrators. Assignment does not grant access to a customer or city.
- Preserve these records during account claiming. Restrict access to authorized staff; no public or customer self-edit access.

**Checkpoint:** authorized staff create a note, assign a follow-up, see it in the due list, complete it, and read the completed result back. Verify cross-city and non-admin denial.

## Technical approach: clean code and controlled credit usage
- Use existing profiles as the identity source; reuse dual-key resolution, membership classification, location authorities, UI controls and test infrastructure.
- Introduce one focused customer-summary/query layer consumed by the directory, Member 360 and export. Keep metric definitions centralized with concrete fixtures; avoid parallel formulas in components and SQL by comparing query results against those same fixtures.
- Apply filtering, aggregation and pagination server-side with authorized read operations. Never fetch each customer's complete history to calculate a list, and do not issue one request per customer.
- Inspect existing indexes and query plans before adding targeted indexes. Reuse query caching and invalidate only affected summaries after supported changes.
- Do not add nightly aggregation jobs, materialized caches, AI services, a generic CRM framework or a second event store for existing operational data. Use on-demand summaries initially; reconsider only if measured latency requires it.
- Add only the minimal profile-linked note/follow-up storage and booking-source field needed. Any new public tables receive explicit grants, RLS and city-scoped authorization; privileges remain in the existing protected role system.
- Make schema changes additive and account-claim handling transactional. Record structural decisions in AGENTS.md during implementation.
- Build and verify each phase before starting the next. Run focused tests while iterating and the full regression suite at release, rather than repeatedly rerunning unrelated work. This limits rework; no numerical credit savings are claimed.

## Acceptance and release checks
- Fixtures cover guest identity, later registration, duplicate contact ambiguity, split bookings, linked training, cancelled/unpaid bookings, corporate sessions and next-booking eligibility.
- Assert signed refunds, non-duplicated sales, separate currencies, correct business dates and restricted corporate attribution.
- Assert strict Bengaluru scoping, blank preferred cities, cross-city visitors, 60-day boundaries, first/repeat visit definitions and the one-hour threshold.
- Assert complete filtered exports, identical displayed/exported summaries and denial of unauthorized reads/writes/exports.
- Run account-claim tests for notes and follow-ups, plus assignment and completion audit checks.
- Complete real authorized admin browser checks with guest and registered customer data, including a permitted city-admin session. If sessions cannot be supplied, report that checkpoint as blocked rather than claiming completion.
- Re-read the implementation roadmap, run the full regression suite and confirm the current preview is error-free. Publishing remains a separate explicit action.

## Not in this release
Marketing campaigns, automatic outreach, tags, sales pipelines, lead scoring, WhatsApp/SMS integration, bulk deduplication, a pending-payment enquiries screen, or a complete communications timeline. These can follow once the directory and follow-up workflow are reliable.

## Delivery priority
Phases 1 and 2 deliver the largest immediate reporting improvement. Phase 3 adds the smallest practical CRM workflow. No external service or AI subscription is required for this scope.