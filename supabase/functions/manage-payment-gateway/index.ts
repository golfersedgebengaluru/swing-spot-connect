import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  adminsOnlyMessage,
  buildGatewayUpdate,
  CHECKOUT_GATEWAY_LOCKED,
  checkoutSwitchMessage,
  toSafeGateway,
  type GatewayRecord,
} from "../_shared/payment-gateway-management.ts";

const credential = z.string().max(4096).optional();
const scopeSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("all") }),
  z.object({ scope: z.literal("city"), scope_id: z.string().trim().min(1).max(100) }),
  z.object({ scope: z.literal("tenant"), scope_id: z.string().uuid() }),
]);

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), target: scopeSchema }),
  z.object({
    action: z.literal("create"),
    target: scopeSchema,
    gateway: z.object({
      name: z.enum(["razorpay", "cashfree", "stripe", "paypal"]),
      display_name: z.string().trim().min(1).max(100),
      is_active: z.boolean().optional(),
      is_test_mode: z.boolean().optional(),
      sort_order: z.number().int().min(0).max(1000).optional(),
      api_key: credential,
      api_secret: credential,
      webhook_secret: credential,
    }),
  }),
  z.object({
    action: z.literal("update"),
    gateway_id: z.string().uuid(),
    updates: z.object({
      display_name: z.string().trim().min(1).max(100).optional(),
      is_active: z.boolean().optional(),
      is_test_mode: z.boolean().optional(),
      sort_order: z.number().int().min(0).max(1000).optional(),
      api_key: credential,
      api_secret: credential,
      webhook_secret: credential,
      clear_credentials: z.array(z.enum(["api_key", "api_secret", "webhook_secret"])).max(3).optional(),
    }),
  }),
  z.object({ action: z.literal("delete"), gateway_id: z.string().uuid() }),
  // Make this city gateway the one that takes new online checkouts.
  z.object({ action: z.literal("use_for_checkout"), gateway_id: z.string().uuid() }),
  // Let this city's admins pay through this gateway while customers keep the city's checkout gateway.
  z.object({ action: z.literal("admins_only_checkout"), gateway_id: z.string().uuid(), enabled: z.boolean() }),
]);

type AdminClient = ReturnType<typeof createClient>;
type Target = z.infer<typeof scopeSchema>;

