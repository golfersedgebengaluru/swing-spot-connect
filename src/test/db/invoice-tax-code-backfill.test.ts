import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * August 2026 is the only period whose GSTR-1 is still unfiled, and Bengaluru is
 * the only GST-registered city, so the code fill is deliberately scoped: one
 * date range, one city, codes only — never amounts, dates or invoice numbers.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");
const MARKER = "CREATE OR REPLACE FUNCTION public.backfill_invoice_line_tax_codes(";

function latestSqlDefining(marker: string): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, files[i]), "utf8");
    if (sql.includes(marker)) return sql;
  }
  throw new Error(`No migration defines ${marker}`);
}

const migration = latestSqlDefining(MARKER);
const body = (() => {
  const start = migration.indexOf(MARKER);
  const end = migration.indexOf("\n$$;", start);
  return migration.slice(start, end === -1 ? undefined : end);
})();

describe("backfill_invoice_line_tax_codes", () => {
  it("takes a date range and an optional city, so one city can be filled alone", () => {
    expect(body).toContain("_from_date date");
    expect(body).toContain("_to_date date");
    expect(body).toContain("_city text DEFAULT NULL");
    expect(body).toContain("(_city IS NULL OR i.city = _city)");
  });

  it("refuses to run without a date range, so it can never touch every invoice", () => {
    expect(body).toContain("from_date and to_date are required");
  });

  it("only fills a line that has no code yet", () => {
    expect(body).toContain(
      "AND COALESCE(NULLIF(btrim(li.hsn_code), ''), NULLIF(btrim(li.sac_code), '')) IS NULL"
    );
  });

  it("takes the code from the linked catalogue item and never invents one", () => {
    expect(body).toContain("li.product_id = p.id");
    expect(body).toContain(
      "AND COALESCE(NULLIF(btrim(p.hsn_code), ''), NULLIF(btrim(p.sac_code), '')) IS NOT NULL"
    );
  });

  it("stores the code trimmed, so GSTR-1 cannot split into a phantom row", () => {
    expect(body).toContain("hsn_code = NULLIF(btrim(p.hsn_code), '')");
    expect(body).toContain("sac_code = NULLIF(btrim(p.sac_code), '')");
  });

  it("changes codes only — no amount, tax rate, date, city or number", () => {
    expect(body).not.toMatch(/SET[\s\S]*?(line_total|unit_price|gst_rate|invoice_date|quantity)\s*=/);
  });

  it("is repeatable: a second run finds nothing left to change", () => {
    // Idempotent by construction — the WHERE clause excludes any line that now
    // has a code, so re-running after coding more catalogue items is safe.
    expect(body).toContain("RETURN v_count;");
  });

  it("is not callable from the browser", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.backfill_invoice_line_tax_codes(date, date, text) FROM PUBLIC, anon, authenticated;"
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.backfill_invoice_line_tax_codes(date, date, text) TO service_role;"
    );
  });

  it("leaves only the city-aware version behind", () => {
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.backfill_invoice_line_tax_codes(date, date);");
  });
});
