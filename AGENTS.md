# Architecture rules

- Build GSTR-1 HSN totals and audit breakdowns from one pure invoice-line projection; keep reporting read-only so historical invoice values cannot be overwritten.
- Treat GSTR-1 workbooks as auditor-review exports, not portal-upload files; expose missing source metadata and unsupported filing sections rather than claiming completeness.
- Derive corporate membership only from corporate_account_members; persist the payer on each booking so membership edits cannot move historical billing.
- Use transactional authorized operations for corporate registration and membership edits; linked training sessions inherit booking attribution and are not separate billable sessions.
- Preserve pre-registration memberships during existing email-claim merges with a profile-delete compatibility trigger; never introduce a second editable membership source.
- Customer directory, Member360 and lifetime finance summaries use the same authorized read-only customer-report operation; signed ledger totals and qualifying visit rules must not be duplicated in presentation code.
- Customer Finance lists invoice documents only; keep booking and advance histories separate, and never derive lifetime spend from displayed documents.
- Customer reporting uses explicit booking/payment identity links and separates personal revenue from corporate activity; unknown provenance remains unknown rather than being inferred from gateway or contact similarity.
- Customer reporting recognizes paid invoices linked through booking revenue and resolves invoice/hours customer identities without duplicating ledger amounts; directory visits/spend and sorting use the same explicit date range within top-level city scope, defaulting to all activity. Date bounds do not redefine the report's as-of cutoff or current account balances.
- Keep editable membership type distinct from derived customer status; display and sort each by its own source, and use future confirmed bookings consistently across customer-report views.
- Dashboard attention lists reuse customer-report selection and ordering, and first-arrival checks reuse its visit predicate in one authorized batch; never introduce per-customer history requests or billing writes.
- Member booking history resolves bay-calendar timezones server-side in one authorized read with request-local caching; shared display/export formatting uses explicit zones and labels unavailable zones as UTC rather than inheriting device settings.
- Gateway-paid booking cancellations use a service-only authorized database transaction and persisted receipt for booking, loyalty, refund, credit-note and advance writes; external calendar cleanup follows commit so failure cannot cancel a financially unchanged booking.