
# Bulletproof payment finalization

Goal: payments are finalized by exactly one authoritative path (the Razorpay webhook), with a cron backstop catching anything the webhook missed. The browser stops being load-bearing.

## Architecture (target)

```text
                       ┌──────────────────────────┐
   Razorpay  ───────►  │  razorpay-webhook        │  ── authoritative
   (payment.captured)  │  • verify signature      │      finalizer
                       │  • idempotency log       │
                       │  • → calendar-sync /     │
                       │    complete_hour_purchase│
                       │    / legacy team insert  │
                       └────────────┬─────────────┘
                                    │
                                    ▼
                            bookings / revenue /
                            calendar / email
                                    ▲
                                    │ same finalizers
   Browser (handler) ──►  Optional ping (best-effort, ignore failures)
   Cron every 5 min  ──►  reconcile-pending-payments  (backstop)
```

Three independent paths can finalize, but all converge through the same idempotent server code. Webhook is primary; cron is the safety net; browser is no longer required.

## Changes

### 1. Browser handlers become no-ops (presentation-level only)
Files: `src/components/admin/ManualBookingDialog.tsx`, the guest checkout handler, hour-purchase handler, legacy-league checkout handler.

- On Razorpay success callback: stop calling `calendar-sync` / `confirm-hour-purchase` from the client.
- Show "Payment received — finalizing your booking…" toast.
- Poll the relevant `pending_*` row by `razorpay_order_id` (every 2s, up to 30s) until `status='completed'`, then route the user to the success screen.
- If still pending after 30s, show "We received your payment. Your booking will appear in a few minutes — confirmation email on the way." (Webhook or cron will finalize.)

Net code delta: small. We delete the client-side finalize calls and add a tiny `useFinalizationPoller(orderId)` hook reused by all three flows.

### 2. Webhook stays authoritative (already deployed and tested)
No structural changes. Confirm it handles all three payload kinds via `notes.kind` (`guest_booking | hour_purchase | legacy_team`) and dispatches to the existing idempotent finalizers. Add the small bits that are missing:

- `payment.captured` → look up the matching `pending_*` row by `razorpay_order_id`; if `status='pending'`, invoke the same finalizer the cron uses. Idempotency is enforced by both `payment_events.razorpay_event_id` and `pending_*.status`.
- `payment.failed` → mark `pending_*.status='failed'` with the failure reason.

### 3. Cron backstop (every 5 minutes)
`reconcile-pending-payments` already exists and works. We just need to schedule it.

- Use `pg_cron` + `pg_net` to invoke it every 5 minutes (via `supabase--insert` since it embeds the project URL + anon key).
- Keep `RECONCILE_AGE_MIN = 3` (don't race the webhook) and `MAX_AGE_HOURS = 24` (stop trying after a day).

### 4. Order creation contract (small hardening)
`create-razorpay-order` already accepts a `notes` object. Make sure every caller (guest booking, hour purchase, legacy team) puts:
- `notes.kind` — one of the three types
- `notes.city` — used by the webhook to find the per-city secret
- `notes.pending_id` — primary key of the `pending_*` row, so the webhook can finalize with one lookup instead of guessing the table

This is the only change that touches multiple call sites and it's a 2-line addition each.

### 5. Tests (Vitest + existing edge-function harness)
Add to `src/test/edge-functions/payment-reconciliation.test.ts`:

- Webhook routes by `notes.kind` to the correct finalizer for each of the three payload types.
- Webhook is idempotent: replaying the same `razorpay_event_id` does not create duplicate bookings/transactions.
- Cron skips rows younger than `RECONCILE_AGE_MIN`, finalizes paid orders, marks unpaid >30 min as `failed`, ignores rows older than `MAX_AGE_HOURS`.
- Race test: webhook + cron firing for the same order produces exactly one booking (idempotency via `pending_*.status`).
- Browser-no-op test (lightweight): the Razorpay success handler does NOT call `calendar-sync` / `confirm-hour-purchase`; it only polls.

Target: all existing 22 tests stay green, ~6 new tests added.

## Out of scope (intentionally)
- No DB schema changes.
- No UI redesign — only the post-payment toast/poll behavior changes.
- Chennai webhook secret — already documented; user will paste it when ready.

## Rollout
1. Ship cron schedule + webhook `notes.kind` dispatch + browser no-op together.
2. Watch `payment_events` and `reconcile-pending-payments` logs for 24h.
3. Once green, the browser-side finalize code paths can be deleted entirely (already inert by then).

Approve and I'll implement exactly this — minimal, no extras.
