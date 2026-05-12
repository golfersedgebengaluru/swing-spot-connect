import { describe, it, expect } from "vitest";
import { parseTeamSizes } from "../useLeaguesLite";

describe("parseTeamSizes", () => {
  it("parses simple comma-separated values", () => {
    expect(parseTeamSizes("2,4")).toEqual([2, 4]);
  });
  it("trims, dedupes, and sorts", () => {
    expect(parseTeamSizes(" 4, 2 , 4 ,3")).toEqual([2, 3, 4]);
  });
  it("ignores invalid and out-of-range entries", () => {
    expect(parseTeamSizes("2,abc,,0,21,5")).toEqual([2, 5]);
  });
  it("returns empty array for empty input", () => {
    expect(parseTeamSizes("")).toEqual([]);
  });
});
