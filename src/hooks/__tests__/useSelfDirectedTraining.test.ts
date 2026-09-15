import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryFocus } from "@/lib/coaching-library";

const mockRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();
const deleteResult = vi.fn();
const deleteEq = vi.fn(() => ({ eq: deleteResult }));
const mockFrom = vi.fn(() => ({ delete: () => ({ eq: deleteEq }) }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
    functions: { invoke: mockFunctionsInvoke },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "member-1" }, loading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useNotificationEmail", () => ({ sendNotificationEmail: vi.fn() }));

const { useCompleteSelfDirectedTraining, useDeleteSelfDirectedSession } = await import("@/hooks/useCoaching");

const library: LibraryFocus[] = [{
  id: "focus-1",
  name: "Ball Contact",
  category_name: "Full Swing",
  drills: [{ id: "drill-1", name: "9-to-3", instructions: "Small controlled swings", recommended_reps: "15 balls" }],
}];

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
}

describe("self-directed Training mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: "session-1", error: null });
    deleteResult.mockResolvedValue({ error: null });
  });

  it("completes one atomic self-directed log with frozen focus and drill snapshots", async () => {
    const { result } = renderHook(() => useCompleteSelfDirectedTraining(), { wrapper: wrapper() });
    await result.current.mutateAsync({
      city: "Bengaluru",
      sessionDate: "2026-09-15",
      notes: "  Better contact  ",
      progressSummary: "  Eight solid strikes  ",
      selection: { focusIds: ["focus-1"], drills: [{ drillId: "drill-1", focusId: "focus-1", note: "Stay centred" }] },
      library,
    });

    expect(mockRpc).toHaveBeenCalledOnce();
    expect(mockRpc).toHaveBeenCalledWith("complete_self_directed_training", expect.objectContaining({
      _session: expect.objectContaining({ city: "Bengaluru", notes: "Better contact", progress_summary: "Eight solid strikes" }),
      _focuses: [expect.objectContaining({ focus_id: "focus-1", snapshot: expect.objectContaining({ name: "Ball Contact" }) })],
      _drills: [expect.objectContaining({ drill_id: "drill-1", coach_note: "Stay centred", snapshot: expect.objectContaining({ name: "9-to-3" }) })],
    }));
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it("deletes self-directed logs directly without calling booking/calendar cancellation", async () => {
    const { result } = renderHook(() => useDeleteSelfDirectedSession(), { wrapper: wrapper() });
    await result.current.mutateAsync("session-1");

    expect(mockFrom).toHaveBeenCalledWith("coaching_sessions");
    expect(deleteEq).toHaveBeenCalledWith("id", "session-1");
    expect(deleteResult).toHaveBeenCalledWith("session_type", "self_directed");
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });
});