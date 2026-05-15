import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LeagueScreen from "@/pages/LeagueScreen";

const META = {
  league: { id: "lg1", name: "GE Nationals 2026", status: "active" },
  branding: {
    logo_url: "https://cdn.example.com/league.png",
    sponsor_name: "Acme",
    sponsor_logo_url: "https://cdn.example.com/sponsor.png",
    sponsor_url: "https://acme.test",
  },
  cities: [
    { id: "c1", league_id: "lg1", tenant_id: "t1", name: "Bengaluru", display_order: 1, created_at: "", updated_at: "" },
    { id: "c2", league_id: "lg1", tenant_id: "t1", name: "Vizag", display_order: 2, created_at: "", updated_at: "" },
  ],
};

const LEADERBOARD = {
  entries: [
    { rank: 1, type: "individual", id: "p1", name: "Alice", total_gross: 72, total_net: 70, final_score: 70, total_par: 72, net_vs_par: -2, final_vs_par: -2, rounds_played: 1, breakdown: [] },
  ],
  round: null,
  filter: "all",
  scope: "national",
  handicap_active: true,
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/screen-leaderboard")) {
      return new Response(JSON.stringify(LEADERBOARD), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/screen")) {
      return new Response(JSON.stringify(META), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/leagues/:id/screen" element={<LeagueScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LeagueScreen (public bay screen)", () => {
  it("renders league name, logos, city pills, and leaderboard", async () => {
    renderAt("/leagues/lg1/screen");
    await waitFor(() => expect(screen.getByText("GE Nationals 2026")).toBeInTheDocument());
    expect(screen.getByAltText("League logo")).toHaveAttribute("src", META.branding.logo_url);
    expect(screen.getByAltText("Acme")).toHaveAttribute("src", META.branding.sponsor_logo_url);
    expect(screen.getByText("All Locations")).toBeInTheDocument();
    expect(screen.getByText("Bengaluru")).toBeInTheDocument();
    expect(screen.getByText("Vizag")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
  });

  it("defaults to national scope (no city query param)", async () => {
    renderAt("/leagues/lg1/screen");
    await waitFor(() => {
      const lbCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/screen-leaderboard"));
      expect(lbCall).toBeTruthy();
      expect(String(lbCall![0])).not.toContain("league_city_id");
    });
  });

  it("clicking a city pill triggers a city-scoped fetch and updates URL", async () => {
    renderAt("/leagues/lg1/screen");
    await waitFor(() => screen.getByText("Bengaluru"));
    fireEvent.click(screen.getByText("Bengaluru"));
    await waitFor(() => {
      const cityCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("league_city_id=c1"));
      expect(cityCall).toBeTruthy();
    });
  });
});
