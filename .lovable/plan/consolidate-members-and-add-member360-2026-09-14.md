# Consolidate Members and add Member360

## Build
- Make **All Users** the single member-management screen: remove the Members sidebar/tab entry, retire the duplicate Members screen, and preserve Corporate Accounts separately.
- Redirect `/members` and legacy `/admin?tab=members` links to `/admin?tab=allusers&filter=member` without changing unrelated admin navigation.
- Add the URL-backed type filter **All / Pre-registered / Registered / Member** using the agreed definitions: no linked login, linked login without `member_hours`, or any existing `member_hours` record.
- Mark members with a distinct **Member** badge and replace Hours with color-coded **Remaining hours**, preserving the current green/orange/red thresholds exactly.
- Extract the existing hours adjustment/history behavior into one reusable implementation, retaining offline payment details, city-aware revenue recording, notifications, audit history, and every existing All Users action.
- Prepend **Member360** to the actions menu and open `/members/:id/360` under the existing admin authorization boundary.

## Member360 page
- Resolve the member through both profile ID and linked user ID, then apply the same role, city, tenant, and row-level access rules already used by the admin screens.
- Show the fast signal strip only when applicable: **Low hours** uses the existing red hours threshold; **No upcoming booking** uses future non-cancelled bookings. Do not add renewal, points-expiry, or handicap signals.
- Render one mobile-first continuous page in this order: **Profile → Membership → Bookings → Training → Leagues → Loyalty → Commerce → Engagement**.
- Reuse existing records for profile/contact/city, hours package and transactions, bookings, coaching focuses/sessions/drills, league participation/results, points activity, orders/spend, and visit totals.
- Count visits from distinct completed/attended bookings only, excluding cancelled, pending, and unpaid bookings; show total visits plus a plain booking-frequency summary.
- Use `—` only for missing fields inside an applicable section. Omit Training, Leagues, Loyalty, or Commerce entirely when that data type has no records for the member.
- Give every section its own query and skeleton so one slow or empty source never blocks the rest; include existing destination links where a matching history/detail screen exists.
- Add a clear **← Back to Members** link to `/admin?tab=allusers&filter=member`.

## Code quality
- Add small shared identity, member-classification, hours-color, visit-count, and section-visibility helpers rather than duplicating rules in screen components.
- Reuse existing UI components and generated database types; add no table, view, database migration, generated type, backend endpoint, or parallel member model.
- Remove the obsolete Members component only after its unique revenue-aware behavior has moved into the shared implementation.

## Regression and verification
- Cover filter definitions, member detection through `member_hours` including zero remaining, exact hours thresholds, both redirects, Member360-first menu ordering, and preservation of every existing action.
- Cover dual-key identity matching, city/role restrictions, completed-and-paid visit counting, section omission, independent skeletons, and the back link.
- Run the full regression suite and production build, then verify All Users filtering, an actual Member360 page, redirects, and menu actions in the authenticated preview.
- Verify the full page at a true mobile viewport for single-column cards, readable text, tappable controls, and no nested scrolling or overlap.

## Explicitly out of scope
- Membership expiry/renewal, points expiry, handicap trends, and a separate simulator-session model remain omitted because reliable source data is not currently stored.
- No unrelated All Users behavior, booking/payment logic, Corporate Accounts behavior, or database state will change.