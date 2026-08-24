import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { recordRevenue } from "../../../supabase/functions/_shared/revenue-ledger";

/** Minimal Supabase-like stub for the ledger writer. */
function makeAdmin(opts: {
  existingId?: string | null;
  insertError?: { code?: string; message: string } | null;
  onInsert?: (row: Record<string, unknown>) => void;
} = {}) {
  const inserted: Record<string, unknown>[] = [];
  const from = vi.fn((_table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    Object.assign(builder, {
      select: chain,
      eq: chain,
      maybeSingle: async () => ({ data: opts.existingId ? { id: opts.existingId } : null }),
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        opts.onInsert?.(row);
        return {
          select: () => ({
            maybeSingle: async () =>
              opts.insertError
                ? { data: null, error: opts.insertError }
                : { data: { id: "rev-new" }, error: null },
          }),
        };
      },
    });
    return builder;
  });
  return { admin: { from } as never, inserted, from };
}

describe("recordRevenue", () => {
  it("writes a confirmed revenue row with source_ref and product_id", async () => {
    const { admin, inserted } = makeAdmin();
    const res = await recordRevenue(admin, {
      sourceRef: "league_reg:reg-1",
      transactionType: "league_registration",
      amount: 5000,
      city: "Bengaluru",
      description: "League registration — Summer — Team CSK",
      userId: "user-1",
      productId: "prod-league",
      gatewayName: "razorpay",
      gatewayPaymentRef: "pay_1",
    });
    expect(res).toEqual({ recorded: true, duplicate: false, revenueId: "rev-new" });
    expect(inserted[0]).toMatchObject({
      source_ref: "league_reg:reg-1",
      transaction_type: "league_registration",
      amount: 5000,
      status: "confirmed",
      city: "Bengaluru",
      product_id: "prod-league",
      gateway_payment_ref: "pay_1",
    });
  });

  it("is idempotent when a row already exists for the source_ref", async () => {
    const { admin, inserted } = makeAdmin({ existingId: "rev-existing" });
    const res = await recordRevenue(admin, {
      sourceRef: "qc_entry:e1",
      transactionType: "qc_entry",
      amount: 500,
      description: "Competition entry",
    });
    expect(res).toEqual({ recorded: false, duplicate: true, revenueId: "rev-existing" });
    expect(inserted).toHaveLength(0);
  });

  it("treats a unique-violation race as a duplicate, never a double-count", async () => {
    let existing: string | null = null;
    const { admin } = makeAdmin({
      insertError: { code: "23505", message: "duplicate key" },
      onInsert: () => {
        existing = "rev-winner";
      },
    });
    // second maybeSingle() call (post-error lookup) must see the winner row
    const patched = {
      from: (t: string) => {
        const b = (admin as unknown as { from: (t: string) => Record<string, unknown> }).from(t);
        return { ...b, maybeSingle: async () => ({ data: existing ? { id: existing } : null }) };
      },
    } as never;
    const res = await recordRevenue(patched, {
      sourceRef: "shop_order:o1",
      transactionType: "product_order",
      amount: 1200,
      description: "Shop order",
    });
    expect(res.recorded).toBe(false);
    expect(res.duplicate).toBe(true);
  });

  it("ignores zero and negative amounts", async () => {
    const { admin, inserted } = makeAdmin();
    for (const amount of [0, -100]) {
      const res = await recordRevenue(admin, {
        sourceRef: `x:${amount}`,
        transactionType: "purchase",
        amount,
        description: "free",
      });
      expect(res.recorded).toBe(false);
    }
    expect(inserted).toHaveLength(0);
  });

  it("requires a sourceRef so idempotency can never be bypassed", async () => {
    const { admin, inserted } = makeAdmin();
    const res = await recordRevenue(admin, {
      sourceRef: "",
      transactionType: "purchase",
      amount: 100,
      description: "no ref",
    });
    expect(res.error).toBeTruthy();
    expect(inserted).toHaveLength(0);
  });
});

describe("revenue capture wiring", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "../../../", p), "utf8");

  it("league registration finalize records revenue through the shared ledger", () => {
    const src = read("supabase/functions/_shared/legacy-league-finalize.ts");
    expect(src).toContain('from "./revenue-ledger.ts"');
    expect(src).toContain("league_reg:${input.registrationId}");
    expect(src).toContain('transactionType: "league_registration"');
  });

  it("competition entry finalize records revenue through the shared ledger", () => {
    const src = read("supabase/functions/_shared/qc-finalize.ts");
    expect(src).toContain('from "./revenue-ledger.ts"');
    expect(src).toContain("qc_entry:${entry.id}");
    expect(src).toContain('transactionType: "qc_entry"');
  });

  it("shop orders write an idempotent product_order revenue row", () => {
    const src = read("src/hooks/useOrders.ts");
    expect(src).toContain("shop_order:${data.id}");
    expect(src).toContain('transaction_type: "product_order"');
  });

  it("GSTR-1 export refuses to file for a city that is not GST registered", () => {
    const src = read("src/lib/gstr1-export.ts");
    expect(src).toContain("isProfileGstRegistered");
    expect(src).toContain("not GST registered");
  });
});
