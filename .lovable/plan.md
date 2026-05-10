## Quick Competition SaaS — Admin-controlled monetisation (v1)

Reuses the existing Razorpay integration. Admin decides per competition whether players join free or pay an entry fee. No Stripe, no credits, no subscription engine.

### What changes for the admin

In the **Quick Competition setup dialog** (existing `QuickCompetitionDialog.tsx`), add a new section **"Entry"**:

- **Entry type** — radio:
  - `Free` (default) — anyone with the join link/QR can enter.
  - `Paid` — players must pay to join.
- When **Paid** is selected, reveal:
  - **Entry fee** (numeric, in the workspace's currency, e.g. ₹200)
  - **Razorpay account** — auto-selected from the city's existing Razorpay config (read-only label, e.g. "Using city Razorpay: Bangalore"). No new credentials needed.
  - **Refund on no-show?** — toggle (default off). If on, an unused entry can be refunded by admin from the console.

That's the entire admin-side change. Everything else (name, unit, attempts, sponsor) stays as-is.

### What changes for the player (paid comps)

Player flow on `/qc/:id/join` (new public page, only shown when comp is paid):

1. Enter name + phone (phone is the unique key, no login).
2. Tap **Pay ₹X & Join** → Razorpay checkout opens.
3. On success → entry confirmed, name appears in the leaderboard pool, player can record attempts via the existing console (admin still enters scores, OR via the v2 self-entry path later).
4. Receipt emailed/SMS-linked.

For **free** comps, the existing flow stays — admin just adds players by name in the console.

### Admin console additions (paid comps only)

A new **"Entries"** sub-tab inside `QuickCompetitionConsole.tsx`:
- List of paid players with: name, phone, amount paid, payment status, payment ID, joined-at.
- **Refund** button per row (only if comp's "refund allowed" is on and comp is not yet completed).
- Total collected amount shown at top.

### Tech changes

```text
DB (migration):
  ALTER quick_competitions
    ADD entry_type text NOT NULL DEFAULT 'free'        -- 'free' | 'paid'
    ADD entry_fee numeric(10,2)                         -- nullable, required when paid
    ADD entry_currency text                             -- inherited from city/workspace
    ADD refunds_allowed boolean NOT NULL DEFAULT false
    ADD razorpay_account_ref text                       -- which city/account the fee routes to

  CREATE TABLE qc_entries (
    id uuid pk,
    competition_id uuid fk → quick_competitions,
    player_name text NOT NULL,
    phone text NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency text NOT NULL,
    razorpay_order_id text,
    razorpay_payment_id text,
    status text NOT NULL DEFAULT 'pending',  -- pending|paid|refunded|failed
    refunded_at timestamptz,
    refund_id text,
    created_at timestamptz default now(),
    UNIQUE (competition_id, phone)
  )
  -- RLS: public can SELECT own row by phone via edge function; admin full access scoped to tenant.

  -- When status flips to 'paid', auto-insert into existing qc_players table
  -- (trigger or done in the webhook handler).

Edge functions:
  + qc-create-entry-order   -- public; validates comp is paid + open, creates Razorpay order, returns order_id + key
  + qc-verify-payment       -- public; webhook + client confirm; verifies signature, marks entry paid, creates qc_player row
  + qc-refund-entry         -- admin; calls Razorpay refund API, flips status, removes player if no attempts logged

Reuse:
  - Existing Razorpay key resolution per city (from city payment gateway config).
  - Existing payment-before-commitment pattern (see mem://features/payment-processing-flow).
  - Existing 200-OK error envelope for edge functions.

Frontend:
  - QuickCompetitionDialog.tsx → add Entry section (radio + fee + refund toggle).
  - QuickCompetitionConsole.tsx → add Entries tab when entry_type === 'paid'.
  - New page src/pages/QuickCompetitionJoin.tsx at /qc/:id/join with Razorpay checkout.
  - QuickCompetitionPublic.tsx (TV mode) → if paid, show "Join — ₹X" CTA + QR pointing to /qc/:id/join.

Validation:
  - Cannot switch entry_type after first paid entry exists.
  - Free comps: no /join page, admin adds players manually as today.
  - Paid comps: admin cannot manually add players (must come through paid join), unless they tick a "comp guest" override that records ₹0 in the entries table for audit.
```

### Out of scope for this iteration

- Stripe, credits, subscriptions, sponsor marketplace — all deferred.
- Player self-entry of *scores* via QR — separate v2 task; this plan only adds paid *join*.
- Tax invoices / GST receipts on entry fees — note for follow-up; for v1 the Razorpay receipt suffices.

### Decisions needed before I build

1. Confirm fee currency = workspace city's currency (not a free-text per comp).
2. Confirm phone number is the player's unique key (vs email, vs both).
3. Refund window: only before comp ends, or also up to N hours after? Default: only before end + admin override.
4. For paid comps, do players still need admin to enter their scores, or should we also ship the player score self-entry now? (I recommend keeping it admin-entered for v1 — simpler, matches your current trust model.)
