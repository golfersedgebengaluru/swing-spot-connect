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

## City guardrail (done)
- [x] `record_revenue` resolves the city from the booking/bay, then the member's preferred city, and refuses a paid sale if it still can't
- [x] Table trigger blocks any non-zero row with a blank city (last defence, zero-value rows unaffected)
- [x] 11 legacy zero-value blank-city rows deleted; 0 remain
- [x] Tests: writer + trigger contract, live rejection/recovery checks

## Pass 4 — product & tax-code stamping (done)
- [x] HSN/SAC codes trimmed on products and invoice lines; a normaliser keeps them clean (no more " 999652" phantom GSTR-1 row)
- [x] One shared resolver decides which product a sale was for (metadata → bay pricing → hour package → league → itemised invoice)
- [x] Revenue rows stamped with the product on insert and when a booking/hours link appears later
- [x] Invoice lines inherit HSN/SAC and item type from their product
- [x] New taxable products must carry a code; an existing code cannot be cleared (form check + database guard)
- [x] Manual invoice refuses to save a taxable line with no code
- [x] Backfill: sales without a product 649 → 42, uncoded invoice lines 390 → 231 (only 26 of them taxable); amounts, cities and dates untouched
- [x] Tests: pure tax-code helpers, migration contract (resolver, triggers, backfill, revokes)

## August 2026 code fill — Bengaluru only (done)
- [x] Bengaluru is the only GST-registered city and August is the only unfiled GSTR-1, so the fill is scoped to that city and month
- [x] Re-runnable, date + city scoped `backfill_invoice_line_tax_codes(from, to, city)` — codes only, never amounts/dates/numbers
- [x] "500 coaching" catalogue item given the standard coaching code; its Bengaluru August line filled
- [x] Chennai lines that were briefly filled have been reverted (not GST registered)
- [x] Bengaluru August: 0 of 48 invoice lines now missing a code
- [x] Tests: scope, idempotency, code-only guarantee, browser revoke

## Later
- [ ] 124 catalogue items still have no HSN/SAC (all zero-rated bar one) — codes need to be confirmed per item, not guessed
- [ ] Chennai historical lines left uncoded on purpose (city not GST registered)
- [ ] 3 hour packages have no linked catalogue item, so those purchases stay untagged
- [ ] Decision needed: should coaching be taxed at 18%?


- [x] Sales by SKU report (category + vendor drill-down, complete CSV export)
- [x] products.vendor_id (optional, physical products only)
- [ ] CRM features derived from the same revenue ledger (later)

## Gateway credential isolation (in progress)
- [ ] Deploy authenticated server-only gateway status and credential-management operation
- [ ] Move platform, city, and QC admin payment screens to the server-only operation
- [ ] Regression-test role boundaries, secret-free responses, sanitized errors, and unchanged live/test settings
- [ ] Verify preview admin flows; await owner-led real-user live payment and webhook verification
- [ ] Only after confirmation: isolated revocation of api_key/api_secret/webhook_secret from anon and authenticated
- [ ] Separately isolate admin_config.admin_password after its replacement path is verified
