import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("Training navigation and privacy contract", () => {
  it("makes Training primary while retaining both Coaching compatibility routes", () => {
    const app = read("src/App.tsx");
    const navbar = read("src/components/layout/Navbar.tsx");
    expect(navbar).toContain('{ href: "/training", label: "Training"');
    expect(navbar).not.toContain('{ href: "/coaching", label: "Coaching"');
    expect(app).toContain('path="/training"');
    expect(app).toContain('path="/training/:sessionId"');
    expect(app).toContain('path="/coaching"');
    expect(app).toContain('path="/coaching/:sessionId"');
  });

  it("presents separate member histories and does not infer ownership from matching identities", () => {
    const page = read("src/pages/Coaching.tsx");
    const hooks = read("src/hooks/useCoaching.ts");
    expect(page).toContain("My Training");
    expect(page).toContain("Coach Sessions");
    expect(page).toContain("Start Training");
    expect(hooks).toContain('.eq("session_type", "self_directed")');
    expect(hooks).toContain('.eq("session_type", "coach_directed")');
  });

  it("keeps self-directed completion outside notifications and booking cancellation", () => {
    const hooks = read("src/hooks/useCoaching.ts");
    const completeBlock = hooks.slice(hooks.indexOf("export function useCompleteSelfDirectedTraining"), hooks.indexOf("export function useDeleteSelfDirectedSession"));
    const deleteBlock = hooks.slice(hooks.indexOf("export function useDeleteSelfDirectedSession"), hooks.indexOf("export function useUpdateSelfDirectedSession"));
    expect(completeBlock).toContain('supabase.rpc("complete_self_directed_training"');
    expect(completeBlock).not.toContain("sendNotificationEmail");
    expect(completeBlock).not.toContain("calendar-sync");
    expect(deleteBlock).not.toContain("calendar-sync");
  });
});