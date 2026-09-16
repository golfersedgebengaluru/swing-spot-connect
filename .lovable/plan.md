# Secure Quick Competition Entry Ownership

## Goal

Remove phone numbers from competition-entry authorization while preserving paid entry, payment recovery, staff administration, refunds, and guest checkout.

## Ownership model

- Add a nullable authenticated owner ID to each competition entry. Signed-in entrants are linked only from their validated session; client-supplied user IDs are never accepted.
- Add a high-entropy guest claim secret for anonymous checkout. Store only its hash and return the raw secret once to the creating browser.
- Keep phone only for contact and duplicate-entry checks. It will never grant read or update access.
- Existing production contains no competition entry rows, so no unsafe legacy ownership inference or phone-based backfill is required.

## Database security

- Add the owner and guest-claim hash columns, indexes, and constraints to the existing `qc_entries` table.
- Remove the phone-match owner policy and public direct-insert policy.
- Allow signed-in entrants to read only rows whose owner ID equals their authenticated ID.
- Keep existing tenant/franchise administrator access unchanged.
- Keep guest rows inaccessible through direct table queries; guests use a narrow server endpoint with their entry ID and claim secret.
- Review and explicitly set table/function grants so anonymous clients cannot directly read, insert, update, or delete payment records.

## Checkout and payment flow

- In order creation, distinguish a validated user session from the normal anonymous checkout key. Reject invalid or privileged tokens instead of treating them as guests.
- Derive signed-in ownership from the validated session. For guests, generate the claim secret server-side and return it with the new entry ID.
- Stop updating an existing pending row merely because its phone matches. A retry may reuse a row only when the same authenticated owner or correct guest claim proves ownership; otherwise return a generic duplicate-entry response.
- Store the guest entry ID and claim secret in same-tab session storage, not in a URL, logs, database plaintext, or user-editable profile field.
- Require the same authenticated owner or guest claim during browser payment verification, in addition to the existing Razorpay signature.
- Add a minimal guest-status endpoint that validates the claim hash and returns only confirmation fields, never phone or Razorpay identifiers.
- Preserve webhook and scheduled reconciliation, which already rely on verified payment/order data and server credentials rather than phone ownership.

## Application updates

- Update the join page to carry the secure guest claim through creation and verification and retain it across a same-tab refresh.
- Update existing generated table typing for the two added columns; do not introduce a parallel entry model or table.
- Audit every competition entry reference again after implementation to confirm no phone-based authorization remains.

## Regression and production verification

- Prove changing a profile phone cannot reveal another entrant’s entry.
- Prove a signed-in entrant can read their own entry and cannot assign another owner during checkout.
- Prove guest A can access entry A with its secret, cannot access guest B’s entry, and cannot gain access through a matching phone or guessed/editable value.
- Prove missing, incorrect, malformed, and cross-entry guest claims are rejected.
- Prove legitimate signed-in and guest create/verify flows still work, including duplicate/retry behavior, while webhook and scheduled finalization tests remain green.
- Verify the deployed production policies and grants directly. Use isolated QA rows for live owner/guest isolation checks and delete them afterward; do not charge a real payment method.
- Run focused tests, the full regression suite, production build, and a fresh security scan. Mark the finding resolved only when the fresh scan removes it.

## Technical constraints

- No new tables, parallel payment stores, or editable-field authorization.
- Never store the raw guest claim secret; compare a SHA-256 hash in constant time inside the server endpoint.
- Do not expose guest claims in URLs, telemetry, payment notes, or error messages.
- Do not alter amount calculation, Razorpay signature verification, revenue capture, refund rules, or competition scoring.