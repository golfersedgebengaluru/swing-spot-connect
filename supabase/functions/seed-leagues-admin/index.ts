import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// SECURITY: Service-role gated. Password is read from CONTESTS_ADMIN_PASSWORD secret — never hardcoded.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAIL = "contests@golfers-edge.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.includes(serviceKey)) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const password = Deno.env.get("CONTESTS_ADMIN_PASSWORD");
    if (!password) {
      return new Response(
        JSON.stringify({ success: false, error: "CONTESTS_ADMIN_PASSWORD secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    let userId: string | null = null;
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
        password,
        email_confirm: true,
        user_metadata: { full_name: "Contests Admin" },
      });
      if (createErr) throw createErr;
      userId = created.user!.id;
    } else {
      await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    }

    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (roleErr) throw roleErr;

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
