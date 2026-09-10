import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Pass 4: every sale says what was sold, and every invoice line carries a code.
 *
 * Revenue rows used to land without a product (91% of them), so a revenue
 * report could not be split by category, and invoice lines were saved with no
 * HSN/SAC code — or with a code carrying a leading space, which produced a
 * phantom second row in the GSTR-1 summary. The fixes live in the database, so
 * they hold for every writer: the browser, the edge functions and manual SQL.
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

function bodyOf(marker: string): string {
  const sql = latestSqlDefining(marker);
  return sql.slice(sql.indexOf(marker));
}

const RESOLVER = "CREATE OR REPLACE FUNCTION public.resolve_product_for_revenue(";
const resolver = bodyOf(RESOLVER);

const STAMP_TRIGGER_FN = "CREATE OR REPLACE FUNCTION public.resolve_revenue_product()";
const stampTrigger = bodyOf(STAMP_TRIGGER_FN);

const LINE_STAMP = "CREATE OR REPLACE FUNCTION public.stamp_invoice_line_tax_codes()";
const lineStamp = bodyOf(LINE_STAMP);

const NORMALISER = "CREATE OR REPLACE FUNCTION public.normalize_tax_codes()";
const normaliser = bodyOf(NORMALISER);

const PRODUCT_GUARD = "CREATE OR REPLACE FUNCTION public.validate_product_tax_codes()";
const productGuard = bodyOf(PRODUCT_GUARD);

const migration = latestSqlDefining(RESOLVER);

describe("resolve_product_for_revenue: one resolver, used everywhere", () => {
  it("prefers a product named explicitly in the metadata, and checks it exists", () => {
    expect(resolver).toContain("p_metadata->>'product_id'");
    expect(resolver).toContain("EXISTS (SELECT 1 FROM public.products WHERE id = v_product)");
  });

  it("resolves a bay booking on city, session type and IST day type", () => {
    expect(resolver).toContain("FROM public.bay_pricing bp");
    expect(resolver).toContain("AT TIME ZONE 'Asia/Kolkata'");
    expect(resolver).toContain("bp.day_type = v_day_type");
  });

  it("falls back to the same session type on any day type before giving up", () => {
    const exact = resolver.indexOf("bp.day_type = v_day_type");
    const loose = resolver.indexOf("same session type, any day type");
    expect(exact).toBeGreaterThan(-1);
    expect(loose).toBeGreaterThan(exact);
  });

  // Regression: the booking lookup used to test `v_booking IS NOT NULL` on a
  // record, which is false whenever any single field is null — so a booking
  // with no session type silently skipped resolution.
  it("defaults a missing session type instead of skipping the booking", () => {
    expect(resolver).toContain("'practice')");
    expect(resolver).not.toContain("IF v_booking IS NOT NULL THEN");
  });

  // Regression: hours_transactions has `note`, not `description`.
  it("matches an hour package on the note or the hours, never a description column", () => {
    expect(resolver).toContain("hp.label = ht.note OR hp.hours = ht.hours");
    expect(resolver).not.toContain("ht.description");
  });

  it("resolves a league registration from the league's service product", () => {
    expect(resolver).toContain("p_transaction_type = 'league_registration'");
    expect(resolver).toContain("l.service_product_id");
  });

  it("uses an itemised invoice as a last resort, taking the biggest line", () => {
    expect(resolver).toContain("i.revenue_transaction_id = p_revenue_id");
    expect(resolver).toContain("ORDER BY li.line_total DESC NULLS LAST");
  });

  it("is read-only, so it is safe to call from a trigger and from the backfill", () => {
    expect(resolver).toContain("STABLE");
    expect(resolver).not.toMatch(/\bUPDATE public\.|\bINSERT INTO public\./);
  });

  it("is not callable by visitors or signed-in users", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.resolve_product_for_revenue(uuid, text, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;"
    );
  });
});

