# Training: self-directed logs and coach sessions

## Direction

This is a stronger design than the earlier proposal. The explicit `session_type` removes ambiguous identity inference, keeps coach-led and private self-directed records safely separated, and leaves room for future sharing without creating a second training system.

## What will change

### 1. Training navigation and routes
- Rename member-facing **Coaching** labels to **Training** and point navigation to `/training`.
- Add `/training/:sessionId` for session details.
- Keep `/coaching` and `/coaching/:sessionId` as compatibility redirects so existing links and notifications continue to work.
- Keep internal component, hook, query-key, and table names using `coaching`; this is only a visible product-language change.
- Keep the existing coach workspace and admin coaching-library structure functionally unchanged; only visible top-level wording becomes Training where appropriate.

### 2. One Training area, separated by record type
For a signed-in user, the Training page will provide:
- **My Training** — only their `self_directed` completed logs, with a **Start Training** action.
- **Coach Sessions** — only `coach_directed` sessions recorded for them, preserving the current read-only student experience.
- Coaches retain their existing student roster, session creation, booking linkage, and session editing workspace. Their private self-directed logs remain separate and are never exposed through coach/student queries.

Pre-registered profiles have no linked login and therefore cannot enter or create Training records. Once linked to a login, the ordinary signed-in flow applies; no parallel membership model will be added.

### 3. Start Training and completed-log flow
- Reuse the current active focus/drill library, picker, snapshots, instructions, videos, recommended repetitions, drill notes, and progress summary.
- Present selected drill details while the user trains, then save only when they choose **Complete Training**.
- Require a valid city from the existing city source, defaulting from the user's existing profile/city context when available.
- Create the session with:
  - `session_type = 'self_directed'`
  - `student_user_id = auth.uid()`
  - `coach_user_id = auth.uid()` as the existing owner field
  - no booking, invoice, corporate invoice, billing action, or hours deduction
- Reuse the existing frozen session-focus and session-drill history rows. If a dependent history write fails, the new session will not be presented as successfully completed; cleanup/error handling will prevent a misleading partial log.
- A completed self-directed log may edit its date, city, notes, progress, and resource links. Focus/drill snapshots remain immutable, matching the existing historical-record design.
- Self-directed delete directly removes the private log and cascades its history rows. It will not call booking cancellation or calendar-sync logic.

### 4. Minimal schema and permissions migration
- Add `coaching_sessions.session_type` as constrained text: `self_directed | coach_directed`.
- Make it non-null with `coach_directed` as the default, so every existing session is explicitly and safely classified as coach-directed without rewriting its behavior.
- Add a database guard that prevents updates to `student_user_id`, `coach_user_id`, or `session_type` after creation. The UI will also omit/disable identity reassignment on edits, but the database remains the authority.
- Replace the overlapping session policies with explicit type-aware rules:
  - Self-directed: only the signed-in owner, with both identity fields equal to that user, may create, view, update, or delete.
  - Coach-directed: assigned coach may create/update/delete; student may view; current city-scoped admin access remains only for coach-directed records.
  - No coach, admin, site admin, or other member receives access to another user's self-directed records in this version.
- Update `can_read_coaching_session` and `can_write_coaching_session` so focus/drill history inherits exactly the same separation.
- Preserve child history as read/insert only; deletion continues through the parent cascade.
- Keep service access for operational maintenance, while browser access remains RLS-controlled. No new table, enum type, view, or parallel model will be created.

### 5. Notifications and existing paid coaching behavior
- Add an explicit `session_type` check before every coaching email/in-app notification path.
- Self-directed creation, editing, and deletion produce no coach-style email or notification.
- Coach-directed notifications retain their current behavior, with links updated to `/training/...` while old `/coaching/...` links remain valid.
- Do not change coach assignments, booking links, calendar cancellation, billing status, invoices, revenue, or hours deductions. Existing paid/coached flows continue on the coach-directed branch only.

### 6. Detail and list behavior
- Self-directed cards/details use **Self-directed** language and do not display the user as their own coach.
- Coach-directed cards/details retain coach identity and existing tool links, notes, progress, focus areas, and drills.
- Empty, loading, error, edit, and delete states will be independent for My Training and Coach Sessions.
- Reuse existing cards, dialogs, buttons, tokens, and mobile patterns; no nested scrolling. Verify the full flow at mobile width and desktop width.

## Technical safeguards and regression coverage

- Migration tests: allowed values/default/backfill, identity/type immutability, exact session and child-row RLS boundaries, admin exclusion from self-directed records, and unchanged coach-directed access.
- Hook tests: session-type filtering, authenticated identity derived from the session, no caller-supplied reassignment, self-directed save/delete paths, and coach-directed mutation behavior unchanged.
- Notification tests: no email or in-app notification for self-directed create/update/delete; coach-directed notifications still fire.
- UI/route tests: Training labels, `/training` primary routes, old-route redirects including detail links, My Training versus Coach Sessions separation, Start Training completion, immutable focus/drill history, and coach workspace preservation.
- Billing regression tests: self-directed logs never invoke booking, calendar, invoice, revenue, or hours-deduction paths.
- Run focused tests, the full `npm test` suite, production build, and authenticated browser checks for member, coach, and access-denied cases. Report any role that cannot be verified rather than claiming it passed.

## Explicitly not included
- Ongoing/editable training plans.
- Coach/admin visibility into private self-directed logs.
- Sharing flags or per-session/per-coach sharing permissions.
- New session/focus/drill tables or an internal rename from coaching to training.
