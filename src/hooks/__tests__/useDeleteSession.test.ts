import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFunctionsInvoke = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mockFunctionsInvoke },
    from: mockFrom,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { useDeleteSession } = await import("@/hooks/useCoaching");

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useDeleteSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invokes calendar-sync cancel_coaching_session and does NOT touch the table directly", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { success: true, booking_cancelled: true }, error: null });

    const { result } = renderHook(() => useDeleteSession(), { wrapper: wrapper() });
    await result.current.mutateAsync("session-abc");

    expect(mockFunctionsInvoke).toHaveBeenCalledWith("calendar-sync", {
      body: { action: "cancel_coaching_session", session_id: "session-abc" },
    });
    // Critical: must not bypass the edge function with a direct table delete,
    // because that would leave the booking + Google Calendar event orphaned.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("throws when the edge function returns an error payload", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { error: "forbidden" }, error: null });
    const { result } = renderHook(() => useDeleteSession(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync("s1")).rejects.toThrow(/forbidden/);
  });

  it("throws when the edge function transport errors", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: "network" } });
    const { result } = renderHook(() => useDeleteSession(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync("s1")).rejects.toBeTruthy();
  });
});
