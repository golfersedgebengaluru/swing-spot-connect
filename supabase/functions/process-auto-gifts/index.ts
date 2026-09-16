import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const responseHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_BYTES = 10_000;

const PayloadSchema = z.object({
  trigger_event: z.literal("signup"),
}).strip();

type ClientFactory = typeof createClient;
type FunctionEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export async function handleProcessAutoGifts(
  req: Request,
  clientFactory: ClientFactory = createClient,
  env: FunctionEnv = {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  },
) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: responseHeaders });
  }

  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413, headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const anonKey = env.SUPABASE_ANON_KEY;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Missing server configuration");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = clientFactory(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.json();
    const parsed = PayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
        status: 400, headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const { trigger_event } = parsed.data;
    const supabase = clientFactory(supabaseUrl, serviceKey);

    // Fetch active auto-gift rules for this trigger
    const { data: rules } = await supabase
      .from("auto_gift_rules")
      .select("*")
      .eq("trigger_event", trigger_event)
      .eq("is_active", true);

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ gifted: 0, message: "No active rules for this trigger" }), {
        headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }

    let gifted = 0;

    for (const rule of rules) {
      // Check max_per_user limit
      const { count } = await supabase
        .from("gifted_rewards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("trigger_event", trigger_event)
        .eq("reward_name", rule.reward_name);

      if ((count || 0) >= rule.max_per_user) continue;

      // Grant the gift
      const { error: giftError } = await supabase.from("gifted_rewards").insert({
        user_id: userId,
        reward_name: rule.reward_name,
        reward_description: rule.reward_description,
        gift_type: "auto",
        trigger_event,
        status: "pending",
        notes: `Auto-granted by rule: ${rule.name}`,
      });
      if (giftError) throw giftError;

      // Notify user
      const { error: notificationError } = await supabase.from("notifications").insert({
        user_id: userId,
        title: "Welcome Gift!",
        message: `You received a gift: ${rule.reward_name}! Check your Rewards page to claim it.`,
        type: "reward",
      });
      if (notificationError) throw notificationError;

      gifted++;
    }

    return new Response(JSON.stringify({ gifted, message: `${gifted} gift(s) awarded` }), {
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-auto-gifts error:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  }
}

if (import.meta.main) Deno.serve((req) => handleProcessAutoGifts(req));
