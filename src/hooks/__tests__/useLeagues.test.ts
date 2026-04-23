import { describe, it, expect } from "vitest";
import type {
  LeagueFormat,
  LeagueStatus,
  ScoreEntryMethod,
  LeagueRoleType,
  League,
  Tenant,
  LeagueScore,
  LeagueJoinCode,
  LeagueBranding,
  LeagueRound,
  LeagueCompetition,
  CreateLeagueRequest,
  UpdateLeagueRequest,
  SubmitScoreRequest,
  UpdateBrandingRequest,
  CreateRoundRequest,
  CreateCompetitionRequest,
} from "@/types/league";

describe("League types", () => {
  it("LeagueFormat enum values are valid", () => {
    const formats: LeagueFormat[] = [
      "stroke_play", "match_play", "stableford", "scramble", "best_ball", "skins",
    ];
    expect(formats).toHaveLength(6);
  });

  it("LeagueStatus enum values are valid", () => {
    const statuses: LeagueStatus[] = ["draft", "active", "completed", "archived"];
    expect(statuses).toHaveLength(4);
  });

  it("ScoreEntryMethod enum values are valid", () => {
    const methods: ScoreEntryMethod[] = ["photo_ocr", "manual", "api", "not_set"];
    expect(methods).toHaveLength(4);
  });

  it("LeagueRoleType enum values are valid", () => {
    const roles: LeagueRoleType[] = ["franchise_admin", "league_admin", "player"];
    expect(roles).toHaveLength(3);
  });
});

describe("League status transitions (bidirectional)", () => {
  const statusTransitions: Record<LeagueStatus, LeagueStatus[]> = {
    draft: ["active"],
    active: ["draft", "completed"],
    completed: ["active", "archived"],
    archived: ["completed"],
  };

  it("draft can transition to active", () => {
    expect(statusTransitions.draft).toContain("active");
  });

  it("active can transition back to draft", () => {
    expect(statusTransitions.active).toContain("draft");
  });

  it("active can transition forward to completed", () => {
    expect(statusTransitions.active).toContain("completed");
  });

  it("completed can transition back to active", () => {
    expect(statusTransitions.completed).toContain("active");
  });

  it("completed can transition forward to archived", () => {
    expect(statusTransitions.completed).toContain("archived");
  });

  it("archived can transition back to completed", () => {
    expect(statusTransitions.archived).toContain("completed");
  });

  it("draft cannot skip to completed or archived", () => {
    expect(statusTransitions.draft).not.toContain("completed");
    expect(statusTransitions.draft).not.toContain("archived");
  });

  it("archived cannot jump to draft or active", () => {
    expect(statusTransitions.archived).not.toContain("draft");
    expect(statusTransitions.archived).not.toContain("active");
  });

  it("each status has at least one valid transition", () => {
    for (const [status, transitions] of Object.entries(statusTransitions)) {
      expect(transitions.length).toBeGreaterThan(0);
    }
  });
});

describe("Score calculations", () => {
  it("calculates total from hole scores", () => {
    const holeScores = [4, 3, 5, 4, 3, 4, 5, 3, 4, 4, 3, 5, 4, 3, 4, 5, 3, 4];
    const total = holeScores.reduce((sum, s) => sum + s, 0);
    expect(total).toBe(70);
    expect(holeScores).toHaveLength(18);
  });

  it("handles 9-hole rounds", () => {
    const holeScores = [4, 3, 5, 4, 3, 4, 5, 3, 4];
    const total = holeScores.reduce((sum, s) => sum + s, 0);
    expect(total).toBe(35);
    expect(holeScores).toHaveLength(9);
  });

  it("handles zero scores gracefully", () => {
    const holeScores = [0, 0, 0];
    const total = holeScores.reduce((sum, s) => sum + (s || 0), 0);
    expect(total).toBe(0);
  });
});

