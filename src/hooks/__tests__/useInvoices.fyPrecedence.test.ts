import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * Regression guard: manual invoice creation used to resolve the financial year
 * with `.eq("is_active", true).maybeSingle()` — no city filter. The moment a
 * per-city FY is activated alongside the global (city IS NULL) one, that query
 * returns two rows and every manual invoice fails.
 *
 * The DB function `auto_create_invoice_for_revenue` prefers the city FY and
 * falls back to global. The hook must mirror that: filter to
 * (city = <city> OR city IS NULL), order city-first, limit 1.
 */

const builders: Record<string, any> = {};

vi.mock("@/integrations/supabase/client", () => {
  const queues: Record<string, any[]> = {};
  const makeBuilder = (table: string) => {
    if (builders[table]) return builders[table];
    const b: any = {};
    const ret = (data: any) => ({ data, error: null });
    const next = () => queues[table]?.shift() ?? null;
    for (const m of ["select", "eq", "is", "in", "or", "order", "limit"]) {
      b[m] = vi.fn().mockReturnValue(b);
    }
    b.maybeSingle = vi.fn(async () => ret(next()));
    b.single = vi.fn(async () => ret(next()));
    b.insert = vi.fn().mockReturnValue(b);
    b.update = vi.fn().mockReturnValue(b);
    builders[table] = b;
    return b;
  };
  const supabase = {
    from: vi.fn((table: string) => makeBuilder(table)),
    rpc: vi.fn(async (name: string) =>
      name === "get_next_invoice_number" ? { data: "INV/2026-27/0007", error: null } : { data: null, error: null },
    ),
    __queue: (table: string, ...rows: any[]) => {
      makeBuilder(table);
      queues[table] = (queues[table] ?? []).concat(rows);
    },
  };
  return { supabase };
});

import { supabase } from "@/integrations/supabase/client";
import { useCreateInvoice } from "@/hooks/useInvoices";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const params = {
  city: "Chennai",
  customerName: "Walk-in Guest",
  invoiceCategory: "purchase",
  paymentMethod: "cash",
  subtotal: 100,
  cgstTotal: 0,
  sgstTotal: 0,
  igstTotal: 0,
  total: 100,
  lineItems: [
    {
      itemName: "Bay session",
      itemType: "service",
      quantity: 1,
      unitPrice: 100,
      gstRate: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      lineTotal: 100,
    },
  ],
};

describe("useCreateInvoice — financial year precedence", () => {
  beforeEach(() => {
    for (const k of Object.keys(builders)) delete builders[k];
  });

  it("scopes the FY lookup to the city or global, ordered city-first", async () => {
    const s: any = supabase;
    s.__queue("gst_profiles", {
      id: "gst-1",
      city: "Chennai",
      legal_name: "Golfer's Edge",
      gstin: "",
      is_gst_registered: false,
      address: "Chennai",
      state: "",
      state_code: "",
      invoice_prefix: "INV",
      invoice_start_number: 1,
    });
    s.__queue("financial_years", { id: "fy-city", label: "2026-27", city: "Chennai", is_active: true });
    s.__queue("revenue_transactions", { id: "rtx-1" });
    s.__queue("invoices", { id: "inv-1", invoice_number: "INV/2026-27/0007" });
    s.__queue("profiles", null);

    const { result } = renderHook(() => useCreateInvoice(), { wrapper });
    await result.current.mutateAsync(params as any);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const fy = builders["financial_years"];
    expect(fy.or).toHaveBeenCalledWith("city.eq.Chennai,city.is.null");
    expect(fy.order).toHaveBeenCalledWith("city", { ascending: true, nullsFirst: false });
    expect(fy.limit).toHaveBeenCalledWith(1);
  });

  it("uses the unregistered sequence identifier and blanks the business GSTIN", async () => {
    const s: any = supabase;
    s.__queue("gst_profiles", {
      id: "gst-1",
      city: "Chennai",
      legal_name: "Golfer's Edge",
      gstin: "",
      is_gst_registered: false,
      invoice_prefix: "INV",
      invoice_start_number: 1,
    });
    s.__queue("financial_years", { id: "fy-city", label: "2026-27", city: "Chennai", is_active: true });
    s.__queue("revenue_transactions", { id: "rtx-1" });
    s.__queue("invoices", { id: "inv-1", invoice_number: "INV/2026-27/0007" });
    s.__queue("profiles", null);

    const { result } = renderHook(() => useCreateInvoice(), { wrapper });
    await result.current.mutateAsync(params as any);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect((supabase.rpc as any)).toHaveBeenCalledWith(
      "get_next_invoice_number",
      expect.objectContaining({ p_gstin: "NOGST-Chennai" }),
    );
    const payload = builders["invoices"].insert.mock.calls[0][0];
    expect(payload.business_gstin).toBe("");
  });
});
