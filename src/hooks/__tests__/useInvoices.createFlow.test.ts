import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * Tests for manual invoice creation through useCreateInvoice.
 * Verifies the post-migration call shape:
 *   - get_next_invoice_number returns plain text (not a TABLE)
 *   - p_doc_type = 'tax_invoice' (NOT 'INV')  for normal invoices
 *   - p_doc_type = 'credit_note' (NOT 'CN')   for credit notes
 *   - revenue_transactions + invoices + invoice_line_items are inserted in order
 *
 * Booking-driven auto invoice creation runs entirely inside the database
 * (trigger `trg_auto_create_invoice` → fn `auto_create_invoice_for_revenue`),
 * so it's covered by the live DB smoke test in
 * `src/test/db/invoice-flows.live.test.ts`.
 */

type Captured = { table: string; op: string; payload?: any };

const captured: Captured[] = [];
const rpcCalls: { name: string; args: any }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  // Per-table response queues so each .maybeSingle()/.single() returns
  // the row the test pre-loaded for that table.
  const queues: Record<string, any[]> = {};

  const makeBuilder = (table: string) => {
    const b: any = {};
    const ret = (data: any) => ({ data, error: null });
    const next = () => (queues[table]?.shift() ?? null);

    b.select = vi.fn().mockReturnValue(b);
    b.eq = vi.fn().mockReturnValue(b);
    b.is = vi.fn().mockReturnValue(b);
    b.in = vi.fn().mockReturnValue(b);
    b.order = vi.fn().mockReturnValue(b);
    b.limit = vi.fn().mockReturnValue(b);
    b.maybeSingle = vi.fn(async () => ret(next()));
    b.single = vi.fn(async () => ret(next()));
    b.insert = vi.fn((payload: any) => {
      captured.push({ table, op: "insert", payload });
      return b;
    });
    b.update = vi.fn((payload: any) => {
      captured.push({ table, op: "update", payload });
      return b;
    });
    return b;
  };

  const supabase = {
    from: vi.fn((table: string) => makeBuilder(table)),
    rpc: vi.fn(async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === "get_next_invoice_number") {
        return { data: "INV/2025-26/0042", error: null };
      }
      return { data: null, error: null };
    }),
    __queue: (table: string, ...rows: any[]) => {
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

const baseParams = {
  city: "Bengaluru",
  customerName: "Walk-in Guest",
  customerEmail: "guest@example.com",
  invoiceCategory: "purchase",
  paymentMethod: "cash",
  subtotal: 100,
  cgstTotal: 9,
  sgstTotal: 9,
  igstTotal: 0,
  total: 118,
  lineItems: [
    {
      itemName: "Range balls",
      itemType: "good",
      hsnCode: "9506",
      quantity: 1,
      unitPrice: 100,
      gstRate: 18,
      cgstAmount: 9,
      sgstAmount: 9,
      igstAmount: 0,
      lineTotal: 118,
    },
  ],
};

function primeHappyPath() {
  const s: any = supabase;
  // duplicate-guard: no existing invoice for this RTX (none supplied anyway)
  // 1. gst_profiles lookup
  s.__queue("gst_profiles", {
    id: "gst-1",
    city: "Bengaluru",
    legal_name: "Test Studio",
    gstin: "29AAAAA0000A1Z5",
    address: "MG Road",
    state: "Karnataka",
    state_code: "29",
    invoice_prefix: "INV",
    invoice_start_number: 1,
  });
  // 2. financial_years
  s.__queue("financial_years", { id: "fy-1", label: "2025-26", is_active: true });
  // 3. revenue_transactions insert returns
  s.__queue("revenue_transactions", { id: "rtx-1" });
  // 4. invoices insert returns
  s.__queue("invoices", { id: "inv-1", invoice_number: "INV/2025-26/0042" });
  // 5. profiles lookup (auto-profile branch) — return null so we skip
  s.__queue("profiles", null);
}

describe("useCreateInvoice — manual invoice happy path", () => {
  beforeEach(() => {
    captured.length = 0;
    rpcCalls.length = 0;
    (supabase.from as any).mockClear?.();
    (supabase.rpc as any).mockClear?.();
  });

  it("manual purchase invoice: calls RPC with p_doc_type='tax_invoice' and inserts in order", async () => {
    primeHappyPath();
    const { result } = renderHook(() => useCreateInvoice(), { wrapper });

    await result.current.mutateAsync(baseParams as any);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const seqCall = rpcCalls.find((c) => c.name === "get_next_invoice_number");
    expect(seqCall).toBeTruthy();
    expect(seqCall!.args).toMatchObject({
      p_gstin: "29AAAAA0000A1Z5",
      p_fy_id: "fy-1",
      p_prefix: "INV",
      p_doc_type: "tax_invoice", // post-migration value (was wrongly "INV")
    });

    const insertedTables = captured.filter((c) => c.op === "insert").map((c) => c.table);
    expect(insertedTables).toEqual([
      "revenue_transactions",
      "invoices",
      "invoice_line_items",
    ]);

    const inv = captured.find((c) => c.table === "invoices")!.payload;
    expect(inv.invoice_number).toBe("INV/2025-26/0042");
    expect(inv.business_gstin).toBe("29AAAAA0000A1Z5");
    expect(inv.invoice_type).toBe("invoice");
    expect(inv.total).toBe(118);
    expect(inv.revenue_transaction_id).toBe("rtx-1");

    const li = captured.find((c) => c.table === "invoice_line_items")!.payload;
    expect(Array.isArray(li)).toBe(true);
    expect(li[0]).toMatchObject({
      invoice_id: "inv-1",
      item_name: "Range balls",
      hsn_code: "9506",
      line_total: 118,
    });
  });

  it("credit_note invoice: calls RPC with p_doc_type='credit_note'", async () => {
    primeHappyPath();
    const { result } = renderHook(() => useCreateInvoice(), { wrapper });

    await result.current.mutateAsync({
      ...baseParams,
      invoiceType: "credit_note",
      creditNoteFor: "inv-original-1",
    } as any);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const seqCall = rpcCalls.find((c) => c.name === "get_next_invoice_number");
    expect(seqCall!.args.p_doc_type).toBe("credit_note"); // post-migration value (was wrongly "CN")
  });

  it("manual booking invoice: uses 'booking' category and routes through the same RPC", async () => {
    primeHappyPath();
    const { result } = renderHook(() => useCreateInvoice(), { wrapper });

    await result.current.mutateAsync({
      ...baseParams,
      invoiceCategory: "booking",
      customerUserId: "user-123", // skip auto-profile creation branch
      bookingDate: "2026-06-15",
      bookingStartTime: "15:00",
      bookingEndTime: "16:00",
      bookingBayId: "bay-1",
      bookingSessionType: "practice",
    } as any);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const rev = captured.find((c) => c.table === "revenue_transactions")!.payload;
    expect(rev.transaction_type).toBe("booking");

    const inv = captured.find((c) => c.table === "invoices")!.payload;
    expect(inv.invoice_category).toBe("booking");
  });
});
