import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-123", email: "test@example.com" },
    loading: false,
  }),
}));

import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { usePoints } = await import("@/hooks/usePoints");

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("usePoints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches points transactions for the user", async () => {
    const transactions = [
      { id: "1", user_id: "user-123", points: 100, type: "earn", created_at: "2026-01-01" },
      { id: "2", user_id: "user-123", points: -50, type: "redeem", created_at: "2026-01-02" },
    ];
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: transactions, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => usePoints(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });
});
