# Harden password reset abuse controls

## Build
- Add one atomic database function over the existing `rate_limit_attempts` table; add no table or infrastructure.
- Apply a 10-minute hashed-email cooldown and five-attempt, 15-minute hashed-IP cap before account lookup.
- Send reset mail only for accounts with an email/password identity.
- Keep every endpoint outcome at HTTP 200 with `{ success: true }` and redact identifiers in logs.
- Accept reset redirects only from the custom, published, and exact preview origins, always using `/reset-password`.

## Tests
- Add permanent regression coverage for OAuth-only suppression, email cooldown, IP cap, unsafe redirect fallback, simultaneous-request atomicity, and uniform success responses.
- Apply and deploy the database/function changes, run focused checks, then run the complete test suite and report its pass count.

## Technical details
- The database function will use transaction-scoped advisory locks keyed by the hashed identifier, then count and insert against `rate_limit_attempts` atomically.
- Browser roles will not receive direct access to the limiter table or function; only the server-side operation will use it.
