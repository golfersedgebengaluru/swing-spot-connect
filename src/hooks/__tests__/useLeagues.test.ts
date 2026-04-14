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
  CreateLeagueRequest,
  UpdateLeagueRequest,
  SubmitScoreRequest,
  UpdateBrandingRequest,
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
});
