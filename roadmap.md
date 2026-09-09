# Roadmap

## Pass 3 — refunds & cancellations (in progress)
- [ ] `record_refund` RPC: negative amounts, source_ref idempotency, over-refund guard, inherits city/currency/product/customer
- [ ] Stop writing zero-value refund revenue rows (hours-only cancellations)
- [ ] Backfill: flip 22 positive refunds negative, remove 154 zero-value refund rows
- [ ] Unify member + admin cancellation disposition logic (one shared routine)
- [ ] Credit note + advance written together; store credit disabled for guest sales (no account)
- [ ] Reports: signed sums, refunds reduce their own category
- [ ] Tests + per-city Aug/Sep net revenue reconciliation

## Later
- [ ] Pass 4 — product/category/HSN stamping at capture + catalogue backfill
