import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Pass 2: every sale is recorded in exactly one place.
 *
 * Revenue used to be inserted ad-hoc from many screens. That produced:
 *   • shop orders always priced in rupees, whatever the city's currency
 *   • offline hours purchases recorded as ₹0, so cash sales never showed up
 *   • rows with no city, which then belonged to no city's report
 *   • silently swallowed failures, i.e. sales that vanished
 *
 * The app must now go through `recordRevenue` (which calls the `record_revenue`
 * DB function); the database has revoked direct INSERT for the browser.
 */

const SRC = path.resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test" || entry.name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

const appFiles = walk(SRC).map((p) => [path.relative(SRC, p), fs.readFileSync(p, "utf8")] as const);
const read = (rel: string) => fs.readFileSync(path.resolve(SRC, rel), "utf8");

describe("the app never writes revenue directly", () => {
  it("no screen or hook inserts into revenue_transactions", () => {
    const offenders = appFiles
      .filter(([, src]) => /from\(["']revenue_transactions["']\)[\s\S]{0,40}\.insert\(/.test(src))
      .map(([rel]) => rel);
    expect(offenders).toEqual([]);
  });

  it("only lib/revenue.ts calls the record_revenue entry point", () => {
    const callers = appFiles
      .filter(([, src]) => /rpc\(\s*["']record_revenue["']/.test(src))
      .map(([rel]) => rel);
    expect(callers).toEqual(["lib/revenue.ts"]);
  });
});

describe("shop orders", () => {
  const src = read("hooks/useOrders.ts");

  it("record the sale through the shared ledger", () => {
    expect(src).toMatch(/recordRevenue\(/);
    expect(src).toMatch(/sourceRef: `shop_order:\$\{data\.id\}`/);
    expect(src).toMatch(/transactionType: "product_order"/);
  });

  it("no longer hardcode rupees", () => {
    expect(src).not.toMatch(/currency: "INR"/);
  });

  it("do not hide a failed revenue write", () => {
    // No try/catch around the ledger call: a sale we didn't book must surface.
    expect(src).not.toMatch(/try\s*\{[\s\S]*recordRevenue/);
  });
});

describe("offline hours purchases", () => {
  const src = read("components/admin/AdminMembersTab.tsx");

  it("capture what was collected instead of recording zero", () => {
    expect(src).not.toMatch(/transaction_type: "payment" as any/);
    expect(src).toMatch(/amount: Number\(data\.amount\)/);
    expect(src).toMatch(/Amount Collected/);
    expect(src).toMatch(/Paid By/);
  });

  it("only record a sale when money changed hands", () => {
    expect(src).toMatch(/Number\(data\.amount\) > 0/);
    expect(src).toMatch(/Complimentary/);
  });

  it("attribute the sale to a city", () => {
    expect(src).toMatch(/city: member\.preferred_city \|\| selectedCity \|\| null/);
  });

  it("are keyed to the hours transaction so a retry can't double-count", () => {
    expect(src).toMatch(/sourceRef: `hours_purchase:\$\{htxn\.id\}`/);
  });

  it("blocks confirming a purchase with no amount or payment method", () => {
    expect(src).toMatch(/!isPurchase \|\| \(!!form\.payment_method && \(isComplimentary \|\| form\.amount > 0\)\)/);
  });
});

describe("manual invoices", () => {
  const src = read("hooks/useInvoices.ts");

  it("record revenue through the shared ledger on the invoice date", () => {
    expect(src).toMatch(/recordRevenue\(\{[\s\S]{0,400}revenueDate: invoiceDate/);
    expect(src).toMatch(/sourceRef: `manual_invoice:/);
    expect(src).toMatch(/manual_invoice: true/);
  });
});
