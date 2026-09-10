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

/**
 * Table-aware `from()` stub. `leagues_only_admins` is read with
 * .maybeSingle(); `site_admin_cities` resolves to a list of rows.
 */
function mockTables(cities: Array<{ city: string }> = []) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "site_admin_cities") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: cities, error: null }),
      };
    }
    // leagues_only_admins (and any other single-row lookup)
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });
}

describe("useAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTables();
  });

  // roles are resolved with three parallel RPCs: admin, site_admin, is_coach
  const mockRoles = (opts: { admin: boolean; siteAdmin: boolean; coach?: boolean }) => {
    mockRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "is_coach") return { data: !!opts.coach, error: null };
      if (fn === "has_role" && args._role === "admin") return { data: opts.admin, error: null };
      if (fn === "has_role" && args._role === "site_admin") return { data: opts.siteAdmin, error: null };
      return { data: false, error: null };
    });
  };

  it("sets isAdmin=true when user has admin role", async () => {
    mockRoles({ admin: true, siteAdmin: false });

    const { result } = renderHook(() => useAdmin(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    expect(result.current.isSiteAdmin).toBe(false);
    expect(result.current.role).toBe("admin");
    expect(result.current.hasAdminAccess).toBe(true);
  });

  it("sets isSiteAdmin=true and fetches cities when user is site_admin", async () => {
    mockRoles({ admin: false, siteAdmin: true });
    mockTables([{ city: "Mumbai" }, { city: "Delhi" }]);

    const { result } = renderHook(() => useAdmin(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.isSiteAdmin).toBe(true));
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.role).toBe("site_admin");
    expect(result.current.assignedCities).toEqual(["Mumbai", "Delhi"]);
  });

  it("sets no admin access when user has no roles", async () => {
    mockRoles({ admin: false, siteAdmin: false });

    const { result } = renderHook(() => useAdmin(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasAdminAccess).toBe(false);
    expect(result.current.role).toBeNull();
  });
});

