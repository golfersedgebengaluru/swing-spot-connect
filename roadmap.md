# Roadmap

## Pass 3 — refunds & cancellations (done)
- [x] `record_refund` RPC: negative amounts, source_ref idempotency, over-refund guard, inherits city/currency/product/customer
- [x] Insert trigger: refunds must be negative, sales may not be
- [x] Stop writing zero-value refund revenue rows (hours-only cancellations)
- [x] Backfill: 22 positive refunds flipped negative, 154 zero-value refund rows removed, city/month nets unchanged
- [x] Unify member + admin cancellation disposition logic (one shared routine, errors surfaced)
- [x] Credit note + advance written together; store credit refused for guest sales (no account)
- [x] Invoice cancellation reverses the linked revenue, dated to the credit note
- [x] Reports: signed refunds in summary, dashboard, P&L, revenue list
- [x] Tests: RPC contract, shared writer, cancellation paths, invoice cancellation, report arithmetic

## Later
- [ ] Pass 4 — product/category/HSN stamping at capture + catalogue backfill
- [ ] Blank-city revenue rows (11 remaining, all zero-value)
