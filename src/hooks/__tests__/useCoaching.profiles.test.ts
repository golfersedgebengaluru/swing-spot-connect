import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createQueryMock } from "@/test/supabase-mock";

const mockFrom = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mockFrom } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "coach-auth" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const { useAllSessions, useMyCoachSessions, useSession } = await import("@/hooks/useCoaching");

const profiles = [
  { id: "3067873d-6b0c-4b02-880f-767085ea5948", user_id: null, display_name: "Akshath & Vilvaa", email: null },
  { id: "dfdc6b05-741e-4dcb-b4d4-697e1899a945", user_id: null, display_name: "Akshadha Rajan", email: null },
  { id: "coach-profile", user_id: "coach-auth", display_name: "Bharath Arvind", email: "coach@example.test" },
  { id: "registered-profile", user_id: "registered-auth", display_name: "Registered Student", email: "student@example.test" },
];
const sessions = profiles.filter((p) => p.id !== "coach-profile").map((p) => ({
  id: `session-${p.id}`, coach_user_id: "coach-auth", student_user_id: p.user_id ?? p.id,
  city: "Chennai", session_type: "coach_directed", session_date: "2026-11-24",
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

function setup(failedLookup?: string) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "coaching_sessions") {
      const query = createQueryMock(sessions);
      query.maybeSingle.mockResolvedValue({ data: sessions[0], error: null });
      return query;
    }
    const query = createQueryMock();
    query.in.mockImplementation((column: string, ids: string[]) => {
      if (failedLookup === `${table}.${column}`) {
        return Promise.resolve({ data: null, error: new Error("Profile lookup unavailable") });
      }
      if (table === "public_profiles" && column === "id") {
        return Promise.resolve({ data: null, error: new Error("column id does not exist") });
      }
      const data = profiles.filter((p) => ids.includes(column === "user_id" ? p.user_id ?? "" : p.id))
        .map((p) => table === "public_profiles"
          ? { user_id: p.user_id, profile_id: p.id, display_name: p.display_name }
          : { id: p.id, user_id: p.user_id, email: p.email });
      return Promise.resolve({ data, error: null });
    });
    return query;
  });
}

describe("coaching profile identity enrichment", () => {
  beforeEach(() => { mockFrom.mockReset(); setup(); });

  it("resolves both admin-created students without auth accounts or email, alongside authenticated users", async () => {
    const { result } = renderHook(() => useAllSessions("Chennai"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((s) => s.student_profile)).toEqual([
      { display_name: "Akshath & Vilvaa", email: null },
      { display_name: "Akshadha Rajan", email: null },
      { display_name: "Registered Student", email: "student@example.test" },
    ]);
    expect(result.current.data?.[0].coach_profile?.display_name).toBe("Bharath Arvind");
    expect(result.current.data?.map((s) => s.student_user_id)).toEqual(sessions.map((s) => s.student_user_id));
  });

  it("resolves the same student names in coach session lists", async () => {
    const { result } = renderHook(() => useMyCoachSessions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].student_profile?.display_name).toBe("Akshath & Vilvaa");
    expect(result.current.data?.[1].student_profile?.display_name).toBe("Akshadha Rajan");
  });

  it("resolves an admin-created student in single-session details", async () => {
    const { result } = renderHook(() => useSession(sessions[0].id), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.student_profile).toEqual({ display_name: "Akshath & Vilvaa", email: null });
  });

  it.each(["public_profiles.user_id", "public_profiles.profile_id", "profiles.user_id", "profiles.id"])(
    "surfaces a failed %s lookup instead of returning nameless sessions", async (lookup) => {
      setup(lookup);
      const { result } = renderHook(() => useAllSessions("Chennai"), { wrapper: wrapper() });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe("Profile lookup unavailable");
      expect(result.current.data).toBeUndefined();
    },
  );
});