function response(payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function isPlatformAdmin(client: AdminClient, userId: string) {
  const { data, error } = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("authorization_check_failed");
  return data === true;
}

async function canManageTarget(client: AdminClient, userId: string, target: Target) {
  if (await isPlatformAdmin(client, userId)) return true;
  if (target.scope === "all") return false;

  if (target.scope === "city") {
    const [{ data: siteAdmin, error: roleError }, { data: cityAccess, error: cityError }] = await Promise.all([
      client.rpc("has_role", { _user_id: userId, _role: "site_admin" }),
      client.rpc("has_city_access", { _user_id: userId, _city: target.scope_id }),
    ]);
    if (roleError || cityError) throw new Error("authorization_check_failed");
    return siteAdmin === true && cityAccess === true;
  }

  const { data, error } = await client
    .from("qc_only_admins")
    .select("user_id")
    .eq("user_id", userId)
    .eq("tenant_id", target.scope_id)
    .eq("disabled", false)
    .maybeSingle();
  if (error) throw new Error("authorization_check_failed");
  return Boolean(data);
}

function targetForGateway(gateway: Pick<GatewayRecord, "city" | "tenant_id">): Target | null {
  if (gateway.tenant_id) return { scope: "tenant", scope_id: gateway.tenant_id };
  if (gateway.city) return { scope: "city", scope_id: gateway.city };
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let action = "unknown";
  let userId: string | null = null;
  try {
    if (req.method !== "POST") return response({ error: "Invalid request" });
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > 20_000) return response({ error: "Invalid request" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!supabaseUrl || !serviceKey || !anonKey || !authHeader) return response({ error: "Not authenticated" });

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return response({ error: "Not authenticated" });
    userId = user.id;

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return response({ error: "Invalid request" });
    action = parsed.data.action;
    const adminClient = createClient(supabaseUrl, serviceKey);

    if (parsed.data.action === "list") {
      if (!(await canManageTarget(adminClient, user.id, parsed.data.target))) return response({ error: "Access denied" });
      let query = adminClient
        .from("payment_gateways")
        .select("id, name, display_name, api_key, api_secret, webhook_secret, is_active, is_test_mode, use_for_checkout, admins_only_checkout, sort_order, city, tenant_id")
        .order("sort_order");
      if (parsed.data.target.scope === "city") query = query.eq("city", parsed.data.target.scope_id).is("tenant_id", null);
      if (parsed.data.target.scope === "tenant") query = query.eq("tenant_id", parsed.data.target.scope_id);
      const { data, error } = await query;
      if (error) throw new Error("gateway_list_failed");
      return response({ gateways: ((data ?? []) as GatewayRecord[]).map(toSafeGateway) });
    }

    if (parsed.data.action === "create") {
      if (parsed.data.target.scope === "all" || !(await canManageTarget(adminClient, user.id, parsed.data.target))) {
        return response({ error: "Access denied" });
      }
      const gateway = parsed.data.gateway;
      const row = {
        name: gateway.name,
        display_name: gateway.display_name,
        city: parsed.data.target.scope === "city" ? parsed.data.target.scope_id : null,
        tenant_id: parsed.data.target.scope === "tenant" ? parsed.data.target.scope_id : null,
        is_active: gateway.is_active ?? false,
        is_test_mode: gateway.is_test_mode ?? true,
        sort_order: gateway.sort_order ?? 0,
        config: {},
        ...buildGatewayUpdate(gateway),
      };
      const { data, error } = await adminClient.from("payment_gateways").insert(row).select("id").single();
      if (error) throw new Error("gateway_create_failed");
      return response({ success: true, gateway_id: data.id });
    }

    const { data: existing, error: existingError } = await adminClient
      .from("payment_gateways")
      .select("id, city, tenant_id, use_for_checkout")
      .eq("id", parsed.data.gateway_id)
      .maybeSingle();
    if (existingError) throw new Error("gateway_lookup_failed");
    if (!existing) return response({ error: "Gateway not found" });
    const target = targetForGateway(existing);
    if (!target || !(await canManageTarget(adminClient, user.id, target))) return response({ error: "Access denied" });

    if (parsed.data.action === "use_for_checkout") {
      const { error } = await adminClient.rpc("set_checkout_gateway", { _gateway_id: parsed.data.gateway_id });
      if (error) {
        const message = checkoutSwitchMessage(error);
        if (message) return response({ error: message });
        throw new Error("gateway_switch_failed");
      }
      return response({ success: true });
    }

    if (parsed.data.action === "admins_only_checkout") {
      if (!existing.city || existing.tenant_id) return response({ error: "Only a city payment account can take online payments" });
      const { data: updated, error } = await adminClient
        .from("payment_gateways")
        .update({ admins_only_checkout: parsed.data.enabled, updated_at: new Date().toISOString() })
        .eq("id", parsed.data.gateway_id)
        .select("id");
      const message = adminsOnlyMessage(error);
      if (message) return response({ error: message });
      if (error || !updated?.length) throw new Error("gateway_admins_only_failed");
      return response({ success: true });
    }

    if (parsed.data.action === "delete") {
      if (existing.use_for_checkout) return response({ error: CHECKOUT_GATEWAY_LOCKED });
      const { error } = await adminClient.from("payment_gateways").delete().eq("id", parsed.data.gateway_id);
      if (error) throw new Error("gateway_delete_failed");
      return response({ success: true });
    }

    const updates = buildGatewayUpdate(parsed.data.updates);
    if (Object.keys(updates).length === 0) return response({ success: true });
    const { error } = await adminClient
      .from("payment_gateways")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.gateway_id);
    // payment_gateways_checkout_ready: the checkout gateway must stay on with both keys.
    if (error?.code === "23514") return response({ error: CHECKOUT_GATEWAY_LOCKED });
    if (error) throw new Error("gateway_update_failed");
    return response({ success: true });
  } catch {
    // Never log request bodies, provider errors, database errors, or credential values.
    console.error("Payment gateway operation failed", { action, user_id: userId });
    return response({ error: "Payment gateway operation failed" });
  }
});