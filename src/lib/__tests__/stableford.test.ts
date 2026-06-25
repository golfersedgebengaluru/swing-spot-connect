import { describe, it, expect } from "vitest";
import {
  holeToStablefordPoints,
  holeScoresToStableford,
  classifyStablefordTier,
  bestBallHoleScores,
  formatPoints,
} from "../stableford";

describe("holeToStablefordPoints", () => {
  it("scores each tier correctly on a par 4", () => {
    expect(holeToStablefordPoints(1, 4)).toBe(8); // albatross (−3)
    expect(holeToStablefordPoints(2, 4)).toBe(5); // eagle
    expect(holeToStablefordPoints(3, 4)).toBe(2); // birdie
    expect(holeToStablefordPoints(4, 4)).toBe(0); // par
    expect(holeToStablefordPoints(5, 4)).toBe(-1); // bogey
    expect(holeToStablefordPoints(6, 4)).toBe(-2); // double bogey
  });

  it("caps anything worse than +2 at −2 points", () => {
    expect(holeToStablefordPoints(7, 4)).toBe(-2);
    expect(holeToStablefordPoints(10, 4)).toBe(-2);
    expect(holeToStablefordPoints(99, 4)).toBe(-2);
  });

  it("works across different pars", () => {
    expect(holeToStablefordPoints(3, 5)).toBe(5); // eagle on par 5
    expect(holeToStablefordPoints(2, 3)).toBe(2); // birdie on par 3
    expect(holeToStablefordPoints(2, 5)).toBe(8); // albatross on par 5
  });


  it("returns 0 when strokes or par missing", () => {
    expect(holeToStablefordPoints(0, 4)).toBe(0);
    expect(holeToStablefordPoints(4, 0)).toBe(0);
  });
});

describe("holeScoresToStableford", () => {
  it("sums points across a round", () => {
    const par = [4, 4, 3, 5, 4];
    const scores = [3, 4, 2, 6, 8]; // birdie, par, birdie, bogey, +4
    // +2 + 0 + +2 + −1 + −2 = +1
    expect(holeScoresToStableford(scores, par)).toBe(1);
  });
});

describe("classifyStablefordTier", () => {
  it("returns the correct tier name", () => {
    expect(classifyStablefordTier(3, 4)).toBe("birdie");
    expect(classifyStablefordTier(6, 4)).toBe("double_plus");
    expect(classifyStablefordTier(10, 4)).toBe("double_plus");
  });
});

describe("bestBallHoleScores", () => {
  it("returns per-hole minimum across players (skipping 0)", () => {
    const a = [4, 5, 0, 6];
    const b = [5, 4, 4, 7];
    expect(bestBallHoleScores([a, b])).toEqual([4, 4, 4, 6]);
  });

  it("handles a single player", () => {
    expect(bestBallHoleScores([[4, 5, 3]])).toEqual([4, 5, 3]);
  });

  it("returns [] when given no arrays", () => {
    expect(bestBallHoleScores([])).toEqual([]);
  });
});

describe("formatPoints", () => {
  it("adds + for positive, − sign survives, 0 stays 0", () => {
    expect(formatPoints(14)).toBe("+14");
    expect(formatPoints(0)).toBe("0");
    expect(formatPoints(-3)).toBe("-3");
  });
});
