// DSAR export — gathers all user data into a single JSON download.
// Right of Access under DPDP §11.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TABLES = [
  "profiles", "bookings", "orders", "member_hours", "hours_transactions",
  "points_transactions", "revenue_transactions", "invoices", "gifted_rewards",
  "email_preferences", "email_log", "notifications", "community_posts",
  "consent_log", "dsar_requests", "deletion_requests", "grievance_tickets",
  "coaching_sessions", "expenses", "advance_transactions", "coupon_redemptions",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const authed = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Rate limit: 1 per 24h
    const { data: recent } = await admin
      .from("dsar_requests")
      .select("requested_at")
      .eq("user_id", user.id)
      .gte("requested_at", new Date(Date.now() - 86_400_000).toISOString())
      .limit(1);
    if (recent && recent.length > 0) {
      return new Response(JSON.stringify({ error: "You can request a data export once every 24 hours." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: req_row } = await admin.from("dsar_requests").insert({ user_id: user.id }).select("id").single();

    const result: Record<string, unknown> = {
      _meta: {
        data_principal: user.email,
        user_id: user.id,
        exported_at: new Date().toISOString(),
        data_fiduciary: "Teetime Ventures Pvt Ltd",
        notes: "This file contains personal data held about you under the DPDP Act, 2023. Some financial records are retained for legal/tax compliance even after account deletion.",
      },
    };

    for (const t of TABLES) {
      try {
        const cols = t === "invoices" ? "customer_user_id" : "user_id";
        const { data } = await admin.from(t).select("*").eq(cols, user.id);
        result[t] = data ?? [];
      } catch (_) {
        result[t] = { error: "Could not read this table" };
      }
    }

    const body = JSON.stringify(result, null, 2);
    if (req_row?.id) {
      await admin.from("dsar_requests").update({
        completed_at: new Date().toISOString(),
        file_size_bytes: body.length,
      }).eq("id", req_row.id);
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="my-data-${user.id}.json"`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
