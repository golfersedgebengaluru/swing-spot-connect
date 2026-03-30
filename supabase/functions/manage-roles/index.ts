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

    // Verify caller is authenticated admin
    const authHeader = req.headers.get("Authorization")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, user_id, role, cities } = await req.json();

    if (action === "list") {
      const { data: roles, error } = await adminClient
        .from("user_roles")
        .select("user_id, role");
      if (error) throw error;
      return new Response(JSON.stringify({ roles }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_cities") {
      const { data: assignments, error } = await adminClient
        .from("site_admin_cities")
        .select("user_id, city");
      if (error) throw error;
      return new Response(JSON.stringify({ assignments }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!user_id || !role || !["admin", "site_admin", "user"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid user_id or role" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "grant") {
      const { error } = await adminClient
        .from("user_roles")
        .upsert({ user_id, role }, { onConflict: "user_id,role" });
      if (error) throw error;

      // If site_admin, also assign cities
      if (role === "site_admin" && Array.isArray(cities) && cities.length > 0) {
        // Remove existing city assignments and re-insert
        await adminClient.from("site_admin_cities").delete().eq("user_id", user_id);
        const cityRows = cities.map((city: string) => ({ user_id, city }));
        const { error: cityErr } = await adminClient.from("site_admin_cities").insert(cityRows);
        if (cityErr) throw cityErr;
      }

      return new Response(JSON.stringify({ success: true, message: `Role '${role}' granted` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "revoke") {
      if (user_id === user.id && role === "admin") {
        return new Response(JSON.stringify({ error: "Cannot revoke your own admin role" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .eq("role", role);
      if (error) throw error;

      // If revoking site_admin, also remove city assignments
      if (role === "site_admin") {
        await adminClient.from("site_admin_cities").delete().eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true, message: `Role '${role}' revoked` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'grant', 'revoke', 'list', or 'list_cities'" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
