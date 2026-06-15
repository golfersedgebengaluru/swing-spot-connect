import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * Regression: "duplicate key value violates unique constraint invoices_invoice_number_key"
 *
 * Root cause: `get_next_invoice_number` was upserting `invoice_sequences`
 * starting at `p_start` (default 1) when no sequence row matched
 * (gstin, fy, doc_type), regardless of how many invoices already existed
 * for that gstin/fy/prefix. The migration in 20260615131251 makes the
 * function:
 *   1. compute MAX(trailing number) of existing invoices for the same
 *      gstin/fy/prefix,
 *   2. upsert sequence with last_number = GREATEST(stored, max_existing)+1,
 *   3. retry up to 10 times if the generated number still collides.
 *
 * This unit test guards the JS layer: it must surface a Postgres
 * unique_violation error from the invoices insert rather than swallow it,
 * so the fix's effect is observable to the UI.
 */

vi.mock("@/integrations/supabase/client", () => {
  const queues: Record<string, any[]> = {};
  const makeBuilder = (table: string) => {
    const b: any = {};
    const ret = (data: any, error: any = null) => ({ data, error });
    const next = () => queues[table]?.shift() ?? { data: null, error: null };
    b.select = vi.fn().mockReturnValue(b);
    b.eq = vi.fn().mockReturnValue(b);
    b.is = vi.fn().mockReturnValue(b);
    b.in = vi.fn().mockReturnValue(b);
    b.order = vi.fn().mockReturnValue(b);
    b.limit = vi.fn().mockReturnValue(b);
    b.maybeSingle = vi.fn(async () => { const r = next(); return ret(r.data ?? r, r.error ?? null); });
    b.single = vi.fn(async () => { const r = next(); return ret(r.data ?? r, r.error ?? null); });
    b.insert = vi.fn(() => b);
    return b;
  };
  const supabase = {
    from: vi.fn((t: string) => makeBuilder(t)),
    rpc: vi.fn(async () => ({ data: "INV/2025-26/0001", error: null })),
    __queue: (t: string, ...rows: any[]) => {
      queues[t] = (queues[t] ?? []).concat(rows);
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

describe("useCreateInvoice — surfaces duplicate invoice_number errors", () => {
  beforeEach(() => {
    (supabase.from as any).mockClear?.();
    (supabase.rpc as any).mockClear?.();
  });

  it("propagates a Postgres unique_violation from invoices.insert as a thrown error", async () => {
    const s: any = supabase;
    // gst_profiles, financial_years, revenue_transactions ok…
    s.__queue("gst_profiles", {
      id: "gst-1", city: "Bengaluru", legal_name: "Test", gstin: "29AAAAA0000A1Z5",
      address: "x", state: "Karnataka", state_code: "29",
      invoice_prefix: "INV", invoice_start_number: 1,
    });
    s.__queue("financial_years", { id: "fy-1", label: "2025-26", is_active: true });
    s.__queue("revenue_transactions", { id: "rtx-1" });
    // …but invoices.insert returns the unique-violation error
    s.__queue("invoices", {
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "invoices_invoice_number_key"' },
    });

    const { result } = renderHook(() => useCreateInvoice(), { wrapper });

    await expect(
      result.current.mutateAsync({
        city: "Bengaluru",
        customerName: "Walk-in",
        invoiceCategory: "purchase",
        paymentMethod: "cash",
        subtotal: 100, cgstTotal: 9, sgstTotal: 9, igstTotal: 0, total: 118,
        lineItems: [{
          itemName: "Range balls", itemType: "good", hsnCode: "9506",
          quantity: 1, unitPrice: 100, gstRate: 18,
          cgstAmount: 9, sgstAmount: 9, igstAmount: 0, lineTotal: 118,
        }],
      } as any),
    ).rejects.toThrow(/duplicate key|invoices_invoice_number_key/i);

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
