import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT_MAX = 5;         // max attempts
const RATE_LIMIT_WINDOW_MIN = 15; // minutes

async function checkRateLimit(
  adminClient: ReturnType<typeof createClient>,
  identifier: string,
  action: string
): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000).toISOString();

  const { count } = await adminClient
    .from("rate_limit_attempts")
    .select("id", { count: "exact", head: true })
    .eq("identifier", identifier)
    .eq("action", action)
    .gte("attempted_at", windowStart);

  if ((count ?? 0) >= RATE_LIMIT_MAX) return false;

  await adminClient.from("rate_limit_attempts").insert({ identifier, action });
  return true;
}

// Constant-time string comparison to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { admin_password } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limiting: max 5 attempts per IP per 15 minutes
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const allowed = await checkRateLimit(adminClient, clientIp, "setup-admin");
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin_config table first, fallback to env var
    const { data: configRow } = await adminClient
      .from("admin_config")
      .select("value")
      .eq("key", "admin_password")
      .single();

    let storedValue: string | null = configRow?.value ?? null;

    if (!storedValue) {
      // Fallback to env var — hash it and seed the table
      const envPassword = Deno.env.get("ADMIN_SETUP_PASSWORD");
      if (envPassword) {
        const hashed = await bcrypt.hash(envPassword);
        await adminClient.from("admin_config").upsert(
          { key: "admin_password", value: hashed },
          { onConflict: "key" }
        );
        storedValue = hashed;
      }
    }

    if (!storedValue) {
      return new Response(
        JSON.stringify({ error: "Admin setup password not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify password — support both legacy plain-text and bcrypt hashes
    const isBcryptHash = storedValue.startsWith("$2b$") || storedValue.startsWith("$2a$");
    let passwordMatch: boolean;
    if (isBcryptHash) {
      passwordMatch = await bcrypt.compare(admin_password, storedValue);
    } else {
      // Legacy plain-text: compare and immediately upgrade to bcrypt
      passwordMatch = safeCompare(admin_password, storedValue);
      if (passwordMatch) {
        // Upgrade stored password to bcrypt hash
        const hashed = await bcrypt.hash(admin_password);
        await adminClient.from("admin_config").upsert(
          { key: "admin_password", value: hashed, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      }
    }

    if (!passwordMatch) {
      return new Response(
        JSON.stringify({ error: "Invalid admin password" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to insert the admin role
    const { error } = await adminClient
      .from("user_roles")
      .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });

    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to grant admin role" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Admin role granted" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
