import { describe, it, expect } from "vitest";
import {
  aggregateSales,
  salesToCsv,
  signedAmount,
  UNCATEGORISED,
  UNLINKED_LABEL,
  NO_VENDOR_LABEL,
  type SalesInvoiceLine,
  type SalesProduct,
  type SalesTransaction,
} from "@/lib/sales-by-product";

const products: SalesProduct[] = [
  { id: "p-cap", category: "Apparel", sku: "PRD-BLR-APP-CAP-A1", name: "Cap", vendor_id: "v-1" },
  { id: "p-tee", category: "Apparel", sku: "PRD-BLR-APP-TEE-B2", name: "Tee", vendor_id: "v-1" },
  { id: "p-ball", category: "Accessory", sku: "PRD-BLR-ACC-BALL-C3", name: "Golf Ball", vendor_id: "v-2" },
  { id: "p-coach", category: "Coaching", sku: "SVC-GLB-COA-APEXLY-NTM", name: "Apexlynx Coaching 30", vendor_id: null },
];
const vendorNames = new Map([["v-1", "Acme Apparel"], ["v-2", "ProGolf Supplies"]]);

const txn = (o: Partial<SalesTransaction> & { id: string; amount: number }): SalesTransaction => ({
  transaction_type: "purchase",
  ...o,
});

const run = (
  transactions: SalesTransaction[],
  linesByTransaction?: Map<string, SalesInvoiceLine[]>,
) => aggregateSales({ transactions, products, linesByTransaction, vendorNames });

describe("aggregateSales — category and SKU grouping", () => {
  it("groups sales by category and drills down to SKU", () => {
    const r = run([
      txn({ id: "t1", amount: 1000, product_id: "p-cap" }),
      txn({ id: "t2", amount: 1500, product_id: "p-cap" }),
      txn({ id: "t3", amount: 800, product_id: "p-tee" }),
      txn({ id: "t4", amount: 500, product_id: "p-ball" }),
    ]);

    expect(r.byCategory).toEqual({ Apparel: 3300, Accessory: 500 });

    const apparel = r.byCategoryRows.find((c) => c.category === "Apparel")!;
    expect(apparel.net).toBe(3300);
    expect(apparel.units).toBe(3);
    expect(apparel.skus.map((s) => [s.sku, s.units, s.net])).toEqual([
      ["PRD-BLR-APP-CAP-A1", 2, 2500],
      ["PRD-BLR-APP-TEE-B2", 1, 800],
    ]);
  });

  it("orders SKUs by net revenue so best sellers surface first", () => {
    const r = run([
      txn({ id: "t1", amount: 100, product_id: "p-tee" }),
      txn({ id: "t2", amount: 900, product_id: "p-ball" }),
      txn({ id: "t3", amount: 400, product_id: "p-cap" }),
    ]);
    expect(r.bySku.map((s) => s.name)).toEqual(["Golf Ball", "Cap", "Tee"]);
  });
});

describe("aggregateSales — refunds", () => {
  it("reduces the SKU the refund was earned in, whatever sign it was stored with", () => {
    const r = run([
      txn({ id: "t1", amount: 2000, product_id: "p-cap" }),
      txn({ id: "t2", amount: 500, transaction_type: "refund", product_id: "p-cap" }),
      txn({ id: "t3", amount: -300, transaction_type: "refund", product_id: "p-cap" }),
    ]);
    const cap = r.bySku.find((s) => s.sku === "PRD-BLR-APP-CAP-A1")!;
    expect(cap.net).toBe(1200);
    expect(cap.units).toBe(1); // refunds never inflate unit counts
    expect(r.net).toBe(1200);
  });

  it("signs refunds consistently", () => {
    expect(signedAmount({ id: "a", amount: 500, transaction_type: "refund" })).toBe(-500);
    expect(signedAmount({ id: "a", amount: -500, transaction_type: "refund" })).toBe(-500);
    expect(signedAmount({ id: "a", amount: 500, transaction_type: "purchase" })).toBe(500);
  });

  it("drops buckets that net to zero after a full refund", () => {
    const r = run([
      txn({ id: "t1", amount: 1000, product_id: "p-tee" }),
      txn({ id: "t2", amount: 1000, transaction_type: "refund", product_id: "p-tee" }),
    ]);
    expect(r.bySku.find((s) => s.sku === "PRD-BLR-APP-TEE-B2")).toBeUndefined();
    expect(r.net).toBe(0);
  });
});

