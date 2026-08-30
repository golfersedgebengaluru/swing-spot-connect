import { describe, it, expect } from "vitest";
import {
  COACH_NOTE_MAX,
  buildSessionRows,
  drillSnapshot,
  isNoteValid,
  mapLibraryFocus,
  normalizeNote,
  type LibraryFocus,
} from "@/lib/coaching-library";

const drillA = {
  id: "d1",
  name: "9-to-3 Half Swing",
  objective: "Centred contact",
  instructions: "Swing 9 to 3",
  recommended_reps: "10-15 balls",
  category_name: "Full Swing",
};
const drillB = { id: "d2", name: "Gate Putting Drill", category_name: "Putting" };

const library: LibraryFocus[] = [
  { id: "f1", name: "Ball Contact", category_name: "Full Swing", drills: [drillA] },
  { id: "f2", name: "Tempo", category_name: "Full Swing", drills: [drillA] },
  { id: "f3", name: "Start Line", category_name: "Putting", drills: [drillB] },
  { id: "f4", name: "Feel", category_name: "Short Game", drills: [] },
];

describe("coaching-library snapshots", () => {
  it("freezes the drill detail at save time", () => {
    const snap = drillSnapshot(drillA, library[0]);
    expect(snap).toEqual({
      name: "9-to-3 Half Swing",
      objective: "Centred contact",
      instructions: "Swing 9 to 3",
      recommended_reps: "10-15 balls",
      category: "Full Swing",
      focus_name: "Ball Contact",
      video_url: null,
    });

    // Library edited afterwards → the snapshot already written is untouched.
    const edited = { ...drillA, name: "Renamed", instructions: "Changed" };
    expect(drillSnapshot(edited, library[0]).name).toBe("Renamed");
    expect(snap.name).toBe("9-to-3 Half Swing");
    expect(snap.instructions).toBe("Swing 9 to 3");
  });
});

describe("buildSessionRows", () => {
  it("writes one row per focus with a frozen snapshot", () => {
    const { focusRows } = buildSessionRows("s1", { focusIds: ["f1", "f3"], drills: [] }, library);
    expect(focusRows).toHaveLength(2);
    expect(focusRows[0]).toMatchObject({
      session_id: "s1",
      focus_id: "f1",
      snapshot: { name: "Ball Contact", category: "Full Swing" },
    });
  });

  it("records a drill reachable from two focuses only once, with one note", () => {
    const { drillRows } = buildSessionRows(
      "s1",
      {
        focusIds: ["f1", "f2"],
        drills: [
          { drillId: "d1", focusId: "f1", note: "first note" },
          { drillId: "d1", focusId: "f2", note: "second note" },
        ],
      },
      library
    );
    expect(drillRows).toHaveLength(1);
    expect(drillRows[0].coach_note).toBe("first note");
    expect(drillRows[0].focus_id).toBe("f1");
  });

  it("saves a focus that has no mapped drills", () => {
    const { focusRows, drillRows } = buildSessionRows("s1", { focusIds: ["f4"], drills: [] }, library);
    expect(focusRows).toHaveLength(1);
    expect(drillRows).toHaveLength(0);
  });

  it("stores an empty note as null and trims whitespace", () => {
    const { drillRows } = buildSessionRows(
      "s1",
      { focusIds: ["f1"], drills: [{ drillId: "d1", focusId: "f1", note: "   " }] },
      library
    );
    expect(drillRows[0].coach_note).toBeNull();
    expect(normalizeNote("  hi  ")).toBe("hi");
  });

  it("rejects a note over the 500-character cap", () => {
    const long = "x".repeat(COACH_NOTE_MAX + 1);
    expect(isNoteValid(long)).toBe(false);
    expect(() =>
      buildSessionRows(
        "s1",
        { focusIds: ["f1"], drills: [{ drillId: "d1", focusId: "f1", note: long }] },
        library
      )
    ).toThrow(/exceeds 500/);
  });

  it("ignores selections that no longer exist in the library", () => {
    const { focusRows, drillRows } = buildSessionRows(
      "s1",
      { focusIds: ["ghost"], drills: [{ drillId: "ghost-d", focusId: "ghost" }] },
      library
    );
    expect(focusRows).toHaveLength(0);
    expect(drillRows).toHaveLength(0);
  });

  it("deduplicates repeated focus ids", () => {
    const { focusRows } = buildSessionRows("s1", { focusIds: ["f1", "f1"], drills: [] }, library);
    expect(focusRows).toHaveLength(1);
  });
});

describe("mapLibraryFocus", () => {
  it("drops deactivated drills and sorts by name", () => {
    const focus = mapLibraryFocus({
      id: "f1",
      name: "Ball Contact",
      coaching_categories: { name: "Full Swing" },
      focus_drills: [
        { coaching_drills: { id: "z", name: "Zebra", active: true, coaching_categories: { name: "Full Swing" } } },
        { coaching_drills: { id: "x", name: "Retired", active: false } },
        { coaching_drills: { id: "a", name: "Alpha", active: true } },
      ],
    });
    expect(focus.drills.map((d) => d.name)).toEqual(["Alpha", "Zebra"]);
    expect(focus.category_name).toBe("Full Swing");
  });
});
