# Authenticate scheduled payment reconciliation

## Confirmed production invocation

This function is **not manual-only**. Production has `pg_cron` and `pg_net` enabled and two active jobs invoking it:

1. `reconcile-pending-payments-every-5-min`
   - Schedule: `*/5 * * * *`
   - Method: `net.http_post`
   - Headers: `Content-Type` and project API key
   - Body: `{}`
2. `reconcile-pending-payments-every-5min`
   - Schedule: `*/5 * * * *`
   - Method: `net.http_post`
   - Headers: `Content-Type`, project API key, and bearer authorization
   - Body: `{}`

Production logs confirm two successful calls at each five-minute interval. Neither job currently sends a dedicated reconciliation secret. The endpoint therefore runs twice every five minutes today.

## Planned change

1. Create one strong, dedicated runtime secret for reconciliation authentication. Keep it out of source control, responses, and logs.
2. Add an authentication gate at the very start of `reconcile-pending-payments`:
   - Require `x-reconcile-secret`.
   - Compare it safely with the server-only secret.
   - Return a generic `401` immediately when missing or incorrect.
   - Do not create the backend client, read pending rows, contact Razorpay, or perform any reconciliation before this check passes.
3. Update both existing cron job commands to send the required header so this security-only change does not silently disable either current production invocation.
4. Do **not** remove or consolidate the duplicate schedules in this change. Their duplicate execution is now documented and should be handled only as a separately approved cleanup.
5. Add regression coverage for missing, incorrect, and correct secrets, including proof that rejected requests cannot enter reconciliation logic. Do not add rate limiting, replay protection, or other behavior.
6. Deploy the function and update the scheduler configuration, then call the deployed endpoint without the header and with a wrong value. Both must return `401`.
7. Confirm the next authenticated scheduled invocation succeeds, while checking that only safe status information appears in logs.

## Report after implementation

- The two production scheduler configurations before and after the change, with all credential values redacted.
- Why a dedicated shared secret was selected: the caller is an internal scheduler, not a signed-in administrator.
- Test results and deployed call evidence showing unauthenticated requests return `401` before reconciliation.
- Confirmation that no rate limiting, replay protection, admin-JWT flow, or unrelated reconciliation logic changed.
