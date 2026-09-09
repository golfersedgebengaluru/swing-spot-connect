import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Guards the "revenue is counted on its invoice date" rule at the DB level.
 *
 * Before this, `revenue_transactions.created_at` decided the reporting month, so
 * an invoice dated 8 August but entered on 9 September was reported in
 * September (Apexlynx, ₹27,258, Bengaluru).
 *
 * Three layers, all asserted here against the migration source:
 *   1. a `revenue_date` column, NOT NULL, defaulting to today's IST date
 *   2. an insert trigger that stamps the date and back-fills a missing city
 *   3. an invoice trigger that keeps the revenue date equal to the invoice date
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

const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

describe("revenue business date (migration contract)", () => {
  it("adds a revenue_date column", () => {
    const sql = norm(latestSqlDefining("revenue_date date"));
    expect(sql).toContain("alter table public.revenue_transactions add column if not exists revenue_date date");
  });

  it("makes revenue_date mandatory and defaults it to today in IST", () => {
    const sql = norm(latestSqlDefining("ALTER COLUMN revenue_date SET NOT NULL"));
    expect(sql).toContain("alter column revenue_date set not null");
    expect(sql).toContain("now() at time zone 'asia/kolkata')::date");
  });

  it("stamps the date and back-fills a missing city on insert", () => {
    const sql = latestSqlDefining("CREATE OR REPLACE FUNCTION public.stamp_revenue_defaults()");
    const body = sql.slice(sql.indexOf("FUNCTION public.stamp_revenue_defaults()"));
    expect(body).toContain("NEW.revenue_date IS NULL");
    expect(body).toContain("AT TIME ZONE 'Asia/Kolkata')::date");
    // city fallbacks: explicit metadata, the linked booking, the reversed txn
    expect(body).toContain("NEW.metadata ? 'city'");
    expect(body).toContain("FROM public.bookings b WHERE b.id = NEW.booking_id");
    expect(body).toContain("WHERE r.id = NEW.original_transaction_id");
    expect(norm(body)).toContain("before insert on public.revenue_transactions");
  });

  it("keeps the revenue date in step with the invoice date", () => {
    const sql = latestSqlDefining("CREATE OR REPLACE FUNCTION public.sync_revenue_date_from_invoice()");
    const body = norm(sql.slice(sql.indexOf("FUNCTION public.sync_revenue_date_from_invoice()")));
    expect(body).toContain("set revenue_date = new.invoice_date");
    expect(body).toContain("where id = new.revenue_transaction_id");
    // must fire on creation AND on later edits of the invoice date
    expect(body).toContain("after insert or update of invoice_date");
  });

  it("indexes the reporting filter (city, revenue_date)", () => {
    const sql = norm(latestSqlDefining("idx_revenue_transactions_city_revenue_date"));
    expect(sql).toContain("on public.revenue_transactions (city, revenue_date)");
  });
});
