/**
 * Sales aggregation — the single place that turns confirmed revenue rows into
 * category / SKU / vendor buckets.
 *
 * Why this lives here and not inside the hook: the "how does a revenue row find
 * its product" rule must exist exactly once. The hook does the fetching (paged,
 * batched); this module does the arithmetic, so it can be executed directly in
 * tests instead of being inspected.
 *
 * Invariants that the tests pin down:
 *  - Refunds are signed negative and reduce the very SKU/category they were
 *    earned in (never dropped, never counted twice).
 *  - A row without a product falls back to its invoice line items, and only the
 *    residual amount (not covered by lines) lands in "Unlinked".
 *  - Every rupee in the period appears in exactly one bucket, so the SKU report
 *    always reconciles with the category tiles and with net revenue.
 */

export const UNCATEGORISED = "Uncategorised";
export const UNLINKED_KEY = "__unlinked__";
export const UNLINKED_LABEL = "Unlinked sales";
export const NO_VENDOR_LABEL = "No vendor";

export interface SalesProduct {
  id: string;
  category?: string | null;
  sku?: string | null;
  name?: string | null;
  vendor_id?: string | null;
}

export interface SalesTransaction {
  id: string;
  amount: number | string;
  transaction_type: string;
  product_id?: string | null;
}

export interface SalesInvoiceLine {
  invoice_id: string;
  line_total: number | string;
  product_id?: string | null;
}

export interface SkuRow {
  key: string;
  productId: string | null;
  sku: string;
  name: string;
  category: string;
  vendorId: string | null;
  vendorName: string;
  units: number;
  net: number;
}

export interface VendorRow {
  vendorId: string | null;
  vendorName: string;
  units: number;
  net: number;
  skus: SkuRow[];
}

export interface CategoryRow {
  category: string;
  units: number;
  net: number;
  skus: SkuRow[];
}

export interface AggregateInput {
  /** Confirmed transactions for the period (hours_deduction already excluded). */
  transactions: SalesTransaction[];
  /** Catalogue rows for every product id referenced by transactions or lines. */
  products: SalesProduct[];
  /** Invoice line items keyed by the revenue transaction they belong to. */
  linesByTransaction?: Map<string, SalesInvoiceLine[]>;
  /** Vendor id → vendor name. */
  vendorNames?: Map<string, string>;
}

export interface AggregateResult {
  byCategory: Record<string, number>;
  bySku: SkuRow[];
  byCategoryRows: CategoryRow[];
  byVendor: VendorRow[];
  net: number;
}

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

/** Signed amount: a refund always reduces, whatever sign it was stored with. */
export function signedAmount(t: SalesTransaction): number {
  const amount = num(t.amount);
  return t.transaction_type === "refund" ? -Math.abs(amount) : amount;
}

export function aggregateSales({
  transactions,
  products,
  linesByTransaction,
  vendorNames,
}: AggregateInput): AggregateResult {
  const productById = new Map<string, SalesProduct>();
  for (const p of products) productById.set(p.id, p);

  const buckets = new Map<string, SkuRow>();

  const bucketFor = (productId: string | null): SkuRow => {
    const key = productId ?? UNLINKED_KEY;
    const existing = buckets.get(key);
    if (existing) return existing;

    const product = productId ? productById.get(productId) : undefined;
    const vendorId = product?.vendor_id ?? null;
    const row: SkuRow = {
      key,
      productId,
      sku: product?.sku || (productId ? "—" : "—"),
      name: product?.name || (productId ? "Unknown item" : UNLINKED_LABEL),
      category: product?.category || UNCATEGORISED,
      vendorId,
      vendorName: (vendorId && vendorNames?.get(vendorId)) || NO_VENDOR_LABEL,
      units: 0,
      net: 0,
    };
    buckets.set(key, row);
    return row;
  };

  const add = (productId: string | null, amount: number, units: number) => {
    if (amount === 0 && units === 0) return;
    const row = bucketFor(productId);
    row.net += amount;
    row.units += units;
  };

  for (const t of transactions) {
    const amount = signedAmount(t);
    const isRefund = t.transaction_type === "refund";
    const sign = amount < 0 ? -1 : 1;

    if (t.product_id) {
      add(t.product_id, amount, isRefund ? 0 : 1);
      continue;
    }

    // No product on the row: fall back to its invoice line items.
    const lines = linesByTransaction?.get(t.id) ?? [];
    let covered = 0;
    for (const line of lines) {
      const lineAmount = sign * Math.abs(num(line.line_total));
      covered += lineAmount;
      add(line.product_id ?? null, lineAmount, isRefund ? 0 : 1);
    }

    const residual = amount - covered;
    if (residual !== 0) add(null, residual, isRefund || lines.length > 0 ? 0 : 1);
  }

  const bySku = [...buckets.values()]
    .filter((r) => r.net !== 0 || r.units !== 0)
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));

  const byCategory: Record<string, number> = {};
  for (const row of bySku) {
    byCategory[row.category] = (byCategory[row.category] ?? 0) + row.net;
  }

  const groupBy = <K extends string>(keyOf: (r: SkuRow) => K) => {
    const map = new Map<K, SkuRow[]>();
    for (const row of bySku) {
      const k = keyOf(row);
      map.set(k, [...(map.get(k) ?? []), row]);
    }
    return map;
  };

  const byCategoryRows: CategoryRow[] = [...groupBy((r) => r.category).entries()]
    .map(([category, skus]) => ({
      category,
      units: skus.reduce((s, r) => s + r.units, 0),
      net: skus.reduce((s, r) => s + r.net, 0),
      skus,
    }))
    .sort((a, b) => b.net - a.net || a.category.localeCompare(b.category));

  const byVendor: VendorRow[] = [...groupBy((r) => r.vendorName).entries()]
    .map(([vendorName, skus]) => ({
      vendorName,
      vendorId: skus[0]?.vendorId ?? null,
      units: skus.reduce((s, r) => s + r.units, 0),
      net: skus.reduce((s, r) => s + r.net, 0),
      skus,
    }))
    .sort((a, b) => b.net - a.net || a.vendorName.localeCompare(b.vendorName));

  return {
    byCategory,
    bySku,
    byCategoryRows,
    byVendor,
    net: bySku.reduce((s, r) => s + r.net, 0),
  };
}

/** RFC-4180 escaping — a product name with a comma must not shift columns. */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function salesToCsv(rows: SkuRow[]): string {
  const header = ["Category", "SKU", "Product", "Vendor", "Units", "Net Revenue"];
  const body = rows.map((r) => [r.category, r.sku, r.name, r.vendorName, r.units, r.net]);
  const total = ["Total", "", "", "", rows.reduce((s, r) => s + r.units, 0), rows.reduce((s, r) => s + r.net, 0)];
  return [header, ...body, total].map((line) => line.map(csvCell).join(",")).join("\r\n");
}
