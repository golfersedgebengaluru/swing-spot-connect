import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("members consolidation", () => {
  const app = read("App.tsx");
  const admin = read("pages/Admin.tsx");
  const sidebar = read("components/admin/AdminSidebar.tsx");
  const users = read("components/admin/AdminAllUsersTab.tsx");
  const hoursManager = read("components/admin/MemberHoursManager.tsx");

  it("keeps one users destination and redirects legacy member URLs", () => {
    expect(sidebar).toContain('{ id: "allusers", label: "All Users"');
    expect(sidebar).toContain('{ id: "corporate", label: "Corporate Accounts"');
    expect(sidebar).not.toMatch(/id: "members"/);
    expect(app).toContain('<Navigate to="/admin?tab=allusers&filter=member" replace />');
    expect(admin).toContain('if (urlTab === "members")');
    expect(admin).toContain('next.set("filter", "member")');
  });

  it("keeps filtering URL-backed and uses member_hours existence", () => {
    expect(users).toContain('searchParams.get("filter")');
    expect(users).toContain('matchesMemberFilter(typeFilter, u.user_id, u.member_hours_id)');
    expect(users).toContain('hoursMap.get(p.id)');
    expect(users).toContain('<SelectItem value="member">Member</SelectItem>');
  });

  it("prepends Member360 while preserving existing actions", () => {
    const member360 = users.indexOf("Member360");
    const viewProfile = users.indexOf("View Profile");
    expect(member360).toBeGreaterThan(-1);
    expect(member360).toBeLessThan(viewProfile);
    for (const action of ["Edit Profile", "Allocate Points", "Points History", "Booking History", "Finance", "Manage Access", "Extended Hours", "Delete User"]) {
      expect(users).toContain(action);
    }
    expect(users).toContain('<HoursActionLabel mode="adjust" />');
    expect(users).toContain('<HoursActionLabel mode="history" />');
    expect(hoursManager).toContain("Adjust Hours");
    expect(hoursManager).toContain("Hours History");
  });
});

describe("Member360 contract", () => {
  const page = read("pages/Member360.tsx");

  it("uses dual-key identity, independent queries, and existing access scope", () => {
    expect(page).toContain("identityKeys(profile)");
    for (const section of ["membership", "bookings", "training", "leagues", "loyalty", "commerce"]) {
      expect(page).toContain(`["member360", "${section}", keys]`);
    }
    expect(page).toContain('assignedCities.includes(profile.preferred_city)');
    expect(page).toContain('in("city", assignedCities)');
  });

  it("contains only supported signals and omits unsupported sections", () => {
    expect(page).toContain('values.push("Low hours")');
    expect(page).toContain('values.push("No upcoming booking")');
    expect(page).not.toContain("Renewal due");
    expect(page).not.toContain("Points expiring soon");
    expect(page).not.toMatch(/>Golf</);
    expect(page).not.toMatch(/>Handicap</);
    expect(page).not.toMatch(/>Simulator</);
  });

  it("uses a continuous mobile-first layout without nested section scrolling", () => {
    expect(page).not.toContain("<Tabs");
    expect(page).toContain('className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"');
    expect(page).not.toMatch(/overflow-[xy]-auto/);
  });
});