describe("aggregateSales — invoice line fallback and unlinked residuals", () => {
  it("uses invoice line products when the revenue row has none", () => {
    const lines = new Map<string, SalesInvoiceLine[]>([
      ["t1", [
        { invoice_id: "i1", line_total: 700, product_id: "p-cap" },
        { invoice_id: "i1", line_total: 300, product_id: "p-ball" },
      ]],
    ]);
    const r = run([txn({ id: "t1", amount: 1000 })], lines);
    expect(r.byCategory).toEqual({ Apparel: 700, Accessory: 300 });
    expect(r.bySku.some((s) => s.name === UNLINKED_LABEL)).toBe(false);
  });

  it("puts only the residual into Unlinked so totals still reconcile", () => {
    const lines = new Map<string, SalesInvoiceLine[]>([
      ["t1", [{ invoice_id: "i1", line_total: 600, product_id: "p-cap" }]],
    ]);
    const r = run([txn({ id: "t1", amount: 1000 })], lines);
    expect(r.byCategory.Apparel).toBe(600);
    expect(r.byCategory[UNCATEGORISED]).toBe(400);
    expect(r.bySku.find((s) => s.name === UNLINKED_LABEL)!.net).toBe(400);
    expect(r.net).toBe(1000);
  });

  it("shows a sale with no product and no invoice as Unlinked, never a guessed bucket", () => {
    const r = run([txn({ id: "t1", amount: 5000, transaction_type: "purchase" })]);
    const unlinked = r.bySku.find((s) => s.name === UNLINKED_LABEL)!;
    expect(unlinked.net).toBe(5000);
    expect(unlinked.units).toBe(1);
    expect(unlinked.category).toBe(UNCATEGORISED);
    expect(r.byCategory).toEqual({ [UNCATEGORISED]: 5000 });
  });

  it("signs invoice-line fallback amounts for refund rows", () => {
    const lines = new Map<string, SalesInvoiceLine[]>([
      ["t2", [{ invoice_id: "i2", line_total: 400, product_id: "p-cap" }]],
    ]);
    const r = run([
      txn({ id: "t1", amount: 1000, product_id: "p-cap" }),
      txn({ id: "t2", amount: 400, transaction_type: "refund" }),
    ], lines);
    expect(r.byCategory.Apparel).toBe(600);
    expect(r.net).toBe(600);
  });

  it("total across every bucket always equals net revenue of the period", () => {
    const lines = new Map<string, SalesInvoiceLine[]>([
      ["t3", [{ invoice_id: "i3", line_total: 250, product_id: "p-coach" }]],
    ]);
    const transactions = [
      txn({ id: "t1", amount: 1000, product_id: "p-cap" }),
      txn({ id: "t2", amount: 2000 }),
      txn({ id: "t3", amount: 900 }),
      txn({ id: "t4", amount: 300, transaction_type: "refund", product_id: "p-ball" }),
    ];
    const r = run(transactions, lines);
    const expected = transactions.reduce((s, t) => s + signedAmount(t), 0);
    expect(r.net).toBe(expected);
    expect(Object.values(r.byCategory).reduce((a, b) => a + b, 0)).toBe(expected);
    expect(r.byVendor.reduce((s, v) => s + v.net, 0)).toBe(expected);
  });
});

describe("aggregateSales — vendor view", () => {
  it("groups SKUs by vendor and labels items without one", () => {
    const r = run([
      txn({ id: "t1", amount: 1000, product_id: "p-cap" }),
      txn({ id: "t2", amount: 500, product_id: "p-tee" }),
      txn({ id: "t3", amount: 700, product_id: "p-ball" }),
      txn({ id: "t4", amount: 2000, product_id: "p-coach" }),
    ]);
    expect(r.byVendor.map((v) => [v.vendorName, v.net])).toEqual([
      [NO_VENDOR_LABEL, 2000],
      ["Acme Apparel", 1500],
      ["ProGolf Supplies", 700],
    ]);
    expect(r.byVendor.find((v) => v.vendorName === "Acme Apparel")!.skus).toHaveLength(2);
  });

  it("keeps unlinked sales visible in the vendor view", () => {
    const r = run([txn({ id: "t1", amount: 400 })]);
    expect(r.byVendor[0].vendorName).toBe(NO_VENDOR_LABEL);
    expect(r.byVendor[0].skus[0].name).toBe(UNLINKED_LABEL);
  });
});

describe("aggregateSales — scale and missing catalogue rows", () => {
  it("handles more than 1000 transactions (paged fetches concatenated)", () => {
    const many = Array.from({ length: 2500 }, (_, i) =>
      txn({ id: `t${i}`, amount: 10, product_id: i % 2 === 0 ? "p-cap" : "p-ball" }),
    );
    const r = run(many);
    expect(r.net).toBe(25000);
    expect(r.bySku.find((s) => s.sku === "PRD-BLR-APP-CAP-A1")!.units).toBe(1250);
  });

  it("does not hide a sale whose product row is missing from the catalogue", () => {
    const r = run([txn({ id: "t1", amount: 900, product_id: "p-deleted" })]);
    expect(r.net).toBe(900);
    expect(r.bySku[0].name).toBe("Unknown item");
    expect(r.bySku[0].category).toBe(UNCATEGORISED);
  });
});

describe("salesToCsv", () => {
  it("exports every SKU row with a total line", () => {
    const r = run([
      txn({ id: "t1", amount: 1000, product_id: "p-cap" }),
      txn({ id: "t2", amount: 500, product_id: "p-ball" }),
    ]);
    const lines = salesToCsv(r.bySku).split("\r\n");
    expect(lines[0]).toBe('"Category","SKU","Product","Vendor","Units","Net Revenue"');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('"PRD-BLR-APP-CAP-A1"');
    expect(lines[3]).toBe('"Total","","","","2","1500"');
  });

  it("escapes quotes and commas so columns never shift", () => {
    const r = aggregateSales({
      transactions: [txn({ id: "t1", amount: 100, product_id: "p-x" })],
      products: [{ id: "p-x", category: "Apparel", sku: "SKU,1", name: 'Cap "Pro", Large' }],
    });
    expect(salesToCsv(r.bySku).split("\r\n")[1]).toBe(
      '"Apparel","SKU,1","Cap ""Pro"", Large","No vendor","1","100"',
    );
  });
});
