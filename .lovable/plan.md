## Vendor Management + Vendor Advances in Expenses tab

### Current state
- `vendors` table + full CRUD hooks (`useVendors`) already exist.
- `VendorsCard` component is built but lives in Settings, not in Expenses.
- `advance_transactions` only supports customers (`customer_id`, `source_type`: credit_note / manual_deposit / drawdown).
- No vendor-advance concept yet.

### What I'll build

**1. Add Vendors sub-section inside the Expenses tab**
- Convert `AdminExpensesTab` to a small tabbed/sectioned layout: **Expenses**, **Vendors**, **Vendor Advances**.
- Reuse existing `VendorsCard` (add / edit / delete vendors, already supports GSTIN validation, CSV import/export).

**2. Database: extend `advance_transactions` to support vendors**
- Add `vendor_id uuid NULL` and `entity_type text` ('customer' | 'vendor', default 'customer').
- Make `customer_id` nullable; add CHECK: exactly one of `customer_id` / `vendor_id` set.
- Extend `source_type` enum values to include `vendor_payment` (advance given to vendor) and `expense_settlement` (drawdown to pay an expense).
- New RPC `get_vendor_advance_balance(p_vendor_id uuid)` mirroring `get_advance_balance`.
- RLS: same admin/site-admin policies as existing rows, scoped by city.

**3. New "Vendor Advances" panel**
- Lists each vendor for the selected city with **current advance balance**, last transaction date, and actions.
- **"Add Advance"** button → dialog: amount, payment method (cash / bank / UPI), reference, date, notes. Records a `credit` row (`source_type='vendor_payment'`) and optionally creates a paired `expenses`-style payment record if you want it to hit P&L (asked below).
- **"Settle from Advance"** button (enabled only when balance > 0) → dialog showing unpaid/recent expenses for that vendor; pick one (or enter free amount up to balance) → records a `debit` row (`source_type='expense_settlement'`, `source_id=expense_id`) and marks expense as settled.
- **History drawer** per vendor showing all advance transactions (credits + debits) with running balance.

**4. Expense creation hook-in**
- In `AddExpenseDialog`, when a vendor is selected and they have advance balance > 0, show a checkbox **"Settle from vendor advance (₹X available)"**. If checked, on submit also insert the matching `expense_settlement` debit so the advance is drawn down automatically.

**5. Reports**
- Add vendor balances to the existing `AdvanceAccountsReport` (or a sibling) so admins can see total vendor advances outstanding per city.

### Open questions before I build

1. **Accounting of advance given:** when you "Add Advance" to a vendor, should it also create an `expenses` row right then (so cash leaves the books immediately, P&L neutral until settled — treated as a prepaid asset), or only record it in `advance_transactions` (P&L hit happens when actual expense is logged and settled)? Standard accounting = the second one, but tell me your preference.
2. **Settlement granularity:** allow partial settlements against a single expense, or only full-amount settlements?
3. Should `VendorsCard` stay in Settings too, or move entirely into the Expenses tab?

Approve and answer the 3 questions and I'll implement.
