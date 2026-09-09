import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Pass 3: money going back out has exactly one writer.
 *
 * Refunds used to be inserted by each cancellation path as POSITIVE amounts
 * with no unique key. Two consequences:
 *   • any report that forgot to special-case `transaction_type = 'refund'`
 *     counted a refund as income
 *   • a retried cancellation could refund the same sale twice
 *
 * `record_refund` stores them negative, caps them at the original sale and
 * de-duplicates on `source_ref`.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

function latestSqlDefining(marker: string): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, files[i]), "utf8");
    if (sql.includes(marker)) return sql;
  }
  throw new Error(`No migration defines ${marker}`);
}

const MARKER = "CREATE OR REPLACE FUNCTION public.record_refund(";
const sql = latestSqlDefining(MARKER);
const body = sql.slice(sql.indexOf(MARKER));
const norm = (s: string) => s.replace(/\s+/g, " ");

describe("record_refund (migration contract)", () => {
  it("runs as a definer function with a fixed search path", () => {
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toMatch(/SET search_path TO 'public'/);
  });

  // Regression from pass 2: Postgres grants EXECUTE to PUBLIC by default, so
  // revoking from `anon` alone still left signed-out visitors able to call it.
  it("is not callable by signed-out visitors", () => {
    const grants = norm(latestSqlDefining("ON FUNCTION public.record_refund"));
    expect(grants).toMatch(/REVOKE ALL ON FUNCTION public\.record_refund\([^)]*\) FROM PUBLIC/);
    expect(grants).toMatch(/REVOKE ALL ON FUNCTION public\.record_refund\([^)]*\) FROM anon/);
    expect(grants).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_refund\([^)]*\) TO authenticated/);
    expect(grants).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_refund\([^)]*\) TO service_role/);
  });

  it("requires staff (or the server) to issue a refund", () => {
    expect(body).toContain("has_role(v_uid, 'admin')");
    expect(body).toContain("has_role(v_uid, 'site_admin')");
    expect(body).toMatch(/not authorised/i);
  });

  it("stores refunds as negative amounts", () => {
    expect(norm(body)).toMatch(/'refund', -p_amount/);
  });

  it("is idempotent on source_ref", () => {
    expect(body).toContain("source_ref");
    expect(norm(body)).toMatch(/WHERE source_ref = btrim\(p_source_ref\)/);
    expect(norm(body)).toContain("ON CONFLICT (source_ref) DO NOTHING");
  });

  it("locks the original sale and refuses to over-refund", () => {
    expect(norm(body)).toContain("pg_advisory_xact_lock");
    expect(norm(body)).toMatch(/exceed|refundable/i);
  });

  it("inherits the original sale's city, currency and customer", () => {
    for (const col of ["city", "currency", "user_id", "product_id"]) {
      expect(body).toContain(col);
    }
  });
});

describe("refund sign is enforced by the database", () => {
  it("has a trigger rejecting positive refunds and negative sales", () => {
    const guard = norm(latestSqlDefining("validate_revenue_refund_sign"));
    expect(guard).toMatch(/a refund must be recorded as a negative amount/i);
    expect(guard).toMatch(/only refunds may be negative/i);
    expect(guard).toMatch(
      /CREATE TRIGGER validate_revenue_refund_sign_before_insert BEFORE INSERT ON public\.revenue_transactions/,
    );
  });
});
