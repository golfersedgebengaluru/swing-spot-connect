// Account deletion (Right to Erasure under DPDP §12).
// Soft-delete: anonymise profile, kill auth user, retain financial rows for tax law (8 yr).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const authed = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const confirm: string = body?.confirm_email ?? "";
    const reason: string = body?.reason ?? "";

    if (confirm.toLowerCase().trim() !== (user.email ?? "").toLowerCase().trim()) {
      return new Response(JSON.stringify({ error: "Email confirmation did not match." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const anonEmail = `deleted+${user.id}@anonymised.local`;

    await admin.from("deletion_requests").insert({
      user_id: user.id, email: user.email, reason, status: "pending",
    });

    // Anonymise profile
    await admin.from("profiles").update({
      display_name: "Deleted User",
      email: anonEmail,
      phone: null,
      avatar_url: null,
      preferred_city: null,
      apple_user_id: null,
    }).eq("user_id", user.id);

    // Best-effort: clear free-text PII in community posts
    try {
      await admin.from("community_posts").update({ content: "[deleted]" }).eq("user_id", user.id);
    } catch (_) {}

    // Delete the auth user (revokes sessions). Financial FKs reference profiles.user_id
    // and use ON DELETE behaviour set in DB; they remain for tax compliance.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      await admin.from("deletion_requests")
        .update({ status: "pending", error: delErr.message })
        .eq("user_id", user.id);
      return new Response(JSON.stringify({
        error: "Profile anonymised but session deletion failed. Our Grievance Officer will complete the deletion within 7 days.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin.from("deletion_requests")
      .update({ status: "completed", processed_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
