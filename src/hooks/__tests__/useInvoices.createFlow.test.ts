import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
import { useCreateInvoice, useDeleteInvoice } from "@/hooks/useInvoices";
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }, children);
}
const params = { city: "Bengaluru", customerName: "Member", invoiceCategory: "purchase", subtotal: 100, cgstTotal: 9, sgstTotal: 9, igstTotal: 0, total: 118,
  lineItems: [{ itemName: "Session", itemType: "service" as const, sacCode: "999652", quantity: 1, unitPrice: 100, gstRate: 18, cgstAmount: 9, sgstAmount: 9, igstAmount: 0, lineTotal: 118 }] };
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { id: "inv-1", invoice_number: "INV/42" }, error: null }); });
describe("atomic manual invoice hooks", () => {
  it("creates the document and ledger in one call, preserving the invoice business date and paid amount", async () => {
    const { result } = renderHook(() => useCreateInvoice(), { wrapper });
    await result.current.mutateAsync({ ...params, invoiceDate: "2026-08-02", amountPaid: 75, paymentStatus: "partial" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("create_manual_invoice_atomic", expect.objectContaining({ p_invoice: expect.objectContaining({ invoice_date: "2026-08-02", amount_paid: 75, payment_status: "partial", total: 118 }) }));
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("passes booking origin information in the same transaction", async () => {
    const { result } = renderHook(() => useCreateInvoice(), { wrapper });
    await result.current.mutateAsync({ ...params, invoiceCategory: "booking", customerUserId: "u", bookingDate: "2026-11-08", bookingStartTime: "12:00", bookingEndTime: "14:00", bookingBayId: "b" });
    expect(mocks.rpc).toHaveBeenCalledWith("create_manual_invoice_atomic", expect.objectContaining({ p_booking: expect.objectContaining({ user_id: "u", bay_id: "b", duration_minutes: 120 }), p_add_profile: false }));
  });
  it("preserves credit note type and original invoice", async () => {
    const { result } = renderHook(() => useCreateInvoice(), { wrapper });
    await result.current.mutateAsync({ ...params, invoiceType: "credit_note", creditNoteFor: "original" });
    expect(mocks.rpc).toHaveBeenCalledWith("create_manual_invoice_atomic", expect.objectContaining({ p_invoice: expect.objectContaining({ invoice_type: "credit_note", credit_note_for: "original" }) }));
  });
  it("surfaces creation rollback without performing compensating browser writes", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("rolled back") });
    const { result } = renderHook(() => useCreateInvoice(), { wrapper });
    await expect(result.current.mutateAsync(params)).rejects.toThrow("rolled back");
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("deletes in one transaction and surfaces failure", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("rollback") });
    const { result } = renderHook(() => useDeleteInvoice(), { wrapper });
    await expect(result.current.mutateAsync("inv-1")).rejects.toThrow("rollback");
    expect(mocks.rpc).toHaveBeenCalledWith("delete_invoice_atomic", { p_invoice_id: "inv-1" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
