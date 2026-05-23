// Nominee invokes a deceased/incapacitated user's data rights.
// Public endpoint: opens a grievance ticket for admin manual review (no automated PII release).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const nomineeName = String(body?.nominee_name ?? "").trim();
    const nomineeEmail = String(body?.nominee_email ?? "").trim().toLowerCase();
    const deceasedEmail = String(body?.deceased_email ?? "").trim().toLowerCase();
    const evidenceUrl = String(body?.evidence_url ?? "").trim();
    const note = String(body?.note ?? "").trim();
    const action = String(body?.action ?? "access");

    if (!nomineeName || !nomineeEmail || !deceasedEmail) {
      return json({ error: "nominee_name, nominee_email and deceased_email are required" });
    }

    const subject = `Nominee invocation: ${action} for ${deceasedEmail}`;
    const bodyText = [
      `Nominee: ${nomineeName} <${nomineeEmail}>`,
      `Data principal (deceased / incapacitated): ${deceasedEmail}`,
      `Requested action: ${action}`,
      evidenceUrl ? `Evidence URL: ${evidenceUrl}` : "Evidence URL: (not provided)",
      "",
      "Nominee note:",
      note || "(none)",
      "",
      "Admin: verify the nomination record in public.nominations and the supplied evidence before releasing or acting on any data.",
    ].join("\n");

    const { error } = await admin.from("grievance_tickets").insert({
      email: nomineeEmail,
      name: nomineeName,
      category: "nomination_invocation",
      subject,
      body: bodyText,
      status: "open",
    });
    if (error) return json({ error: error.message });

    return json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg });
  }
});
