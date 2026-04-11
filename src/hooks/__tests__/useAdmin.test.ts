import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing the hook
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user-id", email: "test@example.com" },
    loading: false,
  }),
}));

// Import after mocks
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// We need to dynamically import to ensure mocks are applied
const { useAdmin } = await import("@/hooks/useAdmin");

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets isAdmin=true when user has admin role", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: true, error: null })  // admin check
      .mockResolvedValueOnce({ data: false, error: null }); // site_admin check

    const { result } = renderHook(() => useAdmin(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isSiteAdmin).toBe(false);
    expect(result.current.role).toBe("admin");
    expect(result.current.hasAdminAccess).toBe(true);
  });

  it("sets isSiteAdmin=true and fetches cities when user is site_admin", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: false, error: null })  // admin check
      .mockResolvedValueOnce({ data: true, error: null });   // site_admin check

    const cityChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [{ city: "Mumbai" }, { city: "Delhi" }], error: null }),
    };
    mockFrom.mockReturnValue(cityChain);

    const { result } = renderHook(() => useAdmin(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isSiteAdmin).toBe(true);
    expect(result.current.role).toBe("site_admin");
    expect(result.current.assignedCities).toEqual(["Mumbai", "Delhi"]);
  });

  it("sets no admin access when user has no roles", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: false, error: null });

    const { result } = renderHook(() => useAdmin(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasAdminAccess).toBe(false);
    expect(result.current.role).toBeNull();
  });
});
