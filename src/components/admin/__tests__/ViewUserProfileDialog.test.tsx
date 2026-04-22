import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ViewUserProfileDialog } from "../ViewUserProfileDialog";

// Mock supabase to control role/city lookups
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => fromMock(...args),
  },
}));

function makeChain(rows: any[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

function renderDialog(user: any, onEdit = vi.fn(), onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ViewUserProfileDialog user={user} onEdit={onEdit} onClose={onClose} />
    </QueryClientProvider>
  );
}

describe("ViewUserProfileDialog", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("renders nothing when user is null", () => {
    const { container } = renderDialog(null);
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("shows identity, contact and balances for a profile-only member", async () => {
    // No auth account → no role/city queries fire, but defensive empty mocks anyway
    fromMock.mockImplementation(() => makeChain([]));

    renderDialog({
      id: "p1",
      user_id: null,
      display_name: "Sham Sunder",
      email: null,
      phone: null,
      preferred_city: "Bangalore",
      user_type: "member",
      points: 120,
      hours_purchased: 10,
      hours_used: 4,
      hours_remaining: 6,
      extended_hours_access: false,
      created_at: "2026-01-15T00:00:00Z",
    });

    expect(await screen.findByText("Sham Sunder")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByText("Profile-only")).toBeInTheDocument();
    expect(screen.getByText("Bangalore")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("6 hrs")).toBeInTheDocument();
    expect(screen.getByText("4 / 10")).toBeInTheDocument();
    // Permissions section explains profile-only
    expect(
      screen.getByText(/profile-only member/i)
    ).toBeInTheDocument();
  });

  it("shows admin role + assigned cities for a site-admin user", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "user_roles") {
        return makeChain([{ role: "site_admin" }]);
      }
      if (table === "site_admin_cities") {
        return makeChain([{ city: "Bangalore" }, { city: "Mumbai" }]);
      }
      return makeChain([]);
    });

    renderDialog({
      id: "p2",
      user_id: "auth-1",
      display_name: "Jane Admin",
      email: "jane@example.com",
      phone: "+91 99999",
      preferred_city: "Bangalore",
      user_type: "registered",
      points: 0,
      hours_purchased: 0,
      hours_used: 0,
      hours_remaining: 0,
      extended_hours_access: true,
      created_at: "2026-01-01T00:00:00Z",
    });

    expect(await screen.findByText("Jane Admin")).toBeInTheDocument();
    // Extended hours badge in identity area + flag row
    expect(screen.getAllByText(/extended hours/i).length).toBeGreaterThanOrEqual(1);
    // Role badge
    await waitFor(() => expect(screen.getByText("Site-Admin")).toBeInTheDocument());
    // Assigned instances
    expect(screen.getByText("Assigned instances:")).toBeInTheDocument();
    // "Bangalore" appears in both contact (preferred city) and assigned instances
    expect(screen.getAllByText("Bangalore").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Mumbai")).toBeInTheDocument();
  });

  it("shows 'standard user' note for an authenticated user with no roles", async () => {
    fromMock.mockImplementation(() => makeChain([]));

    renderDialog({
      id: "p3",
      user_id: "auth-3",
      display_name: "Regular User",
      email: "u@example.com",
      user_type: "registered",
      points: 0,
      hours_purchased: 0,
      hours_used: 0,
      hours_remaining: 0,
      extended_hours_access: false,
    });

    expect(await screen.findByText("Regular User")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/standard user — no elevated permissions/i)).toBeInTheDocument()
    );
  });

  it("calls onEdit when the Edit button is clicked", async () => {
    fromMock.mockImplementation(() => makeChain([]));
    const onEdit = vi.fn();
    renderDialog({ id: "p4", user_id: null, display_name: "X" }, onEdit);
    const btn = await screen.findByRole("button", { name: /edit/i });
    btn.click();
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
