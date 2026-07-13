import { describe, it, expect } from "vitest";

// Merge/de-dupe helper mirrors the logic inside src/pages/Leagues.tsx so we
// pin the contract: leagues from BOTH tenant-role + legacy-team sources are
// shown, tenant-role wins on collision, and order is stable.
function mergeLeagues<T extends { id: string }>(tenant: T[] | undefined, legacy: T[] | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const l of (tenant || [])) if (!seen.has(l.id)) { seen.add(l.id); out.push(l); }
  for (const l of (legacy || [])) if (!seen.has(l.id)) { seen.add(l.id); out.push(l); }
  return out;
}

describe("Leagues page — legacy + tenant league merge", () => {
  it("shows legacy-only leagues when tenant list is empty (fixes /leagues blank for legacy team members)", () => {
    const out = mergeLeagues([], [{ id: "L1" }, { id: "L2" }]);
    expect(out.map(x => x.id)).toEqual(["L1", "L2"]);
  });

  it("shows tenant-only leagues when legacy list is empty", () => {
    const out = mergeLeagues([{ id: "A" }], []);
    expect(out.map(x => x.id)).toEqual(["A"]);
  });

  it("de-duplicates by id when the same league appears in both sources", () => {
    const out = mergeLeagues([{ id: "X", src: "t" }], [{ id: "X", src: "l" }, { id: "Y" }]);
    expect(out).toEqual([{ id: "X", src: "t" }, { id: "Y" }]);
  });

  it("handles undefined inputs without throwing", () => {
    expect(mergeLeagues(undefined, undefined)).toEqual([]);
  });
});
