import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BODY_BYTES = 10_000;

const GrantRevokeSchema = z.object({
  action: z.enum(["grant", "revoke"]),
  user_id: z.string().uuid("user_id must be a valid UUID"),
  role: z.enum(["admin", "site_admin", "user", "coach"]),
  cities: z.array(z.string().min(1).max(100)).optional(),
});

const ListSchema = z.object({
  action: z.enum(["list", "list_cities"]),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Enforce body size limit
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const rawBody = await req.json();

    // Validate list actions
    const listParse = ListSchema.safeParse(rawBody);
    if (listParse.success) {
      const { action } = listParse.data;
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
    }

    // Validate grant/revoke actions
    const parsed = GrantRevokeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, user_id, role, cities } = parsed.data;

    if (action === "grant") {
      if (role === "site_admin" && Array.isArray(cities) && cities.length > 0) {
        // Atomic stored procedure: grant role + city assignments in one transaction
        const { error } = await adminClient.rpc("grant_site_admin_with_cities", {
          p_user_id: user_id,
          p_cities: cities,
        });
        if (error) throw error;
      } else {
        const { error } = await adminClient
          .from("user_roles")
          .upsert({ user_id, role }, { onConflict: "user_id,role" });
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true, message: `Role '${role}' granted` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "revoke") {
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

      if (role === "site_admin") {
        await adminClient.from("site_admin_cities").delete().eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true, message: `Role '${role}' revoked` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
