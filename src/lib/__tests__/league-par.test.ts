import { describe, it, expect } from "vitest";
import { resolveLeaguePar } from "../league-par";

const locs = [
  { id: "eden", software: "TGC" },
  { id: "gspro-loc", software: "GSPro" },
];
const parSets = [
  { course_name: "Royal Birkdale", software: "TGC",   par_per_hole: [4,4,3,4,4,5,4,3,4, 4,4,3,4,3,5,4,5,5] }, // 70
  { course_name: "Royal Birkdale", software: "GSPro", par_per_hole: [4,4,3,4,4,5,4,4,4, 4,4,3,4,4,5,4,5,5] }, // 72
];
const roundFallback = [4,4,3,4,4,5,4,4,4, 4,4,3,4,4,5,4,5,5]; // 72

describe("resolveLeaguePar", () => {
  it("resolves TGC par set for Eden Aquatic Club (Par 70)", () => {
    const r = resolveLeaguePar({
      playerLocationId: "eden",
      roundCourseName: "Royal Birkdale",
      roundParPerHole: roundFallback,
      locations: locs,
      parSets,
    });
    expect(r.source).toBe("par-set");
    expect(r.software).toBe("TGC");
    expect(r.par.reduce((s, v) => s + v, 0)).toBe(70);
  });

  it("resolves GSPro par set (Par 72) for a GSPro venue", () => {
    const r = resolveLeaguePar({
      playerLocationId: "gspro-loc",
      roundCourseName: "Royal Birkdale",
      roundParPerHole: roundFallback,
      locations: locs,
      parSets,
    });
    expect(r.software).toBe("GSPro");
    expect(r.par.reduce((s, v) => s + v, 0)).toBe(72);
  });

  it("falls back to round par when player has no location", () => {
    const r = resolveLeaguePar({
      playerLocationId: null,
      roundCourseName: "Royal Birkdale",
      roundParPerHole: roundFallback,
      locations: locs,
      parSets,
    });
    expect(r.source).toBe("round");
    expect(r.software).toBeNull();
    expect(r.par).toEqual(roundFallback);
  });

  it("falls back when no par set matches the course+software combo", () => {
    const r = resolveLeaguePar({
      playerLocationId: "eden",
      roundCourseName: "Unknown Course",
      roundParPerHole: roundFallback,
      locations: locs,
      parSets,
    });
    expect(r.source).toBe("round");
  });

  it("falls back when the round has no course_name set", () => {
    const r = resolveLeaguePar({
      playerLocationId: "eden",
      roundCourseName: null,
      roundParPerHole: roundFallback,
      locations: locs,
      parSets,
    });
    expect(r.source).toBe("round");
  });
});
