import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This function creates or updates the admin@golfers-edge.com Supabase auth user.
// The auth user's login password is sourced from the ADMIN_AUTH_PASSWORD env var
// (set via Supabase secrets), NOT from admin_config which stores a bcrypt hash
// used only for the admin setup flow.

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
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

    // Read the Supabase auth login password from a dedicated env var
    const adminAuthPassword = Deno.env.get("ADMIN_AUTH_PASSWORD");
    if (!adminAuthPassword) {
      return new Response(
        JSON.stringify({ error: "ADMIN_AUTH_PASSWORD env var not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminEmail = "admin@golfers-edge.com";

    // Check if admin user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingAdmin = existingUsers?.users?.find((u: { email?: string }) => u.email === adminEmail);

    if (existingAdmin) {
      // Update password
      await adminClient.auth.admin.updateUserById(existingAdmin.id, {
        password: adminAuthPassword,
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
      password: adminAuthPassword,
      email_confirm: true,
      user_metadata: { full_name: "Admin" },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: "Failed to create admin user" }),
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
