import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A paid sale must never land without a city again.
 *
 * Blank-city revenue rows came from capture forms that simply never asked for a
 * city (admin "Add Hours"), so the guardrail lives where the data is written:
 * the single writer resolves the city, and a table trigger is the last defence.
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

const WRITER = "CREATE OR REPLACE FUNCTION public.record_revenue(";
const writerSql = latestSqlDefining(WRITER);
const writer = writerSql.slice(writerSql.indexOf(WRITER));

const TRIGGER_FN = "CREATE OR REPLACE FUNCTION public.validate_revenue_city_before_insert()";
const triggerSql = latestSqlDefining(TRIGGER_FN);
const triggerFn = triggerSql.slice(triggerSql.indexOf(TRIGGER_FN));

describe("record_revenue: city is mandatory for money", () => {
  it("recovers the city from the booking or its bay", () => {
    expect(writer).toContain("FROM public.bookings bk");
    expect(writer).toContain("LEFT JOIN public.bays bay ON bay.id = bk.bay_id");
    expect(writer).toContain("bk.city, bay.city");
  });

  // Regression: the first attempt read profiles.city, which does not exist —
  // the column is preferred_city, so the fallback errored at runtime.
  it("falls back to the member's preferred city, matched on either key", () => {
    expect(writer).toContain("pr.preferred_city");
    expect(writer).toContain("pr.user_id = p_user_id OR pr.id = p_user_id");
    expect(writer).not.toContain("pr.city");
  });

  it("refuses a paid sale when no city can be resolved", () => {
    expect(writer).toContain("city is required for a paid transaction");
    const guard = writer.indexOf("city is required for a paid transaction");
    const insert = writer.indexOf("INSERT INTO public.revenue_transactions");
    expect(guard).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(guard);
  });

  it("stores the resolved city, not the raw argument", () => {
    expect(writer).toMatch(/p_amount, v_currency, v_city,/);
  });

  it("still records nothing at all for a zero amount", () => {
    expect(writer).toMatch(/IF p_amount = 0 THEN\s+RETURN NULL;/);
  });
});

describe("revenue_transactions city trigger (last defence)", () => {
  it("blocks any non-zero row with a blank city", () => {
    expect(triggerFn).toContain("NEW.amount <> 0");
    expect(triggerFn).toContain("btrim(COALESCE(NEW.city, ''))");
    expect(triggerFn).toContain("city is required for non-zero amounts");
  });

  it("leaves zero-value rows alone", () => {
    expect(triggerFn).toMatch(/NEW\.amount IS NOT NULL AND NEW\.amount <> 0/);
  });

  it("fires before every insert", () => {
    const norm = latestSqlDefining("CREATE TRIGGER validate_revenue_city_before_insert").replace(/\s+/g, " ");
    expect(norm).toMatch(
      /CREATE TRIGGER validate_revenue_city_before_insert BEFORE INSERT ON public\.revenue_transactions FOR EACH ROW EXECUTE FUNCTION public\.validate_revenue_city_before_insert\(\)/,
    );
  });


  // Regression: a SECURITY DEFINER trigger function tripped the security
  // linter (callable by signed-in users); a trigger needs no elevation.
  it("is not an API surface", () => {
    const norm = latestSqlDefining(
      "ON FUNCTION public.validate_revenue_city_before_insert()",
    ).replace(/\s+/g, " ");
    expect(norm).toContain("SECURITY INVOKER");
    expect(norm).toMatch(
      /REVOKE ALL ON FUNCTION public\.validate_revenue_city_before_insert\(\) FROM authenticated/,
    );
  });
});