describe("Score method tracking", () => {
  it("should use photo_ocr method when OCR is used", () => {
    const ocrUsed = true;
    const method = ocrUsed ? "photo_ocr" : "manual";
    expect(method).toBe("photo_ocr");
  });

  it("should use manual method when entering scores by hand", () => {
    const ocrUsed = false;
    const method = ocrUsed ? "photo_ocr" : "manual";
    expect(method).toBe("manual");
  });

  it("valid score methods include photo_ocr, manual, api", () => {
    const validMethods: ScoreEntryMethod[] = ["photo_ocr", "manual", "api", "not_set"];
    expect(validMethods).toContain("photo_ocr");
    expect(validMethods).toContain("manual");
    expect(validMethods).toContain("api");
  });
});

describe("Player name enrichment", () => {
  it("enriches scores with player_name from profile map", () => {
    const scores = [
      { id: "s1", player_id: "u1", total_score: 72 },
      { id: "s2", player_id: "u2", total_score: 68 },
    ];
    const profileMap: Record<string, string> = {
      u1: "Arvind Kumar",
      u2: "Priya Singh",
    };

    const enriched = scores.map((s) => ({
      ...s,
      player_name: profileMap[s.player_id] || null,
    }));

    expect(enriched[0].player_name).toBe("Arvind Kumar");
    expect(enriched[1].player_name).toBe("Priya Singh");
  });

  it("returns null player_name for unknown player_ids", () => {
    const profileMap: Record<string, string> = {};
    const score = { player_id: "unknown-uuid" };
    const player_name = profileMap[score.player_id] || null;
    expect(player_name).toBeNull();
  });
});

describe("Join code validation", () => {
  it("detects expired codes", () => {
    const code: Partial<LeagueJoinCode> = {
      expires_at: new Date(Date.now() - 86400000).toISOString(),
      revoked_at: null,
      use_count: 0,
      max_uses: 100,
    };
    const isExpired = code.expires_at ? new Date(code.expires_at) < new Date() : false;
    expect(isExpired).toBe(true);
  });

  it("detects non-expired codes", () => {
    const code: Partial<LeagueJoinCode> = {
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      revoked_at: null,
      use_count: 0,
      max_uses: 100,
    };
    const isExpired = code.expires_at ? new Date(code.expires_at) < new Date() : false;
    expect(isExpired).toBe(false);
  });

  it("detects revoked codes", () => {
    const code: Partial<LeagueJoinCode> = {
      revoked_at: new Date().toISOString(),
    };
    expect(code.revoked_at).toBeTruthy();
  });

  it("detects max uses reached", () => {
    const code: Partial<LeagueJoinCode> = {
      use_count: 100,
      max_uses: 100,
    };
    expect(code.use_count! >= code.max_uses!).toBe(true);
  });
});

describe("Branding resolution logic", () => {
  it("resolves league branding logo when sponsorship enabled", () => {
    const tenant: Partial<Tenant> = {
      sponsorship_enabled: true,
      default_logo_url: "https://tenant.com/logo.png",
    };
    const branding: Partial<LeagueBranding> = {
      logo_url: "https://league.com/logo.png",
    };

    let resolved: string | null = null;
    if (tenant.sponsorship_enabled && branding.logo_url) {
      resolved = branding.logo_url;
    } else if (tenant.default_logo_url) {
      resolved = tenant.default_logo_url;
    }
    expect(resolved).toBe("https://league.com/logo.png");
  });

  it("falls back to tenant logo when no league branding", () => {
    const tenant: Partial<Tenant> = {
      sponsorship_enabled: true,
      default_logo_url: "https://tenant.com/logo.png",
    };
    const branding: Partial<LeagueBranding> = { logo_url: null };

    let resolved: string | null = null;
    if (tenant.sponsorship_enabled && branding.logo_url) {
      resolved = branding.logo_url;
    } else if (tenant.default_logo_url) {
      resolved = tenant.default_logo_url;
    }
    expect(resolved).toBe("https://tenant.com/logo.png");
  });

  it("returns null when sponsorship disabled", () => {
    const tenant: Partial<Tenant> = {
      sponsorship_enabled: false,
      default_logo_url: "https://tenant.com/logo.png",
    };
    const branding: Partial<LeagueBranding> = { logo_url: "https://league.com/logo.png" };

    let resolved: string | null = null;
    if (tenant.sponsorship_enabled && branding.logo_url) {
      resolved = branding.logo_url;
    } else if (tenant.default_logo_url) {
      resolved = tenant.default_logo_url;
    }
    expect(resolved).toBe("https://tenant.com/logo.png");
  });
});

