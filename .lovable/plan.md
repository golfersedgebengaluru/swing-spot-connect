# Restore full customer actions alongside reporting

## Review findings
- The current All Users page still contains Member360, View Profile, Edit Profile, Allocate Points, Adjust Hours, histories, Finance, Manage Access, Extended Hours and Delete User.
- Reporting added four columns before Actions, pushing the three-dot menu to the far right in a horizontally scrollable table. This is the likely reason it is no longer readily visible; authorized browser confirmation is still needed.
- Add/Deduct Hours are inside Adjust Hours. Advance deposits are inside Finance → Add Deposit. Neither is clearly exposed from the row menu.
- A separate per-customer Deduct Points entry is absent; reward redemption exists as a top-level action. Deducting points must not require selecting a reward.

## Proposed restoration
Keep the new filters, reports and exports. Restore a readily reachable three-dot menu on every customer row without requiring horizontal scrolling to find it. Keep customer identity, type and balances compact; place report metrics in a concise stacked area rather than four additional wide columns.

### Full row menu
| Group | Options |
| --- | --- |
| Profile | View Profile; Member360; Edit Profile |
| Hours | Add Hours; Deduct Hours; Adjust Hours; Hours History |
| Points | Add Points; Deduct Points; Redeem Reward for this customer; Points History |
| Finance | Add Advance; Finance / Transaction History |
| Activity | Booking History |
| Access | Manage Access; Enable / Disable Extended Hours |
| User management | Delete User, retaining confirmation |

- Add/Deduct Hours open the existing hours form with the appropriate action selected; retain payment, reason, note and service-date behavior.
- Add Points reuses existing allocation; Deduct Points exposes the existing safe points-decrement operation with an amount and reason, without a reward requirement or a misleading reward-redemption message.
- Redeem Reward opens the existing reward workflow with the customer selected.
- Add Advance opens the existing Finance deposit form directly; Finance still shows balances and transaction history.
- Retain membership-type editing and the existing top-level Register User, Allocate Points and Redeem for User actions.
- Preserve current city restrictions, access permissions, customer identity links and accounting behavior. No new permissions or financial rules.
- After an action succeeds, refresh the displayed balances and relevant history without clearing report filters or returning to the first page unnecessarily.

## Technical approach
- Make a small presentation-focused change to All Users and reuse the existing hours, finance, profile and access dialogs.
- Add optional initial-action/customer selection parameters only where needed; do not duplicate forms or introduce a second balance calculation.
- Reuse points mutations and existing balance protections; distinguish a manual deduction from a reward redemption in the interface and recorded description.
- No database migrations, reporting rewrites, historical data changes, cancellation changes or new CRM phases.

## Verification before completion
- Add focused interaction tests for row/customer selection and each restored action, including opening add versus deduct forms, advance deposit entry and reward selection.
- Verify successful actions refresh balances and histories while preserving filters; verify failure feedback and existing deduction protections.
- Run the relevant regression tests and check preview errors.
- Verify the reachable menu and dialog flow in the browser with an authorized admin/city-admin session. The currently available session lacks admin access; if that remains unavailable, explicitly report browser checks as blocked rather than completed.

## Approval boundary
Only this review and plan are prepared. No application code or database changes until approval.