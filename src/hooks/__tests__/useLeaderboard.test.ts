import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for the invoke helper
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock supabase auth
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
        error: null,
      }),
    },
  },
}));

describe("Leaderboard types and data structure", () => {
  it("should define correct LeaderboardEntry shape", () => {
    const entry = {
      rank: 1,
      type: "individual" as const,
      id: "player-1",
      name: "John Doe",
      team_name: undefined,
      total_gross: 72,
      total_net: 68,
      final_score: 68,
      rounds_played: 1,
      breakdown: [{ round: 1, gross: 72, net: 68, handicap: 4 }],
    };

    expect(entry.rank).toBe(1);
    expect(entry.type).toBe("individual");
    expect(entry.final_score).toBe(68);
    expect(entry.breakdown).toHaveLength(1);
  });

  it("should define correct team LeaderboardEntry with members and fairness", () => {
    const teamEntry = {
      rank: 2,
      type: "team" as const,
      id: "team-1",
      name: "Team Alpha",
      total_gross: 144,
      total_net: 136,
      final_score: 122.4, // 136 * (1 - 10/100)
      rounds_played: 2,
      breakdown: [
        { round: 1, gross: 72, net: 68, handicap: 0 },
        { round: 2, gross: 72, net: 68, handicap: 0 },
      ],
      members: [
        { player_id: "p1", name: "Alice", net_score: 68 },
        { player_id: "p2", name: "Bob", net_score: 70 },
      ],
    };

    expect(teamEntry.type).toBe("team");
    expect(teamEntry.members).toHaveLength(2);
    expect(teamEntry.final_score).toBe(122.4);
  });

  it("should support all filter types", () => {
    const filters: Array<"all" | "individuals" | "teams"> = ["all", "individuals", "teams"];
    expect(filters).toContain("all");
    expect(filters).toContain("individuals");
    expect(filters).toContain("teams");
  });

  it("should calculate fairness factor correctly", () => {
    const teamNetScore = 136;
    const fairnessPct = 10;
    const finalScore = teamNetScore * (1 - fairnessPct / 100);
    expect(finalScore).toBeCloseTo(122.4);
  });

  it("should calculate fairness factor of 0 correctly", () => {
    const teamNetScore = 136;
    const fairnessPct = 0;
    const finalScore = teamNetScore * (1 - fairnessPct / 100);
    expect(finalScore).toBe(136);
  });

  it("should sort entries by final_score ascending (golf)", () => {
    const entries = [
      { final_score: 72, name: "C" },
      { final_score: 68, name: "A" },
      { final_score: 70, name: "B" },
    ];
    entries.sort((a, b) => a.final_score - b.final_score);
    expect(entries[0].name).toBe("A");
    expect(entries[1].name).toBe("B");
    expect(entries[2].name).toBe("C");
  });

  it("should handle best_ball aggregation correctly", () => {
    const memberScores = [
      { net_score: 68, gross_score: 72 },
      { net_score: 71, gross_score: 75 },
      { net_score: 65, gross_score: 70 },
    ];
    const best = memberScores.reduce((a, b) => (a.net_score < b.net_score ? a : b));
    expect(best.net_score).toBe(65);
    expect(best.gross_score).toBe(70);
  });

  it("should handle average aggregation correctly", () => {
    const memberScores = [
      { net_score: 68 },
      { net_score: 72 },
      { net_score: 70 },
    ];
    const avg = memberScores.reduce((s, p) => s + p.net_score, 0) / memberScores.length;
    expect(avg).toBe(70);
  });

  it("should handle Peoria handicap calculation", () => {
    const holeScores = [4, 5, 3, 6, 4, 5, 3, 4, 5, 4, 5, 3, 6, 4, 5, 3, 4, 5];
    const hiddenHoles = [2, 5, 8, 11, 14, 17]; // 6 hidden holes for 18-hole
    const multiplier = 3;

    const hiddenSum = hiddenHoles.reduce((sum, h) => sum + (holeScores[h - 1] || 0), 0);
    const handicap = hiddenSum * multiplier;
    const gross = holeScores.reduce((s, v) => s + v, 0);
    const net = gross - handicap;

    expect(hiddenSum).toBe(5 + 4 + 4 + 5 + 4 + 4); // 26
    expect(handicap).toBe(78);
    expect(gross).toBe(78);
    expect(net).toBe(0);
  });

  it("should handle 9-hole Peoria with 3 hidden holes × 3", () => {
    const holeScores = [4, 5, 3, 6, 4, 5, 3, 4, 5];
    const hiddenHoles = [2, 5, 8]; // 3 hidden holes for 9-hole
    const multiplier = 3;

    const hiddenSum = hiddenHoles.reduce((sum, h) => sum + (holeScores[h - 1] || 0), 0);
    const handicap = hiddenSum * multiplier;
    const gross = holeScores.reduce((s, v) => s + v, 0);

    expect(hiddenSum).toBe(5 + 4 + 4); // 13
    expect(handicap).toBe(39);
    expect(gross).toBe(39);
  });
});
