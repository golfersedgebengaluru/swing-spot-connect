# Membership revenue spread over validity

## Your questions answered

**1. Prorate first and last months, full months in between?** Yes.
- Each full month gets an equal share: price ÷ number of months.
- The first month gets its share for the days it covers. The last month gets whatever is left, so the months always add up to the exact sale amount.
- Example: ₹30,000 Birdie for 3 months, bought 20 August, valid to 19 November.

| Month | Days covered | Revenue |
|---|---|---|
| August | 12 of 31 | ₹3,871 |
| September | full | ₹10,000 |
| October | full | ₹10,000 |
| November | 19 of 30 | ₹6,129 (balance) |
| **Total** | | **₹30,000** |

- A membership bought on the 1st gets three equal months of ₹10,000.

**2. Expiry used only for revenue, hours don't expire.** Yes, that's the default.

**3. A switch to auto-expire hours.** Yes.
- One on/off switch per city in Settings. Off by default.
- When it's on, unused hours from a membership are removed at the end of its expiry date. The member's hours history shows them as "Expired".
- Hours are used oldest-expiring first, so a member who renews doesn't lose their new hours.
- Hours added by hand (top-ups, free hours) and hours from past memberships never expire.
- Turning the switch off stops future expiries. Hours that have already expired don't come back by themselves, but staff can add them back with Adjust Hours.
- Sessions booked before the expiry date keep their hours, even if the session is after it.

**4. Past memberships.** They stay exactly as they are today: counted in full in the month sold, and their hours never expire. Only memberships sold after this goes live get spread.

**5. Should there be a cancel/refund option?** I recommend a simple one. Without it, a refunded membership would keep showing revenue in later months.
- Staff choose "Cancel membership" on the customer, enter the refund amount and a date.
- Revenue already counted up to that date stays.
- The refunded part comes off. Any part you keep (for example, a cancellation fee) counts in the cancellation month.
- A credit note is issued for the refund, the same way cancelled paid bookings work today.
- The member's unused hours from that membership are removed.

## What staff will see

- **Membership products:** a new "Valid for (months)" field. Products without it work as they do today: counted in full and never expire.
- **Each new sale** gets a start date (the sale date) and an expiry date, shown on the customer's page. Members see their expiry date in My Bookings.
- **Revenue report and dashboard:** memberships show the amount earned that month, not the amount sold. A new line shows "Received, not yet earned" (money taken for months still to come).
- **Unchanged:** invoices, GST and the GST report still use the full amount in the invoice month. Customer lifetime spend still counts the full amount paid.

## Decisions I'd like from you
- Should the start date always be the sale date, or can staff choose a later start when selling in person?
- Should the expiry switch be per city or one switch for all cities?
- Should I include the cancel/refund option in this build?
- Your accountant should confirm that the spread is the amount before GST, which is what the revenue report already shows.

## Technical details
- Each sale is stored with its validity (start date, end date and amount to spread), fixed at the time of sale so later product edits can't change it. This works for both online purchases and staff sales.
- The monthly figures come from one shared calculation that the revenue report, dashboard and exports all use. Nothing is written to past months, so history can't be changed.
- Hours are tracked per purchase (hours and expiry date), and the current balance stays as it is. Bookings use hours from the purchase that expires first. A daily server job expires hours only in cities where the switch is on, using the city's timezone, and every expiry is recorded in the hours history.
- Cancellation runs as one all-or-nothing step: refund entry, credit note (numbered once), removing hours and ending the spread.
- Tests will check proration and rounding (including February and leap years), purchases starting on the 1st, the expiry switch on and off, using the soonest-expiring hours first, cancellation part-way through, and that past memberships stay unchanged.
