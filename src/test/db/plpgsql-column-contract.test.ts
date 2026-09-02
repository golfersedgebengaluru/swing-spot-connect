import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardrail: plpgsql trigger/function bodies are only type-checked at RUN time.
 * A single wrong column name silently ships and then aborts a live transaction.
 *
 * This bit us in production: `resolve_revenue_product()` joined
 *
 *   ON hp.hours = ht.hours OR hp.label = ht.description
 *
 * but `hours_transactions` has `note`, not `description`. Because the function
 * is a BEFORE INSERT trigger on `revenue_transactions`, EVERY hour/membership
 * package purchase failed *after* the payment was captured:
 * `complete_hour_purchase()` rolled back, so no hours were credited, no revenue
 * row was written and therefore no invoice was generated
 * (Chennai, ₹25,000, 2 Sep 2026).
 *
 * The test resolves the *effective* (last) definition of every function in
 * `supabase/migrations`, then verifies that every `alias.column` reference to a
 * table in KNOWN_COLUMNS actually exists on that table.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/** Snapshot of columns for the tables our plpgsql functions read from. */
const KNOWN_COLUMNS: Record<string, string[]> = {
  hours_transactions: ["id", "user_id", "type", "hours", "note", "created_by", "created_at", "reason", "service_date", "booking_id"],
  hour_packages: ["id", "hours", "label", "price", "currency", "is_active", "sort_order", "created_at", "updated_at", "service_product_id"],
  member_hours: ["id", "user_id", "hours_purchased", "hours_used", "created_at", "updated_at"],
  bay_pricing: ["id", "city", "day_type", "session_type", "label", "price_per_hour", "currency", "created_at", "updated_at", "service_product_id"],
};

const SQL_KEYWORDS = new Set([
  "on", "where", "set", "using", "select", "join", "left", "inner", "group",
  "order", "limit", "and", "or", "into", "values", "as", "returning",
]);

function effectiveFunctionBodies(): Map<string, string> {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const bodies = new Map<string, string>();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      const name = m[1];
      const openTag = sql.slice(m.index).match(/\$(\w*)\$/);
      if (!openTag) continue;
      const startAbs = m.index + (openTag.index ?? 0) + openTag[0].length;
      const endAbs = sql.indexOf(openTag[0], startAbs);
      if (endAbs === -1) continue;
      bodies.set(name, sql.slice(startAbs, endAbs));
      re.lastIndex = endAbs;
    }
  }
  return bodies;
}

function badReferences(body: string): string[] {
  const bad: string[] = [];
  const aliasRe = /(?:FROM|JOIN|UPDATE|INTO)\s+public\.(\w+)\s+(?:AS\s+)?(\w+)/gi;
  let m: RegExpExecArray | null;
  while ((m = aliasRe.exec(body))) {
    const [, table, aliasRaw] = m;
    const alias = aliasRaw.toLowerCase();
    if (SQL_KEYWORDS.has(alias)) continue;
    const cols = KNOWN_COLUMNS[table];
    if (!cols) continue;
    const colRe = new RegExp(`\\b${alias}\\.(\\w+)\\b`, "gi");
    let c: RegExpExecArray | null;
    while ((c = colRe.exec(body))) {
      const col = c[1].toLowerCase();
      if (!cols.includes(col)) bad.push(`${table}.${col} (alias ${alias})`);
    }
  }
  return [...new Set(bad)];
}

describe("plpgsql functions reference real columns", () => {
  const bodies = effectiveFunctionBodies();

  it("finds function definitions in migrations", () => {
    expect(bodies.size).toBeGreaterThan(10);
    expect(bodies.has("resolve_revenue_product")).toBe(true);
  });

  it("resolve_revenue_product uses hours_transactions.note, not .description", () => {
    const body = bodies.get("resolve_revenue_product")!;
    expect(body).not.toMatch(/ht\.description/i);
    expect(body).toMatch(/ht\.note/i);
  });

  it("no function references an unknown column on the audited tables", () => {
    const failures: string[] = [];
    for (const [name, body] of bodies) {
      for (const ref of badReferences(body)) failures.push(`${name}: ${ref}`);
    }
    expect(failures).toEqual([]);
  });
});
