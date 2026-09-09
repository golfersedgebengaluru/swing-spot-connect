# Pass 3 — Make refunds and cancellations trustworthy

Right now money coming *back* out of the business is recorded inconsistently. Sales are clean after passes 1 and 2; refunds are not. This pass makes every reversal a single, signed, traceable record.

## What is wrong today

Checked against live data (1,409 revenue rows):

1. **Refunds are stored as positive numbers.** 22 refunds carry a positive amount and are only excluded from income because reports check the word "refund". Any report that forgets that check overstates income.
2. **154 refund rows are worth zero.** Every hours-based cancellation writes a ₹0 "refund" line. They are noise: they inflate transaction counts and mean nothing financially. Roughly 20-32 per month since March.
3. **Refunds have no unique key.** All 22 real refunds have a blank source reference, so a repeated cancellation or a retried background job can record the same refund twice. Sales are protected against this; refunds are not.
4. **Cancellation currency is hard-coded to rupees** on the hours-refund line instead of following the city.
5. **Two different cancellation paths** (member cancel, admin cancel) each write their own refund lines with duplicated logic, so they can drift apart.
6. **Store credit can be silently dropped for walk-in and guest sales.** A refund always follows a real sale, so the customer is known by name and email — but store credit can only be held against an account, and guest sales have none. Live data shows 20 paid sales in that position (6 guest bookings, 13 league entries, 1 booking), plus 21 older manual purchase entries with no name at all. Today the credit note is simply skipped with a log line.
7. **Reports treat refunds inconsistently.** Some views subtract them, the profit-and-loss view and category breakdown handle them differently, and a refund never reduces the category it originally belonged to.

## What I will do

**One writer for reversals.** Add a `record_refund` counterpart to the existing single sales writer. It will:
- store refunds as negative amounts, so any total is simply a sum;
- require a stable unique key (`refund:<original transaction>:<reason>`) so a replay can never double-refund;
- inherit city, currency, product/category and customer from the original sale;
- date the refund on the day it happens (invoice date for credit notes);
- refuse a refund larger than what remains refundable on the original sale.

**Stop writing zero-value refunds.** Hours-only cancellations move their record to the hours ledger, where they already exist. No money moved, so no money row.

**Clean up history.** A one-time backfill flips the 22 positive refunds to negative and deletes (or archives) the 154 zero-value rows. Reported totals will not change — the same money in, the same money out — but every report becomes correct by arithmetic rather than by remembering a rule.

**Unify the two cancellation paths** into one shared routine used by both member and admin cancellation, covering all three outcomes: credit note / advance, external refund with the city's cancellation charge, and hours-only.

**Make credit notes explicit.** The reversal and the credit entry are written together, never one without the other. Because store credit needs an account to sit in, a walk-in or guest sale can only be refunded to the original payment method — the credit option is disabled for those with a clear reason shown, rather than accepted and silently dropped. If the guest should keep credit, the staff member creates an account for them first.

**Simplify the reports.** With signed amounts, income becomes a plain sum, refunds are shown separately as a negative line, and refunds reduce their own category rather than sitting outside the breakdown.

## Tests

- Refund writer: negative amount, replay is ignored, over-refund rejected, city/currency/category inherited, business date correct.
- Cancellation: hours-only writes no money row; external refund charges the city's cancellation percentage; credit note writes reversal plus advance atomically; missing customer fails loudly.
- Both member and admin cancellation produce identical financial results.
- Backfill: totals before and after are identical for every city and month; no zero rows remain; no positive refunds remain.
- Reports: income, refunds, net, category breakdown and profit-and-loss agree with a hand-computed figure on live August data for Bengaluru and Chennai.

## Verification before I call it done

Re-run the August and September city reports and confirm each city's net revenue matches the pre-change figure to the rupee.

## Not in this pass

Product / category / HSN stamping at capture and the historical catalogue backfill — that is pass 4.
