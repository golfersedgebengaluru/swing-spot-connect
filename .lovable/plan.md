# Server-only Payment Gateway Management — Phase 1

## Goal
Move all payment-gateway viewing and credential updates out of the browser and behind one authenticated server operation. Preserve every gateway’s existing live/test setting. Do not revoke database access yet; that remains a separate phase after real-user verification.

## Build
1. Add one server-only gateway management operation with validated actions for list, create, update, and delete.
2. Authorize each request by the signed-in user:
   - Platform admins may manage city gateways.
   - City admins may manage only assigned cities.
   - QC admins may manage only their assigned tenant.
3. Return only safe gateway metadata and booleans indicating whether `api_key`, `api_secret`, and `webhook_secret` are configured. Never return stored credential values.
4. Accept credential replacements without requiring existing values. Blank fields retain existing credentials; an explicit clear action is required to remove one.
5. Catch internal/provider/database failures, log only non-secret context, and return generic browser-safe errors. Never log request bodies or credential values.
6. Update the platform, city, and QC payment screens to use this operation. Remove browser reads/writes of gateway credentials and replace “show secret” behavior with configured/not-configured status.
7. Keep `is_test_mode` exactly as stored unless an authorized admin deliberately changes it. No test-mode conversion or credential replacement is included.

## Verification before permission revocation
- Regression tests in `npm test` for platform/city/QC role boundaries, cross-city/cross-tenant denial, safe response shape, credential retention/replacement, generic errors, and no secret logging.
- Run the complete test suite and verify the app build.
- Verify available authenticated admin paths in preview.
- Deploy the server operation automatically; publish the updated screens for production verification.
- Owner then performs controlled real-user live payments, confirming order creation, booking completion, webhook processing, emails, invoice, and revenue.

## Explicitly deferred
- Do not yet revoke `api_key`, `api_secret`, or `webhook_secret` from `anon` or `authenticated`. After the real-user verification succeeds, apply that as a separate isolated migration for both roles.
- Do not yet change `admin_config.admin_password`. Verify its server-only replacement path, then isolate it separately.
- Do not change payment mode, payment credentials, prices, bookings, or financial data.
