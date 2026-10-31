# Architecture rules

- Build GSTR-1 HSN totals and audit breakdowns from one pure invoice-line projection; keep reporting read-only so historical invoice values cannot be overwritten.
- Treat GSTR-1 workbooks as auditor-review exports, not portal-upload files; expose missing source metadata and unsupported filing sections rather than claiming completeness.
- Derive corporate membership only from corporate_account_members; persist the payer on each booking so membership edits cannot move historical billing.
- Use transactional authorized operations for corporate registration and membership edits; linked training sessions inherit booking attribution and are not separate billable sessions.
- Preserve pre-registration memberships during existing email-claim merges with a profile-delete compatibility trigger; never introduce a second editable membership source.
- Customer directory, Member360 and lifetime finance summaries use the same authorized read-only customer-report operation; signed ledger totals and qualifying visit rules must not be duplicated in presentation code.
- Customer reporting uses explicit booking/payment identity links and separates personal revenue from corporate activity; unknown provenance remains unknown rather than being inferred from gateway or contact similarity.
- Dashboard attention lists reuse customer-report selection and ordering, and first-arrival checks reuse its visit predicate in one authorized batch; never introduce per-customer history requests or billing writes.