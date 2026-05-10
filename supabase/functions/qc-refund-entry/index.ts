import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const Schema = z.object({ entry_id: z.string().uuid() });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return ok({ success: false, error: "Not authenticated" });

    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return ok({ success: false, error: "Invalid request" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: entry } = await supabase
      .from("qc_entries").select("*").eq("id", parsed.data.entry_id).maybeSingle();
    if (!entry) return ok({ success: false, error: "Entry not found" });
    if (entry.status !== "paid") return ok({ success: false, error: "Entry not refundable" });
    if (!entry.razorpay_payment_id) return ok({ success: false, error: "No payment to refund" });

    const { data: comp } = await supabase
      .from("quick_competitions")
      .select("tenant_id, refunds_allowed, status")
      .eq("id", entry.competition_id).maybeSingle();
    if (!comp) return ok({ success: false, error: "Competition not found" });
    if (!comp.refunds_allowed) return ok({ success: false, error: "Refunds not allowed for this competition" });

    // Authorize: must be franchise/site admin for tenant
    const { data: isAdmin } = await supabase.rpc("is_franchise_or_site_admin", {
      _user_id: u.user.id,
      _tenant_id: comp.tenant_id,
    });
    if (!isAdmin) return ok({ success: false, error: "Forbidden" });

    const { data: tenant } = await supabase
      .from("tenants").select("city").eq("id", comp.tenant_id).maybeSingle();
    const { data: gateway } = await supabase
      .from("payment_gateways")
      .select("api_key, api_secret, city_slug")
      .eq("city", tenant!.city).eq("name", "razorpay").eq("is_active", true).single();
    const apiKey = (gateway?.api_key || "").trim();
    const citySlug = (gateway?.city_slug || tenant!.city.toLowerCase().replace(/[^a-z0-9]/g, "_")).toUpperCase();
    const apiSecret = (Deno.env.get(`RAZORPAY_SECRET_${citySlug}`) || gateway?.api_secret || "").trim();
    if (!apiKey || !apiSecret) return ok({ success: false, error: "Razorpay credentials missing" });

    const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${entry.razorpay_payment_id}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}`,
      },
      body: JSON.stringify({ amount: Math.round(Number(entry.amount) * 100), speed: "normal" }),
    });
    if (!rzpRes.ok) {
      const t = await rzpRes.text();
      console.error("Refund failed", t);
      return ok({ success: false, error: "Refund failed at Razorpay" });
    }
    const refund = await rzpRes.json();

    await supabase.from("qc_entries").update({
      status: "refunded",
      refund_id: refund.id,
      refunded_at: new Date().toISOString(),
    }).eq("id", entry.id);

    // Remove player if no attempts logged
    if (entry.player_id) {
      const { count } = await supabase
        .from("quick_competition_attempts")
        .select("id", { count: "exact", head: true })
        .eq("player_id", entry.player_id);
      if ((count ?? 0) === 0) {
        await supabase.from("quick_competition_players").delete().eq("id", entry.player_id);
      }
    }

    await supabase.from("quick_competition_audit").insert({
      competition_id: entry.competition_id,
      actor_id: u.user.id,
      action: "refund_entry",
      details: { entry_id: entry.id, refund_id: refund.id, amount: Number(entry.amount) },
    });

    return ok({ success: true, refund_id: refund.id });
  } catch (err) {
    console.error("qc-refund-entry error", (err as Error).message);
    return ok({ success: false, error: "Internal error" });
  }
});
