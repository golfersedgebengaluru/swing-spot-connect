import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ── Mock the supabase client BEFORE importing the hook ────────
vi.mock("@/integrations/supabase/client", () => {
  const builders: Record<string, any> = {};

  const makeBuilder = (table: string) => {
    const state: any = { table, eq: {}, willReturn: { data: null, error: null } };
    const b: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((col: string, val: any) => { state.eq[col] = val; return b; }),
      maybeSingle: vi.fn(async () => state.willReturn),
      single: vi.fn(async () => state.willReturn),
      insert: vi.fn().mockReturnThis(),
      __setReturn: (data: any) => { state.willReturn = { data, error: null }; },
      __state: state,
    };
    return b;
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (!builders[table]) builders[table] = makeBuilder(table);
      return builders[table];
    }),
    __builders: builders,
  };
  return { supabase };
});

import { supabase } from "@/integrations/supabase/client";
import { useCreateInvoice } from "@/hooks/useInvoices";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCreateInvoice — duplicate invoice guardrail", () => {
  beforeEach(() => {
    // reset builders
    (supabase as any).__builders = {};
    (supabase.from as any).mockClear?.();
  });

  it("throws when an invoice already exists for the same revenue_transaction_id", async () => {
    // Pre-seed the invoices table mock: return an existing row for the RTX lookup
    const invBuilder = (supabase.from as any)("invoices");
    invBuilder.__setReturn({ id: "inv-existing", invoice_number: "INV/X/0001" });

    const { result } = renderHook(() => useCreateInvoice(), { wrapper });

    await expect(
      result.current.mutateAsync({
        city: "Chennai",
        customerName: "Test Customer",
        revenueTransactionId: "rtx-already-invoiced",
        lineItems: [],
        subtotal: 100,
        cgstTotal: 9,
        sgstTotal: 9,
        igstTotal: 0,
        total: 118,
      } as any),
    ).rejects.toThrow(/already exists for this revenue transaction/i);

    // It must have queried invoices first and short-circuited (no gst_profiles fetch)
    const calls = (supabase.from as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain("invoices");
    // Must NOT have proceeded to revenue_transactions insert
    expect(calls).not.toContain("revenue_transactions");
  });

  it("does NOT short-circuit when no revenueTransactionId is supplied", async () => {
    // Without revenueTransactionId we should skip the guard and proceed to gst_profiles
    const gstBuilder = (supabase.from as any)("gst_profiles");
    gstBuilder.__setReturn(null); // will then throw "GST profile not configured" — expected

    const { result } = renderHook(() => useCreateInvoice(), { wrapper });

    await expect(
      result.current.mutateAsync({
        city: "Chennai",
        customerName: "Standalone",
        lineItems: [],
        subtotal: 0,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 0,
        total: 0,
      } as any),
    ).rejects.toThrow(/GST profile not configured/i);

    const calls = (supabase.from as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain("gst_profiles");
  });
});
