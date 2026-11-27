# Simple age declaration and parental-consent repairs

## Goal
Close the existing technical gaps with one completion flow for email, Google and Apple accounts. Reuse the current parental email and approval page; do not add identity verification, document collection, new staff workflows or a new sign-in system.

This is a technical safeguard, not a claim of verified age, verified guardianship or full legal compliance.

## Member experience
1. **Simpler email sign-up:** keep name, mobile, email and password. Move age and terms acceptance to the shared signed-in completion step, so they can be reliably saved. Stop requiring a birth date; preserve any birth dates already recorded without adding another birth-date question.
2. **One ordered completion flow:** retain existing Apple details and mobile checks, then show age/consent completion. Never stack dialogs. Include a sign-out option and visible retry when a save fails.
3. **Adults:** answer “Are you 18 years or older?” and accept the current Terms and Privacy Policy. Save the declaration and acceptance together, with timestamps and the actual policy versions. Ask once, except when a policy update requires fresh acceptance.
4. **Under-18s:** answer No, provide a parent/guardian email and request consent. Show a waiting state with resend and sign-out options. Reuse the current parent approval/decline page. Do not describe an email approval as identity verification.
5. **Returning members:** missing age declarations or consent records trigger the same completion step on their next sign-in or restored session. Preserve existing valid approvals and original consent records. Do not silently overwrite known under-18 or pending/declined statuses through the adult option; a declared minor stays in the parent flow unless adulthood is established from an existing birth date or an authorised correction.

## Repairs included
- Save declarations and policy acceptances only after a session exists, through an authorised, atomic operation; stop the unreliable post-sign-up profile writes.
- Rework the existing parental request to support a declared minor without requiring a birth date. Check all returned save and email outcomes before showing success.
- Give new consent links a **48-hour lifetime**, make them single-use, invalidate older links on resend and apply a **60-second server-enforced resend cooldown**. Existing links without an expiry require a fresh request.
- Tie approval to the current request and parent address. Handle expired, already-used, declined and failed-delivery states accurately. Keep the saved pending request recoverable if email delivery fails.
- Protect age/parental-status fields from direct member edits. Members cannot set themselves to parent-approved, clear a pending request or bypass the consent decision with a direct request.
- Record approval/decline with its request reference, timestamp and the notice/policy versions presented. Make repeated submissions safe and leave original consent evidence intact.
- Reuse the existing terms-update mechanism rather than presenting a competing acceptance banner and dialog.

## What gets restricted
For signed-in members whose age/consent is incomplete, pending or declined, block member-only activity until completion: new self-service bookings, checkout creation, hours-paid bookings, coaching requests, league participation and other member write actions. Apply the rule on the server as well as the screen; public pages, consent completion, sign-out and necessary account/support access remain available.

Do not cancel existing bookings, alter paid orders, stop payment confirmations/refunds or block authorised staff from managing existing customers and junior sessions. Guest booking remains unchanged: this change does not introduce age verification for anonymous guests or admin-created profiles that have never signed in.

## Technical approach
- Extend the existing AuthContext completion sequence and reuse current dialog, email, consent-log and parental approval patterns.
- Keep one authoritative age/parental-consent state and one shared server eligibility rule. Store the declaration separately from protected parental approval evidence; do not treat editable auth metadata as proof of approval.
- Use a protected declaration record with explicit states and versioned audit events. Keep existing profile DOB/parental fields compatible without leaving two independently editable sources of truth.
- Inventory signed-in member write entry points before implementation and apply the shared rule consistently, preserving service-only payment recovery and staff-authorised operations.
- Read status once per session and refresh after a change, without polling or per-page duplicate checks. Reset cached eligibility on sign-out/account change; a failed status lookup must not grant access.
- Use migrations and existing test infrastructure; no new paid provider or AI calls. Normal database and parental-email usage still applies.
- Deploy compatible server changes and publish the matching frontend together; do not enable an enforcement rule while the published frontend cannot complete it.

## Verification
- Tests for exactly age 18 being adult, No entering the parent flow, all three sign-in methods reaching completion, and known minors not bypassing a pending/declined decision.
- Tests for atomic saves, denied direct status edits, self-approval attempts, unauthorised lookup attempts, policy-version recording and missing-status failures.
- Tests for 48-hour expiry, single use, request replacement, 60-second resend limits, email failure and repeated approval submissions.
- Test the shared eligibility rule at member write entry points, plus staff operations and already-paid payment recovery remaining unaffected.
- Exercise adult completion and minor request → email delivery → parent approval → allowed member action end-to-end using test accounts. Verify a blocked action before approval, mobile/Apple completion ordering and mobile/desktop layouts. Report any delivery limitation rather than claiming an unverified pass.

## Unchanged / out of scope
- No identity documents, DigiLocker, guardian identity checks or in-person verification.
- No changes to historical bookings, invoices, GST, customer balances, payment routing, membership recognition or staff-created customer identities.
- No automatic consent granted from Google sign-in, a missing birth date or a previously unchecked checkbox.
- No legal-compliance certification, separate privacy programme or changes to the wording of legal policies without approved content.

## Approval outcome
Implement the above technical repairs as one focused change, with regression tests and a coordinated release. No application or database changes have been made for this plan.