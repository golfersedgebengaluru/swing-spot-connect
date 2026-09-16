# Complete the Training implementation

## Why gaps remained

The build focused on the new member self-directed flow but did not finish the visible admin wording. Verification also emphasized successful routes, compilation, and mocked behavior rather than tracing every approved requirement through the interface, database operation, permissions, and failure states. The implementation was therefore functional at its core but not complete against the approved checklist.

These were execution and verification misses, not unavoidable limitations. They should have been addressed before completion was reported.

## What will be corrected

### 1. Finish the Training rename
- Change the admin sidebar label, admin page title, and management heading from **Coaching** to **Training**.
- Retain internal `coaching` identifiers, table names, tab keys, and legacy `/coaching` links.
- Review remaining visible wording individually: preserve **coaching** where it specifically describes paid coach-led services, and use **Training** for the combined feature area.

### 2. Preserve the existing access split
- Keep coaches in their existing student workspace; do not add **My Training** or **Start Training** to the coach experience.
- Keep the coach roster, assignments, booking linkage, billing, and hours logic unchanged.
- Keep self-directed Training available to signed-in registered users and members. Pre-registered profiles remain excluded because they have no linked sign-in account.

### 3. Complete and constrain self-directed editing
- Support the approved editable fields: date, city, notes, progress, and resource links.
- Replace unrestricted city text with the existing city source and validate the selected city.
- Keep focus/drill history and identity/type fields immutable.

### 4. Harden self-directed completion
- Replace the current database operation through a fresh migration so submitted focus/drill IDs are checked against active library records.
- Derive frozen names, instructions, objectives, videos, and repetition snapshots from trusted library rows instead of trusting browser-supplied snapshot text.
- Reject unknown, inactive, or mismatched focus/drill selections atomically; no partial session will be saved.
- Preserve owner derivation from the signed-in user and keep self-directed records private.

### 5. Make separation explicit in every path
- Add an explicit `coach_directed` check before coach-style email and in-app notifications.
- Explicitly restrict Member360 training history to coach-directed sessions so it never depends only on database filtering for privacy.
- Keep self-directed deletion separate from booking cancellation, calendar, billing, invoices, revenue, and hours deductions.

### 6. Add proper failure states
- Give **My Training** and **Coach Sessions** independent loading, error, empty, and retry states.
- Ensure one failed history does not hide or block the other.

### 7. Close the verification gap
- Add CI regression tests for all visible Training labels and legacy routes.
- Test registered users and members accessing self-directed Training, coaches remaining in their existing student workspace, and pre-registered profiles being excluded.
- Test owner-only self-directed access, admin/coach exclusion, coach-directed permissions, immutable identities/type, invalid session types, and forged/inactive library IDs.
- Test explicit notification suppression and separation from booking, calendar, billing, revenue, and hours logic.
- Test independent loading/error states, Member360 filtering, edit/delete behavior, and action visibility.
- Run the complete test suite and confirm the test count increases beyond 783.
- Verify authenticated member and coach flows on desktop and mobile, including the intended access split, no horizontal overflow, and clear errors.
- Verify the production database policies, function grants, and trusted snapshot behavior after migration.

### 8. Update supporting documentation
- Update the user/admin documentation and project checklist so they describe the actual Training experience and retained paid-coaching behavior accurately.

## Completion standard

The work will not be reported complete merely because it builds. Completion requires the approved checklist to be traced requirement by requirement, full CI tests to pass with a higher count, production permissions to be inspected, and authenticated member/coach browser checks to succeed. Any role that cannot be verified will be reported explicitly.
