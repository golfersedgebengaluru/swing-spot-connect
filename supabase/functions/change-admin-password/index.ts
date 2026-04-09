import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MIN = 15;

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

function isStrongPassword(password: string): { valid: boolean; reason?: string } {
  if (password.length < 12) return { valid: false, reason: "Password must be at least 12 characters" };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: "Password must contain at least one uppercase letter" };
  if (!/[a-z]/.test(password)) return { valid: false, reason: "Password must contain at least one lowercase letter" };
  if (!/[0-9]/.test(password)) return { valid: false, reason: "Password must contain at least one number" };
  if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, reason: "Password must contain at least one special character" };
  return { valid: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { current_password, new_password } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is authenticated and is admin
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

    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting: max 5 wrong-password attempts per user per 15 minutes
    const allowed = await checkRateLimit(adminClient, user.id, "change-admin-password");
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current password hash from admin_config
    const { data: configRow } = await adminClient
      .from("admin_config")
      .select("value")
      .eq("key", "admin_password")
      .single();

    const storedValue: string | null = configRow?.value ?? Deno.env.get("ADMIN_SETUP_PASSWORD") ?? null;

    if (!storedValue) {
      return new Response(
        JSON.stringify({ error: "Admin password not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify current password — support both legacy plain-text and new bcrypt hashes
    const isBcryptHash = storedValue.startsWith("$2b$") || storedValue.startsWith("$2a$");
    let passwordMatch: boolean;
    if (isBcryptHash) {
      passwordMatch = await bcrypt.compare(current_password, storedValue);
    } else {
      // Legacy plain-text comparison (constant-time)
      passwordMatch = safeCompare(current_password, storedValue);
    }

    if (!passwordMatch) {
      return new Response(
        JSON.stringify({ error: "Current password is incorrect" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enforce strong password policy
    const strength = isStrongPassword(new_password ?? "");
    if (!strength.valid) {
      return new Response(
        JSON.stringify({ error: strength.reason }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash new password before storing
    const hashed = await bcrypt.hash(new_password);

    const { error: updateError } = await adminClient
      .from("admin_config")
      .upsert(
        { key: "admin_password", value: hashed, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update password" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Admin password updated successfully" }),
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
