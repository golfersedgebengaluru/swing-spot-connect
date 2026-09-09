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

  it.each(readers)("%s never bounds a timestamp period inclusively", (_name, src) => {
    // Timestamp columns must use a half-open upper bound; only the plain
    // `revenue_date` DATE column may be filtered inclusively.
    expect(src).not.toMatch(/\.lte\("(created_at|start_time)"/);
  });
});

describe("revenue is counted on its business date", () => {
  it.each(readers)("%s filters revenue on revenue_date", (_name, src) => {
    const idx = src.indexOf('.from("revenue_transactions"');
    expect(idx).toBeGreaterThan(0);
    const window = src.slice(idx, idx + 900);
    expect(window).toMatch(/gte\("revenue_date"/);
    expect(window).toMatch(/lte\("revenue_date"/);
    expect(window).not.toMatch(/gte\("created_at"/);
  });

  it.each(readers)("%s uses the shared business-day range helper", (_name, src) => {
    expect(src).toMatch(/reportDayRange|zonedMonthDays/);
  });

  it("manual invoices stamp the revenue date from the invoice date", () => {
    const invoices = read("src/hooks/useInvoices.ts");
    // Now stamped through the single ledger entry point.
    expect(invoices).toMatch(/revenueDate: invoiceDate/);
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
