import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";
import { z } from "https://esm.sh/zod@3";
import { resolveQcGateway } from "../_shared/qc-gateway.ts";
import { finalizeQcEntry } from "../_shared/qc-finalize.ts";

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

    const result = await finalizeQcEntry(supabase, razorpay_order_id, razorpay_payment_id);
    if (!result) return ok({ success: false, error: "Entry not found" });
    if (result.error) return ok({ success: false, error: result.error });
    return ok({ success: true, entry_id: result.entryId, player_id: result.playerId, already_paid: result.alreadyPaid });
  } catch (err) {
    console.error("qc-verify-entry-payment error", (err as Error).message);
    return ok({ success: false, error: "Internal error" });
  }
});
