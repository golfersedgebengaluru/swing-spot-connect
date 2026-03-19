import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get the admin password from admin_config
    const { data: configRow } = await adminClient
      .from("admin_config")
      .select("value")
      .eq("key", "admin_password")
      .single();

    const adminPassword = configRow?.value;
    if (!adminPassword) {
      return new Response(
        JSON.stringify({ error: "Admin password not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminEmail = "admin@golfers-edge.com";

    // Check if admin user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingAdmin = existingUsers?.users?.find(u => u.email === adminEmail);

    if (existingAdmin) {
      // Update password to match current admin password
      await adminClient.auth.admin.updateUserById(existingAdmin.id, {
        password: adminPassword,
        email_confirm: true,
      });

      // Ensure admin role exists
      await adminClient
        .from("user_roles")
        .upsert({ user_id: existingAdmin.id, role: "admin" }, { onConflict: "user_id,role" });

      return new Response(
        JSON.stringify({ success: true, message: "Admin user updated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the admin user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: "Admin" },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Grant admin role
    await adminClient
      .from("user_roles")
      .upsert({ user_id: newUser.user!.id, role: "admin" }, { onConflict: "user_id,role" });

    return new Response(
      JSON.stringify({ success: true, message: "Admin user created" }),
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
