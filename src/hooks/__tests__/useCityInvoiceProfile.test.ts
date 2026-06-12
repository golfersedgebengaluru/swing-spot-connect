import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing the hook
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...a: any[]) => fromMock(...a) },
}));

import { useCityInvoiceProfile, useSaveCityInvoiceProfile } from "@/hooks/useCityInvoiceProfile";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";

function wrap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: any) => React.createElement(QueryClientProvider, { client }, children);
}

describe("useCityInvoiceProfile", () => {
  beforeEach(() => { fromMock.mockReset(); });

  it("returns empty profile when no row exists", async () => {
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    });
    const { result } = renderHook(() => useCityInvoiceProfile("Bengaluru"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.city).toBe("Bengaluru");
    expect(result.current.data?.country).toBe("India");
    expect(result.current.data?.show_signature).toBe(false);
    expect(result.current.data?.copy_labels).toEqual([]);
  });

  it("normalizes a row from the database", async () => {
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { city: "Chennai", phone: "111", bank_ifsc: "HDFC0001234", copy_labels: null, show_signature: true },
        error: null,
      }) }) }),
    });
    const { result } = renderHook(() => useCityInvoiceProfile("Chennai"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.phone).toBe("111");
    expect(result.current.data?.bank_ifsc).toBe("HDFC0001234");
    expect(result.current.data?.copy_labels).toEqual([]);
    expect(result.current.data?.show_signature).toBe(true);
  });

  it("does not run when city is undefined (guards multi-tenant boundary)", () => {
    const { result } = renderHook(() => useCityInvoiceProfile(undefined), { wrapper: wrap() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("save upserts on city conflict (city is the PK / tenant boundary)", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ upsert });
    const { result } = renderHook(() => useSaveCityInvoiceProfile(), { wrapper: wrap() });
    await act(async () => {
      await result.current.mutateAsync({ city: "Bengaluru" } as any);
    });
    expect(upsert).toHaveBeenCalledWith({ city: "Bengaluru" }, { onConflict: "city" });
  });
});
