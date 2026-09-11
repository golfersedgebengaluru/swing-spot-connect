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

## 3. Extend `useRevenueSummary` (no second hook, no duplicated logic)

The summary already pages through **every** confirmed transaction in the period,
already resolves `product_id → category` (with the `invoice_line_items` fallback
for unresolved rows), and already signs refunds. A separate `useSalesByProduct`
would re-implement all of that — a second copy of the "how does a revenue row
find its product" rule, which is exactly the duplication that caused past bugs.

So instead, extend the one existing computation in `src/hooks/useRevenue.ts`:

- Widen the existing products read from `.select("id, category")` to
  `.select("id, category, sku, name, vendor_id")`, plus a batched `vendors` read
  for vendor names.
- In the same bucket loop that builds `byCategory`, also build:
  - `bySku`: per-product `{ productId, sku, name, category, vendorId, vendorName, units, net }`
    (units = count of confirmed non-refund rows; net signed so refunds reduce the SKU).
  - `byVendor`: aggregate of the same rows by `vendorName` ("No vendor" for nulls).
- Unlinked sales still surface in the existing "Uncategorised" bucket and also as
  a `bySku` "Unlinked" row, so totals always reconcile with the tiles.

Net effect: the category tiles, the SKU drill-down, and the vendor view all read
from the **same single fetch** — no extra network request, no second resolver,
totals reconcile by construction.

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
