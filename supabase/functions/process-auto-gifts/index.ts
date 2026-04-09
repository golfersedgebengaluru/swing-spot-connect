import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BODY_BYTES = 10_000;

const PayloadSchema = z.object({
  user_id: z.string().uuid("user_id must be a valid UUID"),
  trigger_event: z.string().min(1).max(100),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const rawBody = await req.json();
    const parsed = PayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, trigger_event } = parsed.data;

    // Fetch active auto-gift rules for this trigger
    const { data: rules } = await supabase
      .from("auto_gift_rules")
      .select("*")
      .eq("trigger_event", trigger_event)
      .eq("is_active", true);

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ gifted: 0, message: "No active rules for this trigger" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let gifted = 0;

    for (const rule of rules) {
      // Check max_per_user limit
      const { count } = await supabase
        .from("gifted_rewards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("trigger_event", trigger_event)
        .eq("reward_name", rule.reward_name);

      if ((count || 0) >= rule.max_per_user) continue;

      // Grant the gift
      await supabase.from("gifted_rewards").insert({
        user_id,
        reward_name: rule.reward_name,
        reward_description: rule.reward_description,
        gift_type: "auto",
        trigger_event,
        status: "pending",
        notes: `Auto-granted by rule: ${rule.name}`,
      });

      // Notify user
      await supabase.from("notifications").insert({
        user_id,
        title: "Welcome Gift!",
        message: `You received a gift: ${rule.reward_name}! Check your Rewards page to claim it.`,
        type: "reward",
      });

      gifted++;
    }

    return new Response(JSON.stringify({ gifted, message: `${gifted} gift(s) awarded` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-auto-gifts error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
