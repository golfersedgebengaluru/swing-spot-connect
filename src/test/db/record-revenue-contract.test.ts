import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** Guards the single-writer contract at the database level. */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

function latestSqlDefining(marker: string): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, files[i]), "utf8");
    if (sql.includes(marker)) return sql;
  }
  throw new Error(`No migration defines ${marker}`);
}

const MARKER = "CREATE OR REPLACE FUNCTION public.record_revenue(";
const sql = latestSqlDefining(MARKER);
const body = sql.slice(sql.indexOf(MARKER));

describe("record_revenue (migration contract)", () => {
  it("is the only way the browser can record revenue", () => {
    const norm = latestSqlDefining("REVOKE INSERT ON public.revenue_transactions").replace(/\s+/g, " ");
    expect(norm).toContain("REVOKE INSERT ON public.revenue_transactions FROM anon, authenticated");
  });


  // Regression: Postgres grants EXECUTE to PUBLIC by default, so revoking from
  // `anon` alone left signed-out visitors able to record a sale.
  it("is not callable by signed-out visitors", () => {
    const norm = latestSqlDefining("FROM PUBLIC, anon").replace(/\s+/g, " ");
    expect(norm).toMatch(/REVOKE ALL ON FUNCTION public\.record_revenue\([^)]*\) FROM PUBLIC, anon/);
    expect(norm).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_revenue\([^)]*\) TO authenticated, service_role/);
  });

  // Regression: `ON CONFLICT (source_ref)` needs a plain unique index; the first
  // attempt used a partial one, which Postgres refuses to match.
  it("has a unique index backing the de-duplication", () => {
    const norm = latestSqlDefining("revenue_transactions_source_ref_key").replace(/\s+/g, " ");
    expect(norm).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS revenue_transactions_source_ref_key ON public\.revenue_transactions \(source_ref\);/,
    );
    expect(norm).not.toMatch(/revenue_transactions_source_ref_key ON public\.revenue_transactions \(source_ref\) WHERE/);
  });

  it("runs with a fixed search path", () => {
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = public");
  });

  it("lets a member record only their own shop order, staff anything", () => {
    expect(body).toContain("has_role(v_uid, 'admin')");
    expect(body).toContain("has_role(v_uid, 'site_admin')");
    expect(body).toContain("p_transaction_type = 'product_order' AND p_user_id = v_uid");
    expect(body).toContain("not authorised");
  });

  it("is idempotent on source_ref, before and after the insert", () => {
    const first = body.indexOf("WHERE source_ref = p_source_ref");
    const conflict = body.indexOf("ON CONFLICT (source_ref) DO NOTHING");
    expect(first).toBeGreaterThan(-1);
    expect(conflict).toBeGreaterThan(first);
    // and a re-read for the writer that lost the race
    expect(body.indexOf("WHERE source_ref = btrim(p_source_ref)")).toBeGreaterThan(conflict);
  });

  it("refuses a sale with no key, type or a negative amount", () => {
    expect(body).toContain("source_ref is required");
    expect(body).toContain("transaction_type is required");
    expect(body).toContain("amount must be zero or positive");
  });

  it("records nothing for a zero amount", () => {
    expect(body).toMatch(/IF p_amount = 0 THEN\s+RETURN NULL;/);
  });

  it("takes the currency from the resolved city, never a hardcoded rupee", () => {
    expect(body).toContain("SELECT b.currency FROM public.bays b");
    expect(body).toContain("WHERE b.city = v_city");
  });


  it("always writes a confirmed row", () => {
    expect(body).toContain("'confirmed'");
  });
});
