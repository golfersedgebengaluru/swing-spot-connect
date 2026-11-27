// Creates a short-lived, single-use parental-consent request and sends its link.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" });

    const authed = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user || user.is_anonymous) return json({ error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const parentEmail = String(body?.parent_email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
      return json({ error: "A valid parent or guardian email is required" });
    }

    const { data: request, error: requestError } = await authed.rpc("create_parental_consent_request", {
      _parent_email: parentEmail,
    });
    if (requestError || !request?.token || !request?.request_id) {
      return json({ error: requestError?.message || "The consent request could not be saved" });
    }

    const origin = req.headers.get("origin") || "https://swing-spot-connect.lovable.app";
    const consentUrl = `${origin}/parental-consent/${request.token}`;
    const { data: profile } = await authed.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: emailResult, error: emailError } = await admin.functions.invoke("send-notification-email", {
      body: {
        recipient_email: parentEmail,
        template: "parental_consent",
        subject: "Parental consent required",
        data: {
          display_name: profile?.display_name || "Your child",
          consent_url: consentUrl,
        },
      },
    });

    const sent = !emailError && emailResult?.success === true &&
      (emailResult?.status === "sent" || emailResult?.status === "deduplicated");
    await admin.rpc("mark_parental_consent_email", {
      _request_id: request.request_id,
      _sent: sent,
    });

    if (!sent) {
      return json({
        error: emailResult?.error || emailError?.message || "The email could not be sent. Your request is saved; please retry.",
      });
    }

    return json({ success: true, sent_to: parentEmail, expires_at: request.expires_at });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});
