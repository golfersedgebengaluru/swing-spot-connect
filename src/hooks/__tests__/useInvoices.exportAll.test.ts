import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression guard: "Export CSV" used to serialise only the visible page
 * (25 rows), so a month with 41 invoices exported 26 lines. `fetchAllInvoices`
 * must page through every matching row and apply the same filters as the list.
 */

const calls: { ranges: [number, number][]; filters: Record<string, any> } = { ranges: [], filters: {} };
let pages: any[][] = [];

vi.mock("@/integrations/supabase/client", () => {
  const builder: any = {};
  for (const m of ["select", "order"]) builder[m] = vi.fn(() => builder);
  for (const m of ["eq", "gte", "lte", "neq", "or"]) {
    builder[m] = vi.fn((a: any, b: any) => {
      calls.filters[`${m}:${a}`] = b ?? true;
      return builder;
    });
  }
  builder.range = vi.fn((from: number, to: number) => {
    calls.ranges.push([from, to]);
    return Promise.resolve({ data: pages.shift() ?? [], error: null });
  });
  return { supabase: { from: vi.fn(() => builder) } };
});

import { fetchAllInvoices } from "@/hooks/useInvoices";

beforeEach(() => {
  calls.ranges = [];
  calls.filters = {};
  pages = [];
});

const mkRows = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `${offset + i}`, invoice_number: `INV/${offset + i}` }));

describe("fetchAllInvoices", () => {
  it("returns every row, not just the first page of 25", async () => {
    pages = [mkRows(41)];
    const rows = await fetchAllInvoices({ city: "Bengaluru", startDate: "2026-08-01", endDate: "2026-08-31" });
    expect(rows).toHaveLength(41);
    expect(calls.ranges[0]).toEqual([0, 999]);
  });

  it("keeps paging while a full chunk comes back", async () => {
    pages = [mkRows(1000), mkRows(1000, 1000), mkRows(120, 2000)];
    const rows = await fetchAllInvoices({ city: "Bengaluru" });
    expect(rows).toHaveLength(2120);
    expect(calls.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("applies the same filters as the paged list", async () => {
    pages = [[]];
    await fetchAllInvoices({
      city: "Bengaluru",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      status: "issued",
      invoiceType: "invoice",
      paymentStatus: "due",
      search: "Lodha",
    });
    expect(calls.filters["eq:city"]).toBe("Bengaluru");
    expect(calls.filters["gte:invoice_date"]).toBe("2026-08-01");
    expect(calls.filters["lte:invoice_date"]).toBe("2026-08-31");
    expect(calls.filters["eq:status"]).toBe("issued");
    expect(calls.filters["eq:invoice_type"]).toBe("invoice");
    expect(calls.filters["neq:payment_status"]).toBe("paid");
    expect(String(calls.filters["or:invoice_number.ilike.%Lodha%,customer_name.ilike.%Lodha%,customer_email.ilike.%Lodha%,customer_gstin.ilike.%Lodha%"])).toBe("true");
  });
});
