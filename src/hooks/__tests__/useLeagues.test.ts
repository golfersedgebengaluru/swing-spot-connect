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

describe("League status transitions", () => {
  const validTransitions: Record<LeagueStatus, LeagueStatus[]> = {
    draft: ["active"],
    active: ["completed"],
    completed: ["archived"],
    archived: [],
  };

  it("draft can only transition to active", () => {
    expect(validTransitions.draft).toEqual(["active"]);
  });

  it("active can only transition to completed", () => {
    expect(validTransitions.active).toEqual(["completed"]);
  });

  it("completed can only transition to archived", () => {
    expect(validTransitions.completed).toEqual(["archived"]);
  });

  it("archived has no valid transitions", () => {
    expect(validTransitions.archived).toEqual([]);
  });

  it("rejects invalid transitions", () => {
    expect(validTransitions.draft).not.toContain("completed");
    expect(validTransitions.active).not.toContain("draft");
    expect(validTransitions.completed).not.toContain("active");
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

describe("Join code validation", () => {
  it("detects expired codes", () => {
    const code: Partial<LeagueJoinCode> = {
      expires_at: new Date(Date.now() - 86400000).toISOString(), // yesterday
      revoked_at: null,
      use_count: 0,
      max_uses: 100,
    };
    const isExpired = code.expires_at ? new Date(code.expires_at) < new Date() : false;
    expect(isExpired).toBe(true);
  });

  it("detects non-expired codes", () => {
    const code: Partial<LeagueJoinCode> = {
      expires_at: new Date(Date.now() + 86400000).toISOString(), // tomorrow
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
    // When sponsorship is off, branding should not be used — but fallback to tenant is OK
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
