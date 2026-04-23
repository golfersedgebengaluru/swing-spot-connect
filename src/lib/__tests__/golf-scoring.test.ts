import { describe, it, expect } from "vitest";
import {
  capHoleScore,
  capHoleScores,
  classifyHole,
  totalPar,
  totalRelativeToPar,
  formatRelativeToPar,
  MAX_OVER_PAR_PER_HOLE,
} from "../golf-scoring";

describe("capHoleScore", () => {
  it("does not change a score that is at or below par+4", () => {
    expect(capHoleScore(4, 4)).toBe(4); // par
    expect(capHoleScore(7, 4)).toBe(7); // +3 — still allowed
    expect(capHoleScore(8, 4)).toBe(8); // exactly +4
    expect(capHoleScore(2, 5)).toBe(2); // eagle
  });

  it("caps a +5 to +4 (the documented project rule)", () => {
    expect(capHoleScore(9, 4)).toBe(8); // +5 → +4
    expect(capHoleScore(10, 4)).toBe(8); // way over → still capped at +4
  });

  it("caps with respect to the actual par (par 3 vs par 5)", () => {
    expect(capHoleScore(8, 3)).toBe(7); // par 3 + 4 = 7
    expect(capHoleScore(11, 5)).toBe(9); // par 5 + 4 = 9
  });

  it("returns the score untouched when par is missing or invalid", () => {
    expect(capHoleScore(12, 0)).toBe(12);
    expect(capHoleScore(12, NaN as unknown as number)).toBe(12);
  });

  it("uses the documented MAX_OVER_PAR_PER_HOLE constant", () => {
    expect(MAX_OVER_PAR_PER_HOLE).toBe(4);
  });
});

describe("capHoleScores", () => {
  it("caps each hole independently against its own par", () => {
    const scores = [9, 4, 11, 6, 3]; // mix of clean + blowups
    const par = [4, 4, 5, 4, 3];
    expect(capHoleScores(scores, par)).toEqual([8, 4, 9, 6, 3]);
  });

  it("leaves holes alone when par is not yet set", () => {
    expect(capHoleScores([9, 9, 9], [0, 0, 0])).toEqual([9, 9, 9]);
  });
});

describe("classifyHole", () => {
  it("classifies albatross at −3 or better", () => {
    expect(classifyHole(2, 5)).toBe("albatross"); // 2 on a par 5
    expect(classifyHole(1, 4)).toBe("albatross"); // hole-in-one on par 4 = -3
  });

  it("classifies the standard golf labels correctly", () => {
    expect(classifyHole(2, 4)).toBe("eagle");
    expect(classifyHole(3, 4)).toBe("birdie");
    expect(classifyHole(4, 4)).toBe("par");
    expect(classifyHole(5, 4)).toBe("bogey");
    expect(classifyHole(6, 4)).toBe("double_bogey");
    expect(classifyHole(7, 4)).toBe("triple_plus"); // +3
    expect(classifyHole(9, 4)).toBe("triple_plus"); // way over
  });

  it("returns null when par is not set", () => {
    expect(classifyHole(4, 0)).toBeNull();
    expect(classifyHole(0, 4)).toBeNull();
  });
});

describe("totalPar / totalRelativeToPar", () => {
  it("sums par across configured holes only", () => {
    expect(totalPar([4, 4, 3, 5, 4, 4, 4, 3, 5])).toBe(36);
    expect(totalPar([4, 4, 0, 0])).toBe(8);
  });

  it("returns relative-to-par when par is configured", () => {
    const par = Array(9).fill(4); // par 36
    const scores = [4, 5, 3, 4, 4, 4, 4, 4, 4]; // 36 → E
    expect(totalRelativeToPar(scores, par)).toBe(0);
    expect(totalRelativeToPar([4, 4, 4, 4, 4, 4, 4, 4, 3], par)).toBe(-1);
  });

  it("returns null when par is not configured", () => {
    expect(totalRelativeToPar([4, 4, 4], [0, 0, 0])).toBeNull();
    expect(totalRelativeToPar([4, 4, 4], [])).toBeNull();
  });
});

describe("formatRelativeToPar", () => {
  it('shows "E" at par', () => {
    expect(formatRelativeToPar(0)).toBe("E");
  });

  it("shows under par with a minus sign", () => {
    expect(formatRelativeToPar(-4)).toBe("-4");
  });

  it("shows over par with a plus sign", () => {
    expect(formatRelativeToPar(3)).toBe("+3");
  });

  it("returns empty string for null/undefined", () => {
    expect(formatRelativeToPar(null)).toBe("");
  });
});
