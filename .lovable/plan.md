# CRM Phase 3 — Customer notes and follow-ups

## Scope reconsideration — not ready for implementation
The user prioritizes essential centre operations and staff ease of use, without bells and whistles. General customer notes are not necessary and should be removed from the proposed release. The proposal below is superseded pending agreement on whether a minimal customer/action/staff/due-date/completed follow-up list addresses a real operational need. No Phase 3 implementation is approved.

## Outcome
Staff can record a customer conversation, assign the next action, find what is due, and record completion. Build on Member 360 and All Users, not a separate CRM directory.

Phases 1–2 are implemented, with authorized browser and actual account-claim checks still outstanding. Phase 3 must not be called fully verified until its own authorized end-to-end checks pass.

## What will be added

### 1. Customer activity in Member 360
- Add a staff-only Notes & Follow-ups section alongside the existing customer history.
- Notes contain the note text, location, author and timestamp. Staff can correct notes; retain the previous version and who changed it. No permanent deletion in this release.
- Follow-ups contain a subject, optional detail, location, responsible staff member, due date and Open/Completed status.
- Show open follow-ups and completed history. Completion records who completed it and when, with an optional outcome note; reopening or reassignment retains its history.
- Support guests and registered customers without creating login accounts or duplicating existing booking/training notes.

### 2. One Follow-ups view in admin
- Default to the signed-in staff member's overdue and due-today open tasks within permitted locations.
- Filter by location, responsible staff member, due-date range and Open/Completed status. Authorized staff can also view all permitted tasks.
- Show customer, subject, due date, owner and status; distinguish overdue items clearly.
- Open the customer's Member 360 or mark the task completed from the list. Completion from either place updates both views.
- No extra report columns in All Users. Preserve the visible three-dot menu, every existing customer action, filters and exports.

### 3. Safe location access and preserved history
- Every note and follow-up has an explicit location selected from configured locations. Do not infer it from customer preference or expose another location's notes because a customer visits both.
- Only existing authorized admins/site admins may read or write activities within their allowed locations. Customers and unauthenticated users have no access.
- Assign only to eligible authorized staff with access to the activity's location; assignment itself never grants access.
- If staff access changes, reject further unauthorized edits and show the task as needing reassignment to an authorized colleague.
- Keep notes, tasks and their change history attached to the same customer when a guest later registers or the existing account-claim process merges their profile.
- A due date is a location-calendar date; completion and audit timestamps are stored in UTC. No automatic email or marketing permission is implied.

## Clean implementation and controlled scope
- Reuse existing profile identity, staff roles, configured cities, Member 360, form controls and admin navigation.
- Add only focused note, follow-up and immutable change-history storage, with explicit grants and city-scoped access rules. Use one shared authorized operations layer for both views.
- Validate customer, location, assignee and status changes on the backend. Prevent duplicate creation on retry and conflicting edits from silently overwriting one another.
- Extend the existing transactional account-claim compatibility path rather than adding another identity or merge mechanism.
- Load activity on demand with pagination; refresh only affected activity after saving. No per-customer task requests in the directory, background jobs, external services or AI features.
- Record the structural rules in the existing architecture guide during implementation.

## Delivery and acceptance checks
1. Add secure storage and account-claim preservation; test permitted access, non-admin denial, cross-city denial, valid assignment, retry safety and audited status changes.
2. Add Member 360 notes and follow-ups using the same authorized operations.
3. Add the Follow-ups list and verify filtering, overdue date boundaries, completion and reassignment.
4. Run focused tests while developing, then the complete regression suite once. Confirm reporting, financial figures, bookings and the existing customer menu remain unchanged.
5. Verify a real authorized staff flow: create a note, assign a follow-up, find it in the due list, complete it and read back its outcome. Verify a permitted city-admin flow and denial for another city. Verify actual guest-to-registered activity continuity.

Authorized browser verification previously lacked an admin session. Retry authorized access during implementation; if it remains unavailable, report that checkpoint as blocked rather than claim a tested release.

## Not included
Tags, pipelines, lead scoring, automated reminders, bulk tasks, WhatsApp/SMS, promotional email, a communications inbox, historical identity repairs, booking-source changes or changes to payment, hours, points, advance, GST and corporate billing.

## Approval boundary
This is the proposed Phase 3 scope only. No application code or database changes before approval; publishing is separate.