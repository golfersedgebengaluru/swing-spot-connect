# Manual Booking — Past-Slot UX (Option B)

Make past-today slots in the admin Manual Booking dialog clearly retroactive — both visually in the slot grid and in how the server handles them (no Google Calendar event, no email).

## What changes

### 1. Slot grid: mark past slots as "Past · Backdated"
In `src/components/admin/ManualBookingDialog.tsx` (slot button block around lines 752–776):

- For each slot, compute `isPast = new Date(slot.time).getTime() < Date.now()`.
- Render past slots with:
  - amber border + muted amber background (same palette as the existing "Backdated entry" notice at line 695),
  - the label `HH:MM` plus a small `· past` suffix,
  - still clickable (so admin can select it),
  - `title` tooltip: "Backdated walk-in — no calendar sync, no email".
- Future and currently-busy slots keep their existing styles unchanged.

### 2. Inline notice when a past slot is selected
Just under the slot grid (or merged with the existing backdated-date amber notice at lines 694–698), show:

> Backdated walk-in — accounting only. No calendar event, no confirmation email.

Shown whenever the chosen start time is strictly before "now", regardless of whether the date is today or earlier.

### 3. Server: treat same-day past times as backdated
In `supabase/functions/calendar-sync/index.ts`, `guest_booking` action (around line 818):

- Today, `isBackdated` is true only when the **date** is before today.
- Change it to `isBackdated = new Date(start_time).getTime() < Date.now()` so a same-day past time also counts.
- Downstream behaviour already inherits correctly: Google Calendar event creation and the `guest_booking_confirmed` email are already gated on `!isBackdated`, and the booking is inserted with `status: "completed"` for backdated rows, which is the right state for a walk-in that already happened.

### 4. No changes to
- The `admin_mode` flag on `list_slots` (already shipped — keeps past-today slots in the grid).
- Email/phone guest dedup (already shipped).
- The date picker, dropdown hour selector, or duration logic.
- Public booking flow — `admin_mode` is only sent from the admin dialog, so members still see future-only slots.

## Files touched
- `src/components/admin/ManualBookingDialog.tsx` — slot button styling + inline notice.
- `supabase/functions/calendar-sync/index.ts` — one-line `isBackdated` tweak in `guest_booking`.

## Verification
- Open Manual Booking at 17:15 on today's date → 06:00–17:00 slots render in amber with "past" suffix; 17:30+ render normally.
- Click 16:00 → start time fills, amber backdated notice appears below the grid.
- Submit → booking row has `status: "completed"`, no Google Calendar event created, no guest email sent, revenue transaction still recorded.
- Submit a future slot (e.g. 19:00) → unchanged: confirmed status, calendar event created, email sent.
