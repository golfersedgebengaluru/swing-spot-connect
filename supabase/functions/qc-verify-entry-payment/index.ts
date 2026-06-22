import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";
import { z } from "https://esm.sh/zod@3";
import { resolveQcGateway } from "../_shared/qc-gateway.ts";

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

const Schema = z.object({
  competition_id: z.string().uuid(),
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return ok({ success: false, error: "Invalid request" });
    const { competition_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: comp } = await supabase
      .from("quick_competitions")
      .select("id, tenant_id")
      .eq("id", competition_id).maybeSingle();
    if (!comp) return ok({ success: false, error: "Competition not found" });

    const { gateway, city } = await resolveQcGateway(supabase, comp);
    if (!gateway) return ok({ success: false, error: "Verification unavailable" });
    const citySlug = (gateway.city_slug || (city || "tenant").toLowerCase().replace(/[^a-z0-9]/g, "_")).toUpperCase();
    const apiSecret = (Deno.env.get(`RAZORPAY_SECRET_${citySlug}`) || gateway.api_secret || "").trim();
    if (!apiSecret) return ok({ success: false, error: "Verification unavailable" });

    const expected = createHmac("sha256", apiSecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (expected !== razorpay_signature)
      return ok({ success: false, error: "Payment signature invalid" });

    const { data: entry } = await supabase
      .from("qc_entries")
      .select("*")
      .eq("competition_id", competition_id)
      .eq("razorpay_order_id", razorpay_order_id)
      .maybeSingle();
    if (!entry) return ok({ success: false, error: "Entry not found" });

    // Idempotency #1: already paid in a prior call.
    if (entry.status === "paid" && entry.player_id) {
      return ok({ success: true, entry_id: entry.id, player_id: entry.player_id, already_paid: true });
    }

    // ── Race-safe claim ──
    // Browser + razorpay-webhook + cron reconciler can race on the same order.
    // Atomically flip status from non-paid → paid; only the winner proceeds to
    // create the player row. Losers re-read the winner's row and return it.
    const { data: claimed, error: claimErr } = await supabase
      .from("qc_entries")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", entry.id)
      .neq("status", "paid")
      .select()
      .maybeSingle();

    if (claimErr) {
      console.error("qc_entries claim failed", claimErr);
      return ok({ success: false, error: "Could not finalize entry" });
    }

    if (!claimed) {
      // Another finalizer beat us — return their result.
      const { data: winner } = await supabase
        .from("qc_entries")
        .select("id, player_id")
        .eq("id", entry.id)
        .maybeSingle();
      return ok({ success: true, entry_id: winner?.id ?? entry.id, player_id: winner?.player_id ?? null, already_paid: true });
    }

    // We are the winner — create the player row.
    const { data: player, error: pErr } = await supabase
      .from("quick_competition_players")
      .insert({ competition_id, name: entry.player_name })
      .select().single();
    if (pErr) {
      console.error("player insert failed", pErr);
      // Roll back our claim so a retry/cron can finish it.
      await supabase
        .from("qc_entries")
        .update({ status: entry.status, razorpay_payment_id: entry.razorpay_payment_id })
        .eq("id", entry.id);
      return ok({ success: false, error: "Could not create player" });
    }

    await supabase
      .from("qc_entries")
      .update({ player_id: player.id })
      .eq("id", entry.id);

    await supabase.from("quick_competition_audit").insert({
      competition_id,
      action: "paid_entry",
      details: { entry_id: entry.id, player_id: player.id, amount: Number(entry.amount) },
    });

    return ok({ success: true, entry_id: entry.id, player_id: player.id });
  } catch (err) {
    console.error("qc-verify-entry-payment error", (err as Error).message);
    return ok({ success: false, error: "Internal error" });
  }
});
