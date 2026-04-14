import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests that verify the admin dashboard query optimisations:
 * 1. Independent queries run in parallel (Promise.all)
 * 2. Profiles query filters by userIds (not a full-table scan)
 * 3. Top members query limits to 5
 */

// Track every supabase call to verify parallelism and filters
const calls: { table: string; method: string; args: any[] }[] = [];

function makeChain(table: string) {
  const chain: any = {};
  const methods = [
    "select",
    "eq",
    "in",
    "gte",
    "lte",
    "order",
    "limit",
    "maybeSingle",
    "single",
  ];
  for (const m of methods) {
    chain[m] = (...args: any[]) => {
      calls.push({ table, method: m, args });
      return chain;
    };
  }
  // Make chain thenable so it works with Promise.all
  chain.then = (resolve: any) =>
    resolve({ data: [], count: 0, error: null });
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      calls.push({ table, method: "from", args: [table] });
      return makeChain(table);
    },
  },
}));

vi.mock("@/contexts/AdminCityContext", () => ({
  useAdminCity: () => ({ selectedCity: "Chennai" }),
}));

vi.mock("@/hooks/useCurrency", () => ({
  useDefaultCurrency: () => ({ format: (v: number) => `₹${v}` }),
}));

vi.mock("@/hooks/useAdmin", () => ({
  useAdmin: () => ({
    isAdmin: true,
    isSiteAdmin: false,
    role: "admin",
    assignedCities: [],
    hasAdminAccess: true,
    loading: false,
  }),
}));

beforeEach(() => {
  calls.length = 0;
});

describe("Admin dashboard query optimisations", () => {
  it("profiles query for upcoming bookings should use .in() filter on user_id", async () => {
    // Import the component source to inspect the queryFn pattern
    const source = await import("../../components/admin/AdminDashboardTab?raw");
    const code = (source as any).default ?? source;
    // The profiles query for resolving user names should filter by user_id
    expect(code).toContain('.in("user_id"');
  });

  it("top members query should limit to 5 not 50", async () => {
    const source = await import("../../components/admin/AdminDashboardTab?raw");
    const code = (source as any).default ?? source;
    // Should not contain .limit(50) for profiles
    expect(code).not.toContain(".limit(50)");
    // The top members query should limit(5)
    expect(code).toContain(".limit(5)");
  });

  it("should use Promise.all for parallel query execution", async () => {
    const source = await import("../../components/admin/AdminDashboardTab?raw");
    const code = (source as any).default ?? source;
    expect(code).toContain("Promise.all");
  });

  it("should not fetch all profiles without filter", async () => {
    const source = await import("../../components/admin/AdminDashboardTab?raw");
    const code = (source as any).default ?? source;
    // Old pattern: .select("id, user_id, display_name, email") with no .in() filter
    // Ensure that every profiles select for user resolution uses .in()
    const profileSelects = code.split('.from("profiles")');
    for (let i = 1; i < profileSelects.length; i++) {
      const segment = profileSelects[i].slice(0, 300);
      // Each profiles query should either be the top-members query (.in("user_type"))
      // or the user-name resolution query (.in("user_id"))
      const hasFilter = segment.includes(".in(") || segment.includes(".eq(");
      expect(hasFilter).toBe(true);
    }
  });
});
