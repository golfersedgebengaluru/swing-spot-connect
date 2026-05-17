import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Always respond success-shaped to avoid leaking which emails exist
  try {
    if (req.method !== "POST") {
      return json({ success: true }, 200);
    }

    const body = await req.json().catch(() => ({}));
    const emailRaw = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const redirectTo = typeof body?.redirect_to === "string" && body.redirect_to.length < 500
      ? body.redirect_to
      : `${req.headers.get("origin") || ""}/reset-password`;

    if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      // Silently succeed on bad input — don't leak validation specifics
      return json({ success: true });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Look up profile (best-effort) for display_name + to gate enumeration
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, id, email, display_name")
      .ilike("email", emailRaw)
      .maybeSingle();

    if (!profile?.email) {
      console.log("[request-password-reset] no profile for", emailRaw);
      return json({ success: true });
    }

    // Generate recovery link via admin API — yields the same #access_token=...&type=recovery hash
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: profile.email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[request-password-reset] generateLink failed", linkError);
      return json({ success: true });
    }

    const resetUrl = linkData.properties.action_link;

    // Fire the email through the existing branded sender (Resend, notify@golfersedge.in)
    const { error: invokeError } = await admin.functions.invoke("send-notification-email", {
      body: {
        template: "password_reset",
        subject: "Reset your Golfer's Edge password",
        recipient_email: profile.email,
        data: {
          display_name: profile.display_name || null,
          reset_url: resetUrl,
          expires_in_minutes: 60,
        },
      },
    });

    if (invokeError) {
      console.error("[request-password-reset] send-notification-email failed", invokeError);
    }

    return json({ success: true });
  } catch (err) {
    console.error("[request-password-reset] unexpected error", err);
    // Always 200 to bypass fetch masking and avoid leaking errors to clients
    return json({ success: true });
  }
});
