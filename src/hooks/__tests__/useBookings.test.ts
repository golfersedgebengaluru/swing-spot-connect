import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockChannel = vi.fn().mockReturnValue({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
});
const mockRemoveChannel = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    functions: { invoke: mockFunctionsInvoke },
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-123", email: "player@test.com" },
    loading: false,
  }),
}));

import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { useBays, useCities, useUserHoursBalance, useUserProfile } = await import(
  "@/hooks/useBookings"
);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useBays", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches bays ordered by city and sort_order", async () => {
    const mockBays = [
      { id: "1", name: "Bay 1", city: "Delhi", sort_order: 1, is_active: true },
      { id: "2", name: "Bay 2", city: "Mumbai", sort_order: 1, is_active: true },
    ];
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    };
    // Make the last .order() resolve
    chain.order.mockReturnValueOnce(chain).mockResolvedValueOnce({ data: mockBays, error: null });
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useBays(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockBays);
    expect(mockFrom).toHaveBeenCalledWith("bays");
  });
});

describe("useCities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns unique sorted active cities", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ city: "Mumbai" }, { city: "Delhi" }, { city: "Mumbai" }],
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useCities(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["Delhi", "Mumbai"]);
  });
});

describe("useUserHoursBalance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calculates remaining hours correctly", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { hours_purchased: 10, hours_used: 3 },
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useUserHoursBalance(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      purchased: 10,
      used: 3,
      remaining: 7,
    });
  });

  it("returns zeros when no record exists", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useUserHoursBalance(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ purchased: 0, used: 0, remaining: 0 });
  });
});

describe("useUserProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches current user profile", async () => {
    const profileData = {
      id: "profile-1",
      user_id: "user-123",
      display_name: "Test Player",
      email: "player@test.com",
      user_type: "eagle",
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useUserProfile(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.display_name).toBe("Test Player");
  });
});
