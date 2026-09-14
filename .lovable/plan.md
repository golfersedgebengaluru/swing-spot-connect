# Persist product vendors end to end

## Build
- Add `vendor_id` to the safe product catalogue view with a fresh database migration, preserving its security settings and grants.
- Refresh generated database types so product reads include the saved vendor link.
- Keep vendor selection in the product form and show the saved vendor name in each product row.
- Add vendor columns to product CSV export/import, resolving imports by vendor ID or vendor name without changing unrelated product behavior.
- Add regression coverage for select, save, refresh, reopen, resave, display, and CSV round-tripping.

## Verification
- Apply and verify the database migration in production.
- Run the complete regression suite and production build.
- Check the current build diagnostics after the changes.

## Technical details
- `products.vendor_id` remains optional and continues using its existing foreign key with `ON DELETE SET NULL`.
- The public product view will expose only the vendor identifier, not vendor contact or financial details.
- CSV export will include both `vendor_id` and `vendor`; import will prefer a valid `vendor_id`, then resolve an exact case-insensitive vendor name, and reject ambiguous names.
