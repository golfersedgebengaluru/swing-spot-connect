import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const revenueHook = read("src/hooks/useRevenue.ts");
const pnl = read("src/components/admin/ProfitLossView.tsx");
const dashboard = read("src/components/admin/AdminDashboardTab.tsx");

const readers: Array<[string, string]> = [
  ["useRevenue", revenueHook],
  ["ProfitLossView", pnl],
  ["AdminDashboardTab", dashboard],
];

describe("revenue reads use one period helper", () => {
  it.each(readers)("%s imports the shared period helper", (_name, src) => {
    expect(src).toMatch(/from "@\/lib\/report-period"/);
  });

  it.each(readers)("%s never fudges the end of a period with 23:59", (_name, src) => {
    expect(src).not.toMatch(/23:59/);
  });

  it.each(readers)("%s bounds the period with an exclusive upper limit", (_name, src) => {
    expect(src).toMatch(/\.lt\("(created_at|start_time)"/);
    expect(src).not.toMatch(/\.lte\("(created_at|start_time)"/);
  });
});

describe("revenue totals are computed from every row", () => {
  it.each(readers)("%s pages its totalling reads", (_name, src) => {
    expect(src).toMatch(/fetchAllPaged/);
  });

  it("revenue summary pages transactions and profiles", () => {
    const summary = revenueHook.slice(revenueHook.indexOf("export function useRevenueSummary"));
    expect(summary).toMatch(/fetchAllPaged[\s\S]{0,400}revenue_transactions/);
    expect(summary).toMatch(/fetchAllPaged[\s\S]{0,400}profiles/);
  });

  it("revenue summary batches its id lookups", () => {
    const summary = revenueHook.slice(revenueHook.indexOf("export function useRevenueSummary"));
    for (const table of ["products", "invoices", "invoice_line_items"]) {
      const idx = summary.indexOf(`.from("${table}")`);
      expect(idx, table).toBeGreaterThan(0);
      expect(summary.slice(Math.max(0, idx - 300), idx)).toMatch(/fetchAllByIds/);
    }
  });

  it("the paged transaction list still uses range() for the visible page", () => {
    const list = revenueHook.slice(
      revenueHook.indexOf("export function useRevenueTransactions"),
      revenueHook.indexOf("export function useRevenueSummary"),
    );
    expect(list).toMatch(/range\(page \* pageSize/);
  });
});
