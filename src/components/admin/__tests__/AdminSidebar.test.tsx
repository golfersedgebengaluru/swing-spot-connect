import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "golfersedgebengaluru@example.com", app_metadata: {} },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAdmin", () => ({
  useAdmin: () => ({ role: "site_admin", isAdmin: false, isSiteAdmin: true, loading: false }),
}));

vi.mock("@/hooks/useSiteAdminPermissions", () => ({
  useSiteAdminPermissions: () => ({
    data: {
      can_manage_users: true,
      can_manage_members: true,
      can_manage_corporate_accounts: true,
    },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useBranding", () => ({
  useBranding: () => ({ data: { studio_name: "EdgeCollective" } }),
}));

import { AdminSidebar } from "../AdminSidebar";

function renderSidebar() {
  return render(
    <MemoryRouter>
      <AdminSidebar
        activeTab="dashboard"
        onTabChange={vi.fn()}
        open={false}
        onClose={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe("AdminSidebar – width constraint", () => {
  it("shows All Users and Corporate Accounts without a separate Members entry", () => {
    renderSidebar();
    expect(screen.getByText("All Users")).toBeInTheDocument();
    expect(screen.getByText("Corporate Accounts")).toBeInTheDocument();
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
  });

  it("desktop aside has max-w and overflow-hidden to prevent width blow-out", () => {
    const { container } = renderSidebar();
    const aside = container.querySelector("aside");
    expect(aside).toBeTruthy();
    const classes = aside!.className;
    expect(classes).toContain("max-w-[220px]");
    expect(classes).toContain("overflow-hidden");
  });

  it("username text has truncate class for long names", () => {
    renderSidebar();
    const username = screen.getByText("golfersedgebengaluru");
    expect(username.className).toContain("truncate");
  });

  it("sidebar content container has overflow-hidden", () => {
    const { container } = renderSidebar();
    const aside = container.querySelector("aside");
    const innerDiv = aside?.querySelector("div");
    expect(innerDiv?.className).toContain("overflow-hidden");
  });
});
