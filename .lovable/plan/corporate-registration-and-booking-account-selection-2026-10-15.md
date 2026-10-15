# Corporate Registration and Booking Account Selection

## Recommendation

Separate **which companies a member belongs to** from **which company pays for a particular booking**. This provides one-step registration without letting later membership changes move old sessions between invoices.

The current app stores only one company on the member and finds monthly sessions through current membership. Adding a multi-select alone would risk showing the same session under multiple companies; booking-level attribution is necessary.

## 1. Register User

In Admin → All Users → Register User:

- Add a **Corporate account user** toggle, off by default.
- When enabled, show a searchable checkbox list of active corporate accounts available to the administrator.
- Allow one or more selections; require at least one while the toggle is enabled.
- Keep name, email, phone and existing account-claim behaviour unchanged.
- Save the member and all selected memberships together: either everything succeeds or nothing is created. Disable repeated submission and preserve form values on failure.
- Existing-email matches show the existing member instead of creating a duplicate or silently changing their assignments.

The toggle is a form control, not a second stored corporate-status flag. Corporate status comes from the member's assignments.

## 2. Admin Booking

After choosing the member:

| Eligible corporate accounts | Behaviour |
|---|---|
| None | Existing standard payment/hours flow |
| One | Automatically select it and show its name |
| Multiple | Show **Bill to corporate account**; require an explicit selection before confirmation |

- Clear the selection when the member changes; revalidate when the city changes.
- Show the selected account on the final confirmation and saved booking details.
- Corporate bookings retain monthly deferred billing; no per-session payment or hours deduction is introduced.
- Apply the same selection to admin-created bay and coach-directed sessions, including existing backdated entries. Do not treat self-directed training logs as billable bookings.
- No primary/default corporate setting, split billing, or new personal-payment override in this change.

Example: a member belongs to Company A and Company B. A booking assigned to B appears only in B's monthly billing, even if the member later leaves B.

## 3. Existing Member Management and Monthly Billing

- Reuse the same account picker when changing corporate assignments on a member's profile.
- Corporate Accounts → Members uses the same memberships: adding someone to B no longer removes them from A.
- Removing membership prevents future selection; it never removes historical sessions from that company's billing history.
- Monthly billing and session exports select sessions by the company recorded on the session, not the member's current memberships.
- Calendar labels use the selected booking account, not whichever company happens to be on the member today.
- Preserve existing city-specific invoice identity, GST calculations, billing-item selection and payment terms.

## 4. Safe Transition of Existing Data

- Copy existing single-account memberships into the new relationship without duplication.
- Inspect existing invoiced and deferred sessions before enabling multiple assignments.
- Use an existing corporate invoice or other reliable historical evidence to attribute old sessions where available.
- Do not assume a member's current company necessarily paid for every past session. List ambiguous sessions for admin confirmation and prevent them from being silently billed to the wrong company.
- Preserve issued invoice values, credit notes and historical financial records.

## Technical Design — Minimal Structural Change

- Add one membership relationship table linking existing profiles and corporate accounts, with a unique profile/account pair and audit timestamps. No duplicate users, company records or billing system.
- Add nullable corporate-account references to existing bookings and coaching sessions. The booking reference is authoritative; linked coaching rows carry the same attribution, without double counting sessions.
- Retire the old single-account profile field from application use after compatibility readers are converted; leave it in place and mark it deprecated. Do not maintain two editable membership sources.
- Extend existing corporate hooks, registration form, member assignment control, manual booking flow and monthly billing queries. Reuse one focused multi-account picker and existing query caching.
- Use an authenticated, admin-authorized transactional database operation for registration plus memberships. Membership changes also validate all requested accounts before committing.
- Enforce active membership and administrator city/access permissions on the server before accepting a corporate booking. Browser-supplied account IDs alone never authorize deferred billing.
- Apply explicit grants and row-level policies. Members cannot add themselves to companies or modify who pays; anonymous access is denied.
- Preserve profile-ID/auth-user-ID resolution and the existing account-claim/merge workflow, transferring memberships safely if a profile merge occurs.
- Audit every old single-account reader, including city visibility, calendar labels and member/public booking paths. Preserve non-admin payment behaviour; no implicit corporate choice for a multi-account member outside this approved admin flow.
- Keep the existing monthly invoice workflow, but revalidate selected sessions' account, city and billable state server-side before committing billing changes so forged or stale selections cannot mix companies.

## Verification and Cost Control

Implement one shared membership source and account picker rather than separate registration and booking implementations; batch membership writes and reuse cached account lists.

Add focused regression tests for:

1. Toggle off, single account and multiple accounts; enabled with no selection is rejected.
2. Failed assignment leaves no partially registered member; duplicate registration does not create extra memberships.
3. Multiple-account booking requires a choice; switching member/city clears invalid choices.
4. Invalid, inactive, unassigned and unauthorized account selections are rejected server-side.
5. Each session appears in only its selected company's billing; membership removal does not move history.
6. Linked coaching sessions preserve attribution without duplicate invoicing.
7. Existing single-company, standard payment, hours and account-claim flows remain correct.

Run focused tests first, then one full regression run and check the preview build. Verify registration → two memberships → booking for Company B → B's billing history using an authorized admin session and isolated QA records. Remove QA data afterward; report any access blocker rather than claiming verification.

## Approval Scope

Approve registration-time multiple assignments, explicit admin booking attribution, shared member management, necessary billing-reader/security updates and safe legacy-data handling. No new pricing rules, payment methods, cancellation/refund changes, public corporate checkout or unrelated fixes.