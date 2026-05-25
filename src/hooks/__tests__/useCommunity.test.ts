import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Stub useQuery so it just runs the queryFn synchronously and returns result.
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => {
    return { queryFn: opts.queryFn };
  },
  useMutation: (opts: any) => ({ mutate: opts.mutationFn, mutateAsync: opts.mutationFn }),
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));

import { useCommunityPosts } from "../useCommunity";

describe("useCommunityPosts (PII-safe author lookup)", () => {
  beforeEach(() => {
    fromCalls.length = 0;
  });

  it("never queries the raw profiles table for community authors", async () => {
    const hook = useCommunityPosts() as any;
    const data = await hook.queryFn();

    expect(fromCalls).toContain("community_posts");
    expect(fromCalls).toContain("public_profiles");
    expect(fromCalls).not.toContain("profiles");
    expect(data[0]).toMatchObject({ id: "p1", profiles: { display_name: "Alice" } });
  });

  it("falls back to null display_name when author missing", async () => {
    // Replace mock to return empty author list
    fromCalls.length = 0;
    const { supabase } = await import("@/integrations/supabase/client");
    (supabase.from as any).mockImplementation((table: string) => {
      fromCalls.push(table);
      if (table === "community_posts") {
        return makeChain([{ id: "p2", user_id: "u-unknown", content: "x" }]);
      }
      return makeChain([]);
    });

    const hook = useCommunityPosts() as any;
    const data = await hook.queryFn();
    expect(data[0].profiles).toEqual({ display_name: null });
  });
});
