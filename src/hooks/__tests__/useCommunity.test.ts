import { describe, it, expect, vi, beforeEach } from "vitest";

// Track every from() call
const fromCalls: string[] = [];

function makeChain(data: any) {
  const result = { data, error: null };
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
  chain.then = (onF: any, onR: any) => Promise.resolve(result).then(onF, onR);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "community_posts") {
        return makeChain([{ id: "p1", user_id: "u1", content: "hi" }]);
      }
      if (table === "public_profiles") {
        return makeChain([{ user_id: "u1", display_name: "Alice" }]);
      }
      return makeChain([]);
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-self" } }),
}));

import { useCommunityPosts } from "../useCommunity";

describe("useCommunityPosts (PII-safe author lookup)", () => {
  beforeEach(() => {
    fromCalls.length = 0;
  });

  it("never queries the raw profiles table for community authors", async () => {
    // Call the queryFn directly
    const hookDescriptor = (useCommunityPosts as any);
    // Easier: drive query via the underlying queryFn factory
    // Re-implement minimal access by calling hook config via React Query API would be heavy.
    // Instead invoke the function: useCommunityPosts is a custom hook calling useQuery,
    // so we exercise it by inspecting the queryFn through a tiny wrapper:
    const { useQuery } = await import("@tanstack/react-query");
    let capturedFn: any = null;
    const origUseQuery = useQuery as any;
    vi.spyOn(await import("@tanstack/react-query"), "useQuery").mockImplementation((opts: any) => {
      capturedFn = opts.queryFn;
      return { data: undefined, isSuccess: false } as any;
    });
    useCommunityPosts();
    expect(capturedFn).toBeTruthy();
    const data = await capturedFn();

    expect(fromCalls).toContain("community_posts");
    expect(fromCalls).toContain("public_profiles");
    expect(fromCalls).not.toContain("profiles");
    expect(data[0]).toMatchObject({ id: "p1", profiles: { display_name: "Alice" } });
  });
});
