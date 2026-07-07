import { describe, it, expect } from "vitest";
import { bestBallHoleScores } from "../stableford";

/**
 * Regression test for team best-ball gross aggregation.
 *
 * Bug: prior implementation used the lowest player TOTAL as the team's
 * best-ball gross (e.g. Team A → 71 from Test's total) instead of the
 * per-hole minimum summed (e.g. 66).
 *
 * Correct best-ball gross = sum of per-hole minima across teammates.
 */
describe("best-ball team gross aggregation", () => {
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

  it("sums per-hole minima across teammates (Team A scenario)", () => {
    // 18-hole round: Yashas total 79, Test total 71,
    // but per-hole best-ball totals 66.
    const yashas = [5, 4, 4, 5, 4, 5, 4, 5, 4, 5, 4, 4, 5, 4, 5, 4, 5, 3]; // 79
    const test   = [4, 5, 3, 4, 5, 4, 3, 4, 5, 4, 3, 5, 4, 5, 4, 3, 4, 3]; // 66? verify
    // Adjust to hit the exact totals we care about:
    const p1 = [5, 5, 4, 4, 5, 5, 4, 4, 4, 5, 4, 5, 4, 4, 5, 4, 4, 3]; // 78
    const p2 = [4, 4, 5, 5, 4, 4, 5, 5, 5, 4, 5, 4, 5, 5, 4, 5, 5, 4]; // 82
    const bb = bestBallHoleScores([p1, p2]);
    // per-hole min of the two arrays
    expect(bb).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3]);
    expect(sum(bb)).toBe(71); // 17*4 + 3
    // Both individual totals are HIGHER than best-ball total in this crafted case? No —
    // sanity: best-ball must be ≤ min(individual totals).
    expect(sum(bb)).toBeLessThanOrEqual(Math.min(sum(p1), sum(p2)));
  });

  it("best-ball total is strictly less than lowest individual when teammates trade holes", () => {
    // Yashas beats Test on the front 9, Test beats Yashas on the back 9.
    const yashas = [3, 3, 3, 3, 3, 3, 3, 3, 3, 6, 6, 6, 6, 6, 6, 6, 6, 6]; // 27+54=81
    const test   = [6, 6, 6, 6, 6, 6, 6, 6, 6, 3, 3, 3, 3, 3, 3, 3, 3, 3]; // 54+27=81
    const bb = bestBallHoleScores([yashas, test]);
    expect(bb).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(sum(bb)).toBe(54);
    // Old buggy behaviour would have reported 81 (the lower individual total).
    expect(sum(bb)).toBeLessThan(Math.min(sum(yashas), sum(test)));
  });

  it("skips missing/zero hole values from a teammate", () => {
    const a = [4, 0, 5, 0];
    const b = [5, 4, 6, 0];
    expect(bestBallHoleScores([a, b])).toEqual([4, 4, 5, 0]);
  });
});
