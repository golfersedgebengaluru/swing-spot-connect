# Secure automatic gift processing

## What will change
- Keep the existing intended path: a newly signed-in user triggers their own signup gift check.
- Validate the bearer token with the authentication service before any privileged database access.
- Derive the recipient exclusively from the validated session user; remove trust in caller-supplied `user_id`.
- Reject missing, anonymous, invalid, service-role, and other non-user tokens before reading rules or writing gifts/notifications.
- Preserve current rule limits and signup behavior for legitimate users.

## Verification
- Add regression coverage proving anonymous calls are rejected.
- Add a distinct regression case proving a service-role or other privileged non-user token is rejected; this endpoint is user-triggered, not backend-only.
- Prove one signed-in user cannot award a gift to another user, including a forged `user_id` payload.
- Prove the normal fresh-sign-in call still invokes and processes the authenticated user's gifts.
- Prove the rule-limit query, gift insert, and notification insert all use the same validated session user ID.
- Deploy the secured function, run focused tests, then the full regression suite and production build.
- Run a fresh security scan and only mark the critical finding fixed after the scan confirms it is gone.

## Technical details
- Use `auth.getUser()` with the request Authorization header and the public client for identity validation.
- Use the privileged client only after authentication succeeds.
- Remove `user_id` from the client payload/schema and use the validated user ID for every query and insert.
- Do not treat possession of a privileged token as a legitimate caller; require `auth.getUser()` to return a real user session.
- Keep all responses CORS-safe and retain the existing trigger-event validation and gift idempotency limit.