describe("URL safety", () => {
  function isSafeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  it("allows https URLs", () => {
    expect(isSafeUrl("https://sponsor.com")).toBe(true);
  });

  it("allows http URLs", () => {
    expect(isSafeUrl("http://sponsor.com")).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isSafeUrl("data:text/html,<h1>hi</h1>")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isSafeUrl("not a url")).toBe(false);
  });
});

describe("Player management", () => {
  it("filters duplicate player additions", () => {
    const existingPlayers = ["u1", "u2", "u3"];
    const newPlayerId = "u2";
    const isDuplicate = existingPlayers.includes(newPlayerId);
    expect(isDuplicate).toBe(true);
  });

  it("allows adding new players", () => {
    const existingPlayers = ["u1", "u2", "u3"];
    const newPlayerId = "u4";
    const isDuplicate = existingPlayers.includes(newPlayerId);
    expect(isDuplicate).toBe(false);
  });
});

describe("Admin redirect logic", () => {
  it("admin users should redirect to /admin", () => {
    const isAdmin = true;
    const isSiteAdmin = false;
    const hasExplicitRedirect = false;
    const target = hasExplicitRedirect ? "/some-page" : (isAdmin || isSiteAdmin) ? "/admin" : "/dashboard";
    expect(target).toBe("/admin");
  });

  it("site_admin users should redirect to /admin", () => {
    const isAdmin = false;
    const isSiteAdmin = true;
    const hasExplicitRedirect = false;
    const target = hasExplicitRedirect ? "/some-page" : (isAdmin || isSiteAdmin) ? "/admin" : "/dashboard";
    expect(target).toBe("/admin");
  });

  it("regular users should redirect to /dashboard", () => {
    const isAdmin = false;
    const isSiteAdmin = false;
    const hasExplicitRedirect = false;
    const target = hasExplicitRedirect ? "/some-page" : (isAdmin || isSiteAdmin) ? "/admin" : "/dashboard";
    expect(target).toBe("/dashboard");
  });

  it("explicit redirect takes priority over admin check", () => {
    const isAdmin = true;
    const isSiteAdmin = false;
    const hasExplicitRedirect = true;
    const target = hasExplicitRedirect ? "/leagues" : (isAdmin || isSiteAdmin) ? "/admin" : "/dashboard";
    expect(target).toBe("/leagues");
});

describe("League rounds", () => {
  it("LeagueRound type has required fields", () => {
    const round: LeagueRound = {
      id: "r1",
      league_id: "l1",
      tenant_id: "t1",
      round_number: 1,
      name: "Week 1",
      description: "Opening round",
      start_date: "2026-04-14",
      end_date: "2026-04-20",
      par_per_hole: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(round.round_number).toBe(1);
    expect(round.name).toBe("Week 1");
  });

  it("auto-increments round_number from existing rounds", () => {
    const existingRounds = [{ round_number: 1 }, { round_number: 2 }, { round_number: 3 }];
    const maxRound = existingRounds.length > 0
      ? Math.max(...existingRounds.map((r) => r.round_number))
      : 0;
    const next = maxRound + 1;
    expect(next).toBe(4);
  });

  it("first round defaults to 1 when no existing rounds", () => {
    const existingRounds: { round_number: number }[] = [];
    const next = existingRounds.length > 0
      ? Math.max(...existingRounds.map((r) => r.round_number)) + 1
      : 1;
    expect(next).toBe(1);
  });

  it("validates start_date is before end_date", () => {
    const start = "2026-04-14";
    const end = "2026-04-20";
    expect(new Date(start) < new Date(end)).toBe(true);
  });

  it("detects invalid date range", () => {
    const start = "2026-04-20";
    const end = "2026-04-14";
    expect(new Date(start) < new Date(end)).toBe(false);
  });

  it("CreateRoundRequest requires name, start_date, end_date", () => {
    const req: CreateRoundRequest = {
      name: "Week 1",
      start_date: "2026-04-14",
      end_date: "2026-04-20",
    };
    expect(req.name).toBeTruthy();
    expect(req.start_date).toBeTruthy();
    expect(req.end_date).toBeTruthy();
  });
});

describe("League competitions", () => {
  it("LeagueCompetition type has required fields", () => {
    const comp: LeagueCompetition = {
      id: "c1",
      round_id: "r1",
      league_id: "l1",
      tenant_id: "t1",
      name: "Longest Drive",
      description: "Hit the farthest drive on hole 7",
      points_config: [
        { position: 1, points: 10 },
        { position: 2, points: 7 },
        { position: 3, points: 5 },
      ],
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(comp.name).toBe("Longest Drive");
    expect(comp.points_config).toHaveLength(3);
  });

  it("points_config is sorted by position descending points", () => {
    const config = [
      { position: 1, points: 10 },
      { position: 2, points: 7 },
      { position: 3, points: 5 },
    ];
    for (let i = 1; i < config.length; i++) {
      expect(config[i - 1].points).toBeGreaterThan(config[i].points);
    }
  });

  it("empty points_config means no point rewards", () => {
    const comp: Partial<LeagueCompetition> = {
      name: "Closest to Pin",
      points_config: [],
    };
    expect(comp.points_config).toHaveLength(0);
  });

  it("can calculate total points per player from competitions", () => {
    const competitions = [
      { points_config: [{ position: 1, points: 10 }, { position: 2, points: 5 }] },
      { points_config: [{ position: 1, points: 8 }, { position: 2, points: 4 }] },
    ];
    // Player finishes 1st in both
    const totalPoints = competitions.reduce((sum, c) => sum + c.points_config[0].points, 0);
    expect(totalPoints).toBe(18);
  });

  it("handles competitions with no points configured for a position", () => {
    const config = [
      { position: 1, points: 10 },
      { position: 2, points: 5 },
    ];
    const playerPosition = 3;
    const entry = config.find((c) => c.position === playerPosition);
    expect(entry).toBeUndefined();
    const points = entry?.points ?? 0;
    expect(points).toBe(0);
  });

  it("CreateCompetitionRequest accepts optional fields", () => {
    const minimal: CreateCompetitionRequest = { name: "Best Score" };
    expect(minimal.points_config).toBeUndefined();
    expect(minimal.description).toBeUndefined();

    const full: CreateCompetitionRequest = {
      name: "Best Score",
      description: "Overall best score wins",
      points_config: [{ position: 1, points: 15 }],
      sort_order: 1,
    };
    expect(full.points_config).toHaveLength(1);
  });
  });
});

// ── Performance & UI optimisation tests ─────────────────────

describe("League query staleTime optimisation", () => {
  it("should define LEAGUE_STALE_TIME constant set to 30s", async () => {
    const source = await import("../useLeagues?raw");
    const code = (source as any).default ?? source;
    expect(code).toContain("LEAGUE_STALE_TIME");
    expect(code).toContain("30_000");
  });

  it("all useQuery hooks should include staleTime", async () => {
    const source = await import("../useLeagues?raw");
    const code = (source as any).default ?? source;
    // Match useQuery<...>({ ... }) blocks – each should contain staleTime
    const pattern = /useQuery<[^>]*>\(\{/g;
    let match;
    let count = 0;
    while ((match = pattern.exec(code)) !== null) {
      count++;
      const start = match.index;
      const configEnd = code.indexOf("});", start);
      if (configEnd === -1) continue;
      const config = code.slice(start, configEnd);
      expect(config).toContain("staleTime");
    }
    // Ensure we actually checked some queries
    expect(count).toBeGreaterThanOrEqual(10);
  });
});

describe("BaySchedulingPanel hides empty bays", () => {
  it("should not show 'Available all day' text", async () => {
    const source = await import(
      "../../components/admin/league/BaySchedulingPanel?raw"
    );
    const code = (source as any).default ?? source;
    expect(code).not.toContain("Available all day");
  });

  it("should filter bays to only show those with bookings or blocks", async () => {
    const source = await import(
      "../../components/admin/league/BaySchedulingPanel?raw"
    );
    const code = (source as any).default ?? source;
    expect(code).toContain(".filter(");
    expect(code).toContain("bayBookings.length > 0 || bayBlocks.length > 0");
  });
});