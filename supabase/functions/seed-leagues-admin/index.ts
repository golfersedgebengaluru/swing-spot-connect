import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAIL = "contests@golfers-edge.com";
const TARGET_PASSWORD = "Passwd@geb1234!";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Find or create the auth user
    let userId: string | null = null;
    // Page through users to find existing
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const found = data.users.find((u) => (u.email ?? "").toLowerCase() === TARGET_EMAIL);
      if (found) { userId = found.id; break; }
      if (data.users.length < 200) break;
      page++;
    }

    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: TARGET_EMAIL,
        password: TARGET_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Contests Admin" },
      });
      if (createErr) throw createErr;
      userId = created.user!.id;
    } else {
      // Ensure password matches the requested one (idempotent reset)
      await admin.auth.admin.updateUserById(userId, { password: TARGET_PASSWORD, email_confirm: true });
    }

    // 2) Grant admin role
    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (roleErr) throw roleErr;

    // 3) Mark as leagues-only
    const { error: flagErr } = await admin
      .from("leagues_only_admins")
      .upsert({ user_id: userId }, { onConflict: "user_id" });
    if (flagErr) throw flagErr;

    return new Response(
      JSON.stringify({ success: true, user_id: userId, email: TARGET_EMAIL }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
