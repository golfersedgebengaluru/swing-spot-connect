import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGatewayUpdate, toSafeGateway } from "../../../supabase/functions/_shared/payment-gateway-management";

const functionSource = readFileSync(
  join(process.cwd(), "supabase/functions/manage-payment-gateway/index.ts"),
  "utf8",
);

describe("payment gateway management security", () => {
  const row = {
    id: "gateway-id",
    name: "razorpay",
    display_name: "Razorpay",
    api_key: "rzp_live_secret_key",
    api_secret: "super-secret",
    webhook_secret: "webhook-secret",
    is_active: true,
    is_test_mode: false,
    sort_order: 0,
    city: "Bengaluru",
    tenant_id: null,
  };

  it("returns status booleans without returning credential values", () => {
    const safe = toSafeGateway(row);
    expect(safe).toMatchObject({ has_api_key: true, has_api_secret: true, has_webhook_secret: true });
    expect(JSON.stringify(safe)).not.toContain(row.api_key);
    expect(JSON.stringify(safe)).not.toContain(row.api_secret);
    expect(JSON.stringify(safe)).not.toContain(row.webhook_secret);
  });

  it("retains credentials when replacements are blank", () => {
    expect(buildGatewayUpdate({ api_key: "", api_secret: "   ", webhook_secret: "" })).toEqual({});
  });

  it("changes test mode only when an explicit boolean is supplied", () => {
    expect(buildGatewayUpdate({ api_key: "replacement" })).not.toHaveProperty("is_test_mode");
    expect(buildGatewayUpdate({ is_test_mode: false })).toEqual({ is_test_mode: false });
  });

  it("supports explicit credential clearing without treating blanks as clears", () => {
    expect(buildGatewayUpdate({ clear_credentials: ["webhook_secret"] })).toEqual({ webhook_secret: null });
  });

  it("re-authorizes the stored gateway target before update or delete", () => {
    expect(functionSource).toContain("targetForGateway(existing)");
    expect(functionSource).toContain("canManageTarget(adminClient, user.id, target)");
    expect(functionSource.indexOf("canManageTarget(adminClient, user.id, target)")).toBeLessThan(
      functionSource.indexOf('if (parsed.data.action === "delete")'),
    );
  });

  it("does not log caught provider or database errors", () => {
    expect(functionSource).toContain("catch {");
    expect(functionSource).not.toMatch(/console\.error\([^\n]*err/i);
    expect(functionSource).not.toMatch(/console\.(log|error|warn)\([^\n]*(api_key|api_secret|webhook_secret|requestBody)/i);
  });

  it("requires authorization for all scopes and checks disabled QC memberships", () => {
    expect(functionSource).toContain('if (target.scope === "all") return false');
    expect(functionSource).toContain('.eq("disabled", false)');
    expect(functionSource).toContain('client.rpc("has_city_access"');
  });

  it("keeps browser screens away from direct gateway table access", () => {
    for (const file of [
      "src/components/admin/AdminPaymentsTab.tsx",
      "src/components/admin/CityPaymentsSection.tsx",
      "src/pages/QcAdmin.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toContain('.from("payment_gateways")');
      expect(source).not.toContain("select(\"*\")");
    }
  });
});