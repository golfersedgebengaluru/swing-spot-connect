import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardrail: Supabase JS query builders (`.from(...)`, `.rpc(...)`,
 * `.select(...)`, `.storage.from(...)`, `.auth.admin.*`) are *thenables*, not
 * real Promises. Chaining `.catch(...)` directly on the builder crashes at
 * runtime with:
 *
 *   TypeError: supabase.rpc(...).catch is not a function
 *
 * This exact bug crashed the league-service edge function (`legacy-claim-invites`
 * route) on every member login, breaking the /leagues screen for signed-in
 * users. Always `await` the builder and handle the returned `error` field, or
 * wrap in a `try { await ... } catch {}` block.
 *
 * This test scans every edge function source file and fails if the forbidden
 * pattern reappears.
 */

const ROOT = join(process.cwd(), "supabase", "functions");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

// Matches `<something>.rpc(...args).catch(` or `.from(...).<chain>.catch(` etc.
// We flag `.catch(` that immediately follows a closing paren belonging to a
// supabase-builder call chain (`.rpc`, `.from`, `.select`, `.insert`,
// `.update`, `.delete`, `.upsert`, `.single`, `.maybeSingle`, `.eq`, `.in`,
// `.order`, `.limit`, `.range`, `.returns`) without an intervening `await`.
const BUILDER_METHODS = [
  "rpc", "from", "select", "insert", "update", "delete", "upsert",
  "single", "maybeSingle", "eq", "neq", "in", "is", "order", "limit",
  "range", "returns", "match", "filter", "or", "gte", "lte", "gt", "lt",
];

function findViolations(source: string): string[] {
  const lines = source.split("\n");
  const hits: string[] = [];
  const catchRe = /\)\s*\.catch\s*\(/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!catchRe.test(line)) { catchRe.lastIndex = 0; continue; }
    catchRe.lastIndex = 0;
    // Look back up to 20 lines for the chain root that owns this `.catch(`.
    const start = Math.max(0, i - 20);
    const chunk = lines.slice(start, i + 1).join("\n");
    // Strip block/line comments so commented examples don't trigger.
    const stripped = chunk
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    // Ignore `fetch(...).catch(` and `req.json().catch(` and `Promise.*.catch(`
    // and `<fn>().catch(` where the immediate call is not a builder method.
    // Approach: find the last `.<method>(` before the `.catch(` on the joined
    // chunk and see if it's a builder method.
    const beforeCatch = stripped.slice(0, stripped.lastIndexOf(".catch("));
    const lastDotCall = beforeCatch.match(/\.([a-zA-Z_$][\w$]*)\s*\([^()]*\)\s*$/);
    if (!lastDotCall) continue;
    const method = lastDotCall[1];
    if (!BUILDER_METHODS.includes(method)) continue;
    // Also require that the chain traces back to `supabase` or an obvious
    // client (`sb`, `client`, `admin`) — otherwise it may be an unrelated
    // fluent API. Look for the identifier at the start of the chain.
    if (!/\b(supabase|sb|client|admin|serviceClient)\b[\s\S]*\.catch\(/m.test(chunk)) continue;
    hits.push(`line ${i + 1}: ${line.trim()}`);
  }
  return hits;
}

describe("edge-function guardrail: no .catch() on Supabase query builders", () => {
  const files = walk(ROOT);

  it("scans at least one edge function file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.slice(ROOT.length + 1);
    it(`${rel} does not chain .catch() on a Supabase builder`, () => {
      const src = readFileSync(file, "utf8");
      const hits = findViolations(src);
      expect(
        hits,
        `Found forbidden builder.catch() in ${rel}:\n  ${hits.join("\n  ")}\n\n` +
          `Supabase builders are thenables, not Promises — .catch() crashes at ` +
          `runtime. Use: try { const { error } = await supabase.xxx(...); if (error) ... } catch (e) { ... }`,
      ).toEqual([]);
    });
  }
});
