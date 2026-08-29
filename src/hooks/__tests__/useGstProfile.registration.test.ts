import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ upsert: (...a: any[]) => upsertMock(...a) }) },
}));

import { useSaveGstProfile } from "@/hooks/useInvoices";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import React from "react";

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: any) => React.createElement(QueryClientProvider, { client }, children);
}

const base = {
  city: "Chennai",
  legal_name: "Acme",
  gstin: "29AAPFU0939F1ZV",
  address: "Somewhere",
  state: "Tamil Nadu",
  state_code: "33",
  invoice_prefix: "INV",
  invoice_start_number: 1,
  is_gst_registered: true,
};

describe("useSaveGstProfile — GST registration flag", () => {
  beforeEach(() => {
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({ error: null });
  });

  it("persists the registration flag and keeps the GSTIN when registered", async () => {
    const { result } = renderHook(() => useSaveGstProfile(), { wrapper: wrap() });
    await act(async () => { await result.current.mutateAsync(base as any); });
    const payload = upsertMock.mock.calls[0][0];
    expect(payload.is_gst_registered).toBe(true);
    expect(payload.gstin).toBe("29AAPFU0939F1ZV");
    expect(payload.state_code).toBe("33");
  });

  it("clears GSTIN and state code when the location is not GST registered", async () => {
    const { result } = renderHook(() => useSaveGstProfile(), { wrapper: wrap() });
    await act(async () => {
      await result.current.mutateAsync({ ...base, is_gst_registered: false } as any);
    });
    const payload = upsertMock.mock.calls[0][0];
    expect(payload.is_gst_registered).toBe(false);
    expect(payload.gstin).toBe("");
    expect(payload.state_code).toBe("");
    expect(payload.legal_name).toBe("Acme");
  });

  it("upserts on the city conflict target (per-city tenant boundary)", async () => {
    const { result } = renderHook(() => useSaveGstProfile(), { wrapper: wrap() });
    await act(async () => { await result.current.mutateAsync(base as any); });
    expect(upsertMock.mock.calls[0][1]).toEqual({ onConflict: "city" });
  });
});
