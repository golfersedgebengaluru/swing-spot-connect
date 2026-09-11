# Sales by SKU / Vendor Report + Product Vendor Field

## Goal
Inside Revenue Reports, add a "Sales by SKU" view: category → SKU drill-down
(units sold, net revenue, signed refunds) so you can see exactly which product is
selling. Add an optional vendor field on **products only**, and a vendor filter on
the same report so you can report merchandise sales back to each vendor.

## Scope decisions
- Vendor field is **optional** and **products-only** (services keep their own
  delivery model: coaches table, internal bay, leagues). No mandatory field yet.
- One reporting source — the existing `revenue_transactions` ledger. No second
  data store, no materialized view.
- Unlinked sales stay visible as an explicit "Unlinked" row so totals always tie
  back to the dashboard.
- Refunds are signed negative (a reversal reduces the SKU/category it was earned in).

---

## 1. Schema: add `vendor_id` to products (migration)

```sql
ALTER TABLE public.products
  ADD COLUMN vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_vendor_id_idx ON public.products (vendor_id)
  WHERE vendor_id IS NOT NULL;
```

- Nullable, optional. Existing rows stay null.
- `products` already has GRANTs + RLS; ALTER COLUMN needs no new grants.
- Regenerated types will pick up the column.

## 2. ProductForm: optional vendor dropdown (products only)

- In `src/components/admin/ProductForm.tsx`, add a "Vendor" `<Select>` that is
  **shown only when `item_type === "product"`**.
- Options come from `useVendors` (city-scoped). For a global product (no city),
  show all vendors with the city in the label; for a city-scoped product, show
  that city's vendors first. "None" is always selectable and is the default.
- Saves `vendor_id` (or `null`) alongside the other fields.

## 3. New hook: `useSalesByProduct` (read-side, no new capture)

`src/hooks/useSalesByProduct.ts` — reuses the same paged-fetch + product-link
resolution pattern as `useRevenueSummary`:

- Fetches all confirmed `revenue_transactions` in the business-date range + city
  filter (via `fetchAllPaged` + `reportDayRange`).
- For each row: resolve `product_id` → `{ sku, name, category, vendor_id, vendor_name }`
  via batched `products` reads (and `vendors` for vendor names).
- Rows without `product_id` fall back to their `invoice_line_items` (same rule as
  the summary); residual unlinked amount → one "Unlinked" bucket.
- Refunds carry the original sale's product, so a reversal reduces that SKU.
- Returns two groupings:
  - `byCategory`: `{ category → [{ sku, name, units, net }] }` for drill-down.
  - `byVendor`: `{ vendorName → { units, net, items: [...] } }` for the vendor view.
  - Plus a flat `bySku` array and an `unlinked` total for export/reconciliation.

## 4. AdminRevenueTab: "Sales by SKU" report section

In `src/components/admin/AdminRevenueTab.tsx`, add a new collapsible section below
the existing category tiles:

- A view toggle: **By Category** (drill-down) / **By Vendor**.
- **By Category**: category rows (units, net). Click a category → expands to SKU
  rows (SKU code, product name, units, net revenue). "Unlinked" shown as its own row.
- **By Vendor**: vendor rows (units, net) → expand to SKU rows. Products with no
  vendor grouped under "No vendor".
- Reuses the existing period + city filters (no separate filter UI).
- **Export CSV**: pages through the full dataset (not just the visible page),
  RFC-4180 escaping, columns: Category, SKU, Product, Vendor, Units, Net Revenue.
  Filter-aware filename.
- Totals row reconciles with the period's net revenue.

## 5. Tests

- `src/hooks/__tests__/useSalesByProduct.test.ts` — unit tests with the Supabase
  mock: grouping by category/SKU, vendor grouping, refund sign reversal, unlinked
  bucket, invoice-line fallback, pagination across >1000 rows.
- `src/components/admin/__tests__/salesBySkuReport.test.tsx` — render drill-down
  (category expand → SKU rows), vendor view, CSV export wiring, totals reconcile.
- `src/test/db/` contract test for the `vendor_id` FK + null behaviour.

## Out of scope (later CRM phases)
- Customer-level views (lifetime spend, last visit, favourite categories) — read
  from the same ledger, no new capture, built in a later pass.
- Mandatory vendor — stays optional until data entry habits settle.
