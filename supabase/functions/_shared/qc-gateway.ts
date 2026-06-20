// Gateway resolution for Quick Competitions.
// Tenant-scoped row wins (BYO gateway for QC SaaS customers), then city-scoped (legacy).
// Provider-agnostic: returns the full row; callers dispatch on `name`.
// Today implemented: razorpay. Stripe/PayPal/Square slot in as new branches.

export interface GatewayRow {
  api_key: string | null;
  api_secret: string | null;
  city_slug: string | null;
  name: string;
  tenant_id: string | null;
  city: string | null;
}

export async function resolveQcGateway(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  comp: { tenant_id: string | null },
): Promise<{ gateway: GatewayRow | null; city: string | null; scope: "tenant" | "city" | "none" }> {
  // 1) tenant-scoped
  if (comp.tenant_id) {
    const { data: g } = await supabase
      .from("payment_gateways")
      .select("api_key, api_secret, city_slug, name, tenant_id, city")
      .eq("tenant_id", comp.tenant_id).eq("is_active", true)
      .maybeSingle();
    if (g) return { gateway: g as GatewayRow, city: null, scope: "tenant" };
  }
  // 2) city-scoped (legacy)
  if (comp.tenant_id) {
    const { data: t } = await supabase
      .from("tenants").select("city").eq("id", comp.tenant_id).maybeSingle();
    const city = t?.city as string | undefined;
    if (city) {
      const { data: g } = await supabase
        .from("payment_gateways")
        .select("api_key, api_secret, city_slug, name, tenant_id, city")
        .eq("city", city).eq("name", "razorpay").eq("is_active", true)
        .maybeSingle();
      if (g) return { gateway: g as GatewayRow, city, scope: "city" };
      return { gateway: null, city, scope: "none" };
    }
  }
  return { gateway: null, city: null, scope: "none" };
}
