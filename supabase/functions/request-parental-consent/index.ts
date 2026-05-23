// Sends a parental-consent email to the address on file for a minor account.
// Generates a one-time token, stores it on the profile, and emails a link.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" });

    const authed = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const parentEmail: string = String(body?.parent_email ?? "").trim().toLowerCase();
    if (!parentEmail || !parentEmail.includes("@")) return json({ error: "Valid parent_email required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify minor
    const { data: profile } = await admin
      .from("profiles")
      .select("date_of_birth, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.date_of_birth) return json({ error: "Date of birth required first" });

    const dob = new Date(profile.date_of_birth as string);
    const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age >= 18) return json({ error: "Parental consent is only required for users under 18" });

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    await admin.from("profiles").update({
      parent_email: parentEmail,
      parent_consent_status: "pending",
      parent_consent_token: token,
      parent_consent_at: null,
    }).eq("user_id", user.id);

    const origin = req.headers.get("origin") || "https://swing-spot-connect.lovable.app";
    const link = `${origin}/parental-consent/${token}`;

    // Best-effort email send via existing transactional infra
    try {
      await admin.functions.invoke("send-notification-email", {
        body: {
          to: parentEmail,
          subject: "Parental consent required",
          html: `
            <p>Hello,</p>
            <p><strong>${profile.display_name ?? "Your child"}</strong> has registered an account and listed you as their parent or lawful guardian.</p>
            <p>Because they are under 18, the Digital Personal Data Protection Act, 2023 (India) requires your verifiable consent before we may process their personal data.</p>
            <p><a href="${link}">Click here to review and respond</a>.</p>
            <p>If you did not expect this, please ignore the message.</p>
          `,
        },
      });
    } catch (_) { /* non-blocking */ }

    return json({ success: true, sent_to: parentEmail });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg });
  }
});
