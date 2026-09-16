import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";
import { z } from "npm:zod@3";
import { resolveQcGateway } from "../_shared/qc-gateway.ts";
import { finalizeQcEntry } from "../_shared/qc-finalize.ts";
import { canAccessQcEntry, resolveQcCaller } from "../_shared/qc-entry-access.ts";

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
  entry_id: z.string().uuid(),
  guest_claim: z.string().length(64).regex(/^[a-f0-9]+$/).optional(),
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return ok({ success: false, error: "Invalid request" });
    const { competition_id, entry_id, guest_claim, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const caller = await resolveQcCaller(req.headers.get("Authorization"), supabaseUrl, anonKey, createClient as unknown as Parameters<typeof resolveQcCaller>[3]);
    if (caller.kind === "invalid") return ok({ success: false, error: "Unauthorized" });

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: entry } = await supabase
      .from("qc_entries")
      .select("id, competition_id, razorpay_order_id, owner_id, guest_claim_hash")
      .eq("id", entry_id)
      .eq("competition_id", competition_id)
      .eq("razorpay_order_id", razorpay_order_id)
      .maybeSingle();
    if (!entry || !(await canAccessQcEntry(caller, entry, guest_claim))) {
      return ok({ success: false, error: "Entry authorization failed" });
    }

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
