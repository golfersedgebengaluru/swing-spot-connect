import { describe, it, expect, vi, beforeEach } from "vitest";

const inserts: Record<string, any[]> = {};
const mockFrom = vi.fn((table: string) => ({
  insert: (rows: any) => {
    inserts[table] = (inserts[table] ?? []).concat(rows);
    return Promise.resolve({ error: null });
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { persistSessionSelection } = await import("@/hooks/useCoachingLibrary");
import type { LibraryFocus } from "@/lib/coaching-library";

const library: LibraryFocus[] = [
  {
    id: "f1",
    name: "Ball Contact",
    category_name: "Full Swing",
    drills: [{ id: "d1", name: "9-to-3 Half Swing", recommended_reps: "10-15 balls" }],
  },
  { id: "f2", name: "Tempo", category_name: "Full Swing", drills: [{ id: "d1", name: "9-to-3 Half Swing" }] },
];

describe("persistSessionSelection", () => {
  beforeEach(() => {
    Object.keys(inserts).forEach((k) => delete inserts[k]);
    mockFrom.mockClear();
  });

  it("inserts focuses and drills once, with snapshots, and never updates", async () => {
    const res = await persistSessionSelection(
      "s1",
      {
        focusIds: ["f1", "f2"],
        drills: [
          { drillId: "d1", focusId: "f1", note: "keep it smooth" },
          { drillId: "d1", focusId: "f2", note: "duplicate" },
        ],
      },
      library
    );

    expect(res).toEqual({ focusCount: 2, drillCount: 1 });
    expect(inserts["session_focuses"]).toHaveLength(2);
    expect(inserts["session_drills"]).toHaveLength(1);
    expect(inserts["session_drills"][0]).toMatchObject({
      session_id: "s1",
      drill_id: "d1",
      focus_id: "f1",
      coach_note: "keep it smooth",
      snapshot: { name: "9-to-3 Half Swing", recommended_reps: "10-15 balls", focus_name: "Ball Contact" },
    });
    // Insert-only history: no update/delete/upsert on session tables.
    const tables = mockFrom.mock.calls.map((c) => c[0]);
    expect(tables).toEqual(["session_focuses", "session_drills"]);
  });

  it("skips inserts entirely when nothing was selected", async () => {
    const res = await persistSessionSelection("s1", { focusIds: [], drills: [] }, library);
    expect(res).toEqual({ focusCount: 0, drillCount: 0 });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
