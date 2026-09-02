import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guards the fix for duplicate invoices on manually created invoices.
 *
 * Root cause: the manual "Create Invoice" flow inserts a confirmed
 * revenue_transaction (which fires `trg_auto_create_invoice`) and then inserts
 * its own itemised invoice. Both writers raced, so one payment ended up with
 * two invoices and two invoice numbers.
 *
 * The fix has three layers, all asserted here against the migration source:
 *   1. a unique index so a revenue transaction can only carry one invoice
 *   2. the trigger skips revenue rows flagged `manual_invoice`
 *   3. the generator serialises per revenue row and swallows unique_violation
 *      by returning the invoice the other writer created
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

function latestSqlDefining(marker: string): string {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, files[i]), "utf8");
    if (sql.includes(marker)) return sql;
  }
  throw new Error(`No migration defines ${marker}`);
}

describe("invoice duplicate guard (migration contract)", () => {
  it("declares a unique index limiting one invoice per revenue transaction", () => {
    const sql = latestSqlDefining("invoices_one_per_revenue_txn");
    const normalised = sql.replace(/\s+/g, " ").toLowerCase();
    expect(normalised).toContain("create unique index");
    expect(normalised).toContain("on public.invoices (revenue_transaction_id)");
    expect(normalised).toContain("where revenue_transaction_id is not null and invoice_type = 'invoice'");
  });

  it("trigger skips revenue rows flagged manual_invoice", () => {
    const sql = latestSqlDefining("FUNCTION public.trg_auto_create_invoice()");
    const body = sql.slice(sql.indexOf("FUNCTION public.trg_auto_create_invoice()"));
    const guardIdx = body.indexOf("manual_invoice");
    const callIdx = body.indexOf("auto_create_invoice_for_revenue(NEW.id)");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(-1);
    // the guard must return before the auto-create call is reached
    expect(guardIdx).toBeLessThan(callIdx);
    expect(body.slice(guardIdx, callIdx)).toContain("RETURN NEW");
  });

  it("generator serialises per revenue row and is race-safe", () => {
    const sql = latestSqlDefining("FUNCTION public.auto_create_invoice_for_revenue(p_revenue_id uuid)");
    const body = sql.slice(sql.indexOf("FUNCTION public.auto_create_invoice_for_revenue(p_revenue_id uuid)"));
    const lockIdx = body.indexOf("pg_advisory_xact_lock");
    const existsIdx = body.indexOf("WHERE revenue_transaction_id = p_revenue_id");
    expect(lockIdx).toBeGreaterThan(-1);
    // lock is taken before the "does an invoice already exist?" check
    expect(lockIdx).toBeLessThan(existsIdx);
    expect(body).toContain("WHEN unique_violation THEN");
    // and the number is only allocated after the existence check
    expect(body.indexOf("get_next_invoice_number")).toBeGreaterThan(existsIdx);
  });
});
