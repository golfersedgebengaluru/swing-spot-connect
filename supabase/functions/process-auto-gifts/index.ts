import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { user_id, trigger_event } = await req.json();

    if (!user_id || !trigger_event) {
      return new Response(JSON.stringify({ error: "Missing user_id or trigger_event" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        title: "🎁 Welcome Gift!",
        message: `You received a gift: ${rule.reward_name}! Check your Rewards page to claim it.`,
        type: "reward",
      });

      gifted++;
    }

    return new Response(JSON.stringify({ gifted, message: `${gifted} gift(s) awarded` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auto-gift error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
