import { describe, it, expect } from "vitest";
import { buildWrapUpNameMap } from "../SeasonWrapUpPanel";

/**
 * Wrap-up standings and awards must show real names for BOTH
 *   - claimed players (identified by user_id)
 *   - admin-managed / shadow players (identified by league_players.id, no user_id)
 * because their scores are keyed differently in league_scores.
 */
describe("buildWrapUpNameMap", () => {
  it("resolves claimed players via user_id and shadow players via league_players.id", () => {
    const players = [
      { id: "lp-1", user_id: "u-alice", display_name: "Alice", email: "alice@example.com" },
      { id: "lp-2", user_id: null, display_name: "Test Yashas", email: null }, // shadow
      { id: "lp-3", user_id: null, display_name: null, email: "raj@example.com" }, // shadow, name from email
      { id: "lp-4", user_id: "u-empty", display_name: null, email: null }, // unnamed → skipped
    ];
    const map = buildWrapUpNameMap(players);

    // Claimed: reachable by user_id AND by league_players.id
    expect(map.get("u-alice")).toBe("Alice");
    expect(map.get("lp-1")).toBe("Alice");

    // Shadow: reachable by league_players.id only
    expect(map.get("lp-2")).toBe("Test Yashas");
    expect(map.get("lp-3")).toBe("raj@example.com");

    // Unnamed players don't pollute the map
    expect(map.has("u-empty")).toBe(false);
    expect(map.has("lp-4")).toBe(false);
  });

  it("prefers display_name over email when both exist", () => {
    const map = buildWrapUpNameMap([
      { id: "lp-x", user_id: null, display_name: "Preferred", email: "x@example.com" },
    ]);
    expect(map.get("lp-x")).toBe("Preferred");
  });
});
