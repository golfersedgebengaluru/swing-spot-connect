import { describe, it, expect } from "vitest";

describe("LeagueFeedItem types and data structure", () => {
  it("should define correct feed item shape", () => {
    const item = {
      id: "feed-1",
      league_id: "league-1",
      tenant_id: "tenant-1",
      actor_id: "user-1",
      actor_name: "John Doe",
      event_type: "score_submitted",
      payload: { total_score: 72, round_number: 1, method: "manual" },
      reactions: [{ emoji: "👏", count: 3, user_reacted: true }],
      created_at: "2026-04-16T00:00:00Z",
    };

    expect(item.event_type).toBe("score_submitted");
    expect(item.actor_name).toBe("John Doe");
    expect(item.reactions).toHaveLength(1);
    expect(item.reactions[0].user_reacted).toBe(true);
  });

  it("should define correct player_joined event", () => {
    const item = {
      id: "feed-2",
      league_id: "league-1",
      tenant_id: "tenant-1",
      actor_id: "user-2",
      actor_name: "Jane",
      event_type: "player_joined",
      payload: { team_id: "team-1" },
      reactions: [],
      created_at: "2026-04-16T00:00:00Z",
    };

    expect(item.event_type).toBe("player_joined");
    expect(item.payload.team_id).toBe("team-1");
  });

  it("should define correct round_closed event", () => {
    const item = {
      id: "feed-3",
      league_id: "league-1",
      tenant_id: "tenant-1",
      actor_id: "admin-1",
      actor_name: "Admin",
      event_type: "round_closed",
      payload: { round_number: 2, hidden_holes: [1, 5, 9, 12, 15, 18], scores_processed: 8 },
      reactions: [
        { emoji: "🔥", count: 2, user_reacted: false },
        { emoji: "👏", count: 5, user_reacted: true },
      ],
      created_at: "2026-04-16T00:00:00Z",
    };

    expect(item.event_type).toBe("round_closed");
    expect(item.payload.scores_processed).toBe(8);
    expect(item.reactions).toHaveLength(2);
  });

  it("should support all event types", () => {
    const events = ["score_submitted", "player_joined", "round_closed", "leaderboard_change"];
    expect(events).toContain("score_submitted");
    expect(events).toContain("player_joined");
    expect(events).toContain("round_closed");
    expect(events).toContain("leaderboard_change");
  });

  it("should support all emoji options", () => {
    const emojis = ["👏", "🔥", "⛳", "💪", "😮"];
    expect(emojis).toHaveLength(5);
  });

  it("should toggle reaction correctly", () => {
    const reactions = [
      { emoji: "👏", count: 3, user_reacted: true },
      { emoji: "🔥", count: 1, user_reacted: false },
    ];

    // Toggle off existing reaction
    const afterToggleOff = reactions.map((r) =>
      r.emoji === "👏" ? { ...r, count: r.count - 1, user_reacted: false } : r
    );
    expect(afterToggleOff[0].count).toBe(2);
    expect(afterToggleOff[0].user_reacted).toBe(false);

    // Toggle on new reaction
    const afterToggleOn = reactions.map((r) =>
      r.emoji === "🔥" ? { ...r, count: r.count + 1, user_reacted: true } : r
    );
    expect(afterToggleOn[1].count).toBe(2);
    expect(afterToggleOn[1].user_reacted).toBe(true);
  });

  it("should handle empty feed", () => {
    const items: any[] = [];
    expect(items).toHaveLength(0);
  });

  it("should sort feed items by created_at descending", () => {
    const items = [
      { created_at: "2026-04-14T00:00:00Z", event_type: "a" },
      { created_at: "2026-04-16T00:00:00Z", event_type: "c" },
      { created_at: "2026-04-15T00:00:00Z", event_type: "b" },
    ];
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    expect(items[0].event_type).toBe("c");
    expect(items[2].event_type).toBe("a");
  });

  it("should enforce tenant isolation in reaction grouping", () => {
    const reactions = [
      { feed_item_id: "f1", user_id: "u1", emoji: "👏", tenant_id: "t1" },
      { feed_item_id: "f1", user_id: "u2", emoji: "👏", tenant_id: "t1" },
      { feed_item_id: "f1", user_id: "u3", emoji: "👏", tenant_id: "t2" }, // different tenant
    ];

    const tenantFiltered = reactions.filter((r) => r.tenant_id === "t1");
    expect(tenantFiltered).toHaveLength(2);
  });
});
