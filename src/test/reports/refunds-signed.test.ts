import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { aggregateSales } from "@/lib/sales-by-product";

/**
 * Pass 3: refunds are stored as negative amounts.
 *
 * Every report must therefore either sum plainly or normalise with Math.abs.
 * The old code added `t.amount` for refunds after flipping the sign itself,
 * which — now that the row is already negative — would have ADDED refunds to
 * income.
 */

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.resolve(SRC, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const appFiles = walk(SRC).map((p) => [path.relative(SRC, p), fs.readFileSync(p, "utf8")] as const);

describe("the app never writes refunds directly", () => {
  it("only lib/revenue.ts calls the record_refund entry point", () => {
    const callers = appFiles
      .filter(([, src]) => /rpc\(\s*["']record_refund["']/.test(src))
      .map(([rel]) => rel);
    expect(callers).toEqual(["lib/revenue.ts"]);
  });

  it("no screen or hook inserts a refund row", () => {
    const offenders = appFiles
      .filter(([, src]) => /from\(["']revenue_transactions["']\)[\s\S]{0,40}\.insert\(/.test(src))
      .map(([rel]) => rel);
    expect(offenders).toEqual([]);
  });

  it("the client wrapper refuses a non-positive magnitude", () => {
    const src = read("lib/revenue.ts");
    expect(src).toContain("export async function recordRefund");
    expect(src).toContain("if (!(params.amount > 0)) return null;");
  });
});

describe("report totals treat refunds as money out", () => {
  it("the revenue summary reports refunds as a positive magnitude", () => {
    const src = read("hooks/useRevenue.ts");
    expect(src).toMatch(/totalRefunds[\s\S]{0,200}Math\.abs\(Number\(t\.amount\)\)/);
    expect(src).toContain("netRevenue: totalRevenue - totalRefunds");
  });

  it("the category breakdown lets a refund reduce its own category", () => {
    // Executed, not grepped: the breakdown arithmetic lives in one shared module.
    const { byCategory, net } = aggregateSales({
      transactions: [
        { id: "t1", amount: 3000, transaction_type: "purchase", product_id: "p-cap" },
        { id: "t2", amount: 500, transaction_type: "refund", product_id: "p-cap" },
      ],
      products: [{ id: "p-cap", category: "Apparel", sku: "SKU-CAP", name: "Cap" }],
    });
    expect(byCategory).toEqual({ Apparel: 2500 });
    expect(net).toBe(2500);
  });

  it("the summary hook feeds its buckets through that shared module", () => {
    const src = read("hooks/useRevenue.ts");
    expect(src).toContain("aggregateSales(");
    expect(src).toContain("byCategory: sales.byCategory");
  });

  it("the dashboard subtracts the magnitude, never the signed value", () => {
    const src = read("components/admin/AdminDashboardTab.tsx");
    expect(src).toContain('if (t.transaction_type === "refund") return sum - Math.abs(amount);');
  });

  it("the P&L reads either sign", () => {
    const src = read("components/admin/ProfitLossView.tsx");
    expect(src).toContain("refunds += Math.abs(t.amount)");
    expect(src).toContain("netRevenue: revenue - refunds");
  });

  it("the revenue list shows a single minus sign", () => {
    const src = read("components/admin/AdminRevenueTab.tsx");
    expect(src).toContain("Math.abs(Number(t.amount ?? 0)).toLocaleString()");
    expect(src).not.toContain("t.amount > 0 ? `${currencySymbol}${Number(t.amount).toLocaleString()}`");
  });
});

describe("net revenue arithmetic (worked example)", () => {
  // Chennai-style month: two sales, one reversed. Net must be the sale that stood.
  const rows = [
    { transaction_type: "payment", amount: 5200, status: "confirmed" },
    { transaction_type: "payment", amount: 2000, status: "confirmed" },
    { transaction_type: "refund", amount: -2000, status: "confirmed" },
  ];

  it("nets out to the sale that stood", () => {
    const gross = rows
      .filter((t) => t.transaction_type !== "refund")
      .reduce((s, t) => s + t.amount, 0);
    const refunds = rows
      .filter((t) => t.transaction_type === "refund")
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    expect(gross).toBe(7200);
    expect(refunds).toBe(2000);
    expect(gross - refunds).toBe(5200);
  });

  it("gives the same net for legacy rows stored positive", () => {
    const legacy = rows.map((t) =>
      t.transaction_type === "refund" ? { ...t, amount: Math.abs(t.amount) } : t,
    );
    const net =
      legacy
        .filter((t) => t.transaction_type !== "refund")
        .reduce((s, t) => s + t.amount, 0) -
      legacy
        .filter((t) => t.transaction_type === "refund")
        .reduce((s, t) => s + Math.abs(t.amount), 0);
    expect(net).toBe(5200);
  });
});
