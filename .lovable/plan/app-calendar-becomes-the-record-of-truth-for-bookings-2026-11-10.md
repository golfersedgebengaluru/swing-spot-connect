# App calendar becomes the record of truth for bookings

## Goal
Availability comes from the app's own bookings and block-outs, not Google. Google Calendar becomes a view-only copy. Works for 1 to 12+ bays per city.

## What changes for you
- **Bays and types:** each bay is marked Standard or Bunker. Bunker Bay has its own pricing.
- **Customers book a bay type, not a bay:** "Standard, 7 PM". The app picks any free bay of that type.
- **10-minute payment hold:** a slot is held while the customer pays. The payment screen closes at 10 minutes. Late payments book the slot if still free, otherwise they're refunded automatically.
- **Member hours on Bunker Bay:** per-city settings, same as coaching:
  - Members can use hours here (on/off)
  - Hours used per hour booked (e.g. 1, 1.5, 2)
- **Block-outs in the app:** staff block a bay (or all bays) for a time range. Manual blocking in Google stops counting.
- **All-bays day view in the app:** one grid, bays across, times down, showing bookings, holds and block-outs.
- **Google copy:** each booking is copied to the city's single Google Calendar, labelled with the bay. Anything not yet copied shows a "not on Google yet" marker in the day view, with a retry.

## What stays the same
- Prices, coupons, invoices, GST, member hours, cancellations and refunds.
- Holidays, special hours and league bay blocks.
- Chennai and Bengaluru keep working on Google until switched over in step 4.

## Steps
1. Bay types and Bunker Bay hours settings
2. Availability from app records, payment holds, automatic bay choice (the core)
3. Block-outs and the all-bays day view
4. Google copy with "not on Google yet" markers, then switch Chennai and Bengaluru over (after you check their Google blocks are re-entered in the app)

Each step is tested and published on its own.

## Before switch-over (you)
- Re-enter any existing manual Google blocks for Chennai/Bengaluru as app block-outs.
- Share Gurugram's Google Calendar with the booking engine (view copy only).

## Technical details
- Availability = bay hours minus confirmed bookings, live holds (expires_at > now), block-outs, holidays and league blocks; existing per-bay overlap constraint stays the final guard.
- Holds are short-lived rows created by the order-creation function inside the same transaction that picks the free bay; finalization converts the hold or re-checks and refunds.
- Bay type and Bunker hours settings live in existing bay/city config; hours charged from reserved range times the configured rate.
- Google write runs after commit; sync status stored per booking for markers and retry. Calendar never read for availability once a city is switched.
- Per-city switch flag so cities migrate one at a time.
- Regression tests: double-booking under concurrency, hold expiry, late-payment refund, bay auto-pick, Bunker hours rate, block-outs.
