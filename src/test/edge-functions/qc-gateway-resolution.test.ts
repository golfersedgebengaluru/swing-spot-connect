import { describe, it, expect } from "vitest";
import { resolveQcGateway } from "../../../supabase/functions/_shared/qc-gateway";

type Row = Record<string, unknown>;

function mockSupabase(rows: { table: string; filters: Record<string, unknown>; data: Row | null }[]) {
  return {
    from(table: string) {
      let filters: Record<string, unknown> = {};
      const api: Record<string, unknown> = {
        select: () => api,
        eq(col: string, val: unknown) { filters[col] = val; return api; },
        async maybeSingle() {
          const match = rows.find(r =>
            r.table === table &&
            Object.entries(r.filters).every(([k, v]) => filters[k] === v)
          );
          return { data: match?.data ?? null, error: null };
        },
      };
      // reset per-from
      api.eq = (col: string, val: unknown) => { filters[col] = val; return api; };
      filters = {};
      return api;
    },
  };
}

describe("resolveQcGateway", () => {
  const comp = { tenant_id: "t1" };

  it("returns tenant-scoped gateway when one exists", async () => {
    const sb = mockSupabase([
      { table: "payment_gateways", filters: { tenant_id: "t1", is_active: true },
        data: { name: "razorpay", api_key: "k", api_secret: "s", tenant_id: "t1", city: null, city_slug: null } },
    ]);
    // deno-lint-ignore no-explicit-any
    const r = await resolveQcGateway(sb as any, comp);
    expect(r.scope).toBe("tenant");
    expect(r.gateway?.api_key).toBe("k");
  });

  it("falls back to city-scoped when no tenant gateway exists", async () => {
    const sb = mockSupabase([
      { table: "payment_gateways", filters: { tenant_id: "t1", is_active: true }, data: null },
      { table: "tenants", filters: { id: "t1" }, data: { city: "Bengaluru" } },
      { table: "payment_gateways", filters: { city: "Bengaluru", name: "razorpay", is_active: true },
        data: { name: "razorpay", api_key: "kc", api_secret: "sc", tenant_id: null, city: "Bengaluru", city_slug: "BENGALURU" } },
    ]);
    // deno-lint-ignore no-explicit-any
    const r = await resolveQcGateway(sb as any, comp);
    expect(r.scope).toBe("city");
    expect(r.city).toBe("Bengaluru");
    expect(r.gateway?.api_key).toBe("kc");
  });

  it("returns none when neither tenant nor city gateway is configured", async () => {
    const sb = mockSupabase([
      { table: "payment_gateways", filters: { tenant_id: "t1", is_active: true }, data: null },
      { table: "tenants", filters: { id: "t1" }, data: { city: "Nowhere" } },
      { table: "payment_gateways", filters: { city: "Nowhere", name: "razorpay", is_active: true }, data: null },
    ]);
    // deno-lint-ignore no-explicit-any
    const r = await resolveQcGateway(sb as any, comp);
    expect(r.scope).toBe("none");
    expect(r.gateway).toBeNull();
  });
});
