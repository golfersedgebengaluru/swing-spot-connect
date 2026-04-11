import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-123" },
    loading: false,
  }),
}));

import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useCurrency", () => {
  beforeEach(() => vi.clearAllMocks());

  it("can be imported without errors", async () => {
    const mod = await import("@/hooks/useCurrency");
    expect(mod.useCurrency).toBeDefined();
  });
});

describe("useNotifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("can be imported without errors", async () => {
    // Mock the supabase channel for realtime
    const mockChannel = vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    });
    const mockRemoveChannel = vi.fn();

    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        from: mockFrom,
        channel: mockChannel,
        removeChannel: mockRemoveChannel,
      },
    }));

    const mod = await import("@/hooks/useNotifications");
    expect(mod.useNotifications).toBeDefined();
  });
});
