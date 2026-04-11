import { describe, it, expect } from "vitest";

describe("Smoke tests - Critical modules load without errors", () => {
  it("App module exports default component", async () => {
    // Just verify the module can be parsed — don't render (requires full provider tree)
    const mod = await import("@/App");
    expect(mod.default).toBeDefined();
  });

  it("AuthContext exports useAuth", async () => {
    const mod = await import("@/contexts/AuthContext");
    expect(mod.useAuth).toBeDefined();
    expect(mod.AuthProvider).toBeDefined();
  });

  it("Supabase client is exported", async () => {
    const mod = await import("@/integrations/supabase/client");
    expect(mod.supabase).toBeDefined();
  });

  it("Currency utilities are importable", async () => {
    const mod = await import("@/lib/currencies");
    expect(mod).toBeDefined();
  });

  it("GST utilities are importable", async () => {
    const mod = await import("@/lib/gst-utils");
    expect(mod.validateGSTIN).toBeDefined();
    expect(mod.calculateLineItems).toBeDefined();
  });

  it("Invoice templates are importable", async () => {
    const mod = await import("@/lib/invoice-templates");
    expect(mod).toBeDefined();
  });
});
