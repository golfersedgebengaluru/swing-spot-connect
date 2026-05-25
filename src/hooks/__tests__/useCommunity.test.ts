import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { mockSupabase, createQueryMock } from "@/test/supabase-mock";

const supabaseMock = mockSupabase();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-self" } }),
}));

import { useCommunityPosts } from "../useCommunity";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCommunityPosts (PII-safe author lookup)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never selects email/phone columns when resolving authors", async () => {
    const fromSpy = vi.fn((table: string) => {
      if (table === "community_posts") {
        return createQueryMock([{ id: "p1", user_id: "u1", content: "hi" }]);
      }
      if (table === "public_profiles") {
        return createQueryMock([{ user_id: "u1", display_name: "Alice" }]);
      }
      return createQueryMock([]);
    });
    supabaseMock.from = fromSpy;

    const { result } = renderHook(() => useCommunityPosts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const tables = fromSpy.mock.calls.map((c) => c[0]);
    expect(tables).toContain("community_posts");
    expect(tables).toContain("public_profiles");
    // Critical: must NOT hit the raw profiles table for community
    expect(tables).not.toContain("profiles");

    expect(result.current.data?.[0]).toMatchObject({
      id: "p1",
      profiles: { display_name: "Alice" },
    });
  });

  it("falls back to null display_name when author missing", async () => {
    supabaseMock.from = vi.fn((table: string) => {
      if (table === "community_posts") {
        return createQueryMock([{ id: "p2", user_id: "u-unknown", content: "x" }]);
      }
      return createQueryMock([]);
    });

    const { result } = renderHook(() => useCommunityPosts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].profiles).toEqual({ display_name: null });
  });
});