describe("revenue rows are stamped with the product", () => {
  it("never overwrites a product the caller supplied", () => {
    expect(stampTrigger).toMatch(/IF NEW\.product_id IS NOT NULL THEN\s+RETURN NEW;/);
  });

  it("delegates to the shared resolver rather than repeating the lookups", () => {
    expect(stampTrigger).toContain("public.resolve_product_for_revenue(");
  });

  // A manual invoice inserts the revenue row first and links the booking after,
  // so insert-only stamping left those rows untagged.
  it("also stamps when the booking or hours link appears later", () => {
    expect(migration).toContain("BEFORE UPDATE OF booking_id, hours_transaction_id, metadata ON public.revenue_transactions");
    expect(migration).toContain("BEFORE INSERT ON public.revenue_transactions");
  });

  it("backfills historical sales without touching the money", () => {
    expect(migration).toContain("UPDATE public.revenue_transactions r");
    expect(migration).toContain("SET product_id = public.resolve_product_for_revenue(");
    expect(migration).toMatch(/WHERE r\.product_id IS NULL\s+AND r\.amount > 0/);
    expect(migration).not.toMatch(/SET amount =|SET city =|SET revenue_date =/);
  });

  it("gives a refund the product of the sale it reverses", () => {
    expect(migration).toContain("r.original_transaction_id = o.id");
  });

  it("indexes the product so category reports stay fast", () => {
    expect(migration).toContain("idx_revenue_transactions_product_id");
  });
});

describe("invoice lines inherit their tax code", () => {
  it("copies HSN, SAC and item type from the linked product", () => {
    expect(lineStamp).toContain("FROM public.products p");
    expect(lineStamp).toContain("NEW.hsn_code  := v_product.hsn;");
    expect(lineStamp).toContain("NEW.sac_code  := v_product.sac;");
    expect(lineStamp).toContain("NEW.item_type := COALESCE(NEW.item_type, v_product.item_type);");
  });

  it("leaves a code the caller supplied alone", () => {
    expect(lineStamp).toMatch(/IF NEW\.hsn_code IS NOT NULL OR NEW\.sac_code IS NOT NULL THEN\s+RETURN NEW;/);
  });

  it("runs on insert and whenever the product or codes change", () => {
    expect(migration).toContain(
      "BEFORE INSERT OR UPDATE OF product_id, hsn_code, sac_code ON public.invoice_line_items"
    );
  });

  it("backfills existing lines from their product", () => {
    expect(migration).toContain("UPDATE public.invoice_line_items li");
    expect(migration).toMatch(/AND li\.hsn_code IS NULL\s+AND li\.sac_code IS NULL/);
  });
});

describe("codes are stored clean", () => {
  it("trims whitespace and turns an empty code into no code", () => {
    expect(normaliser).toContain("NEW.hsn_code := NULLIF(btrim(COALESCE(NEW.hsn_code, '')), '');");
    expect(normaliser).toContain("NEW.sac_code := NULLIF(btrim(COALESCE(NEW.sac_code, '')), '');");
  });

  it("is attached to both products and invoice lines", () => {
    expect(migration).toContain("normalize_tax_codes_on_products");
    expect(migration).toContain("normalize_tax_codes_on_invoice_line_items");
  });

  it("cleans the rows that already carried a leading space", () => {
    expect(migration).toContain("UPDATE public.products");
    expect(migration).toContain("SET hsn_code = NULLIF(btrim(hsn_code), '')");
  });
});

describe("a taxable product needs a code", () => {
  it("refuses a new taxable product with neither code", () => {
    expect(productGuard).toContain("TG_OP = 'INSERT'");
    expect(productGuard).toContain("an HSN or SAC code is required when GST is above zero");
  });

  it("refuses to clear a code that was already set", () => {
    expect(productGuard).toContain("cannot be removed once set");
    expect(productGuard).toContain("OLD.hsn_code");
  });

  it("still allows editing a legacy uncoded product", () => {
    // Nothing set before, nothing set now: the update goes through, so an
    // admin can fix a name or price without being forced to research a code.
    expect(productGuard).toMatch(/RETURN NEW;\s+END;/);
  });

  it("does not fire on unrelated column updates", () => {
    expect(migration).toContain(
      "BEFORE INSERT OR UPDATE OF hsn_code, sac_code, gst_rate ON public.products"
    );
  });
});
