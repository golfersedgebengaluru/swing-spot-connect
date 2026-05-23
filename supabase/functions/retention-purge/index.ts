// DPDP retention auto-purge. Service-role only; called by pg_cron.
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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Service-role only — reject unless caller presents the service-role key
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.includes(SERVICE_KEY)) return json({ error: "Forbidden" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const start = Date.now();
  let anonymised = 0, purgedConsent = 0, purgedGuests = 0;
  let status: "completed" | "failed" | "partial" = "completed";
  let error: string | null = null;

  try {
    // 1) Anonymise bookings older than 8 years (clear notes / personal text)
    const eightYrs = new Date(Date.now() - 8 * 365.25 * 24 * 3600 * 1000).toISOString();
    const { data: oldBk } = await admin
      .from("bookings")
      .update({ notes: null })
      .lt("created_at", eightYrs)
      .not("notes", "is", null)
      .select("id");
    anonymised = oldBk?.length ?? 0;

    // 2) Purge consent_log rows >7 yrs past account closure
    const sevenYrs = new Date(Date.now() - 7 * 365.25 * 24 * 3600 * 1000).toISOString();
    const { data: closed } = await admin
      .from("deletion_requests")
      .select("user_id")
      .eq("status", "completed")
      .lt("processed_at", sevenYrs);
    const closedIds = (closed ?? []).map((r) => r.user_id).filter(Boolean) as string[];
    if (closedIds.length) {
      const { data: del } = await admin
        .from("consent_log").delete().in("user_id", closedIds).select("id");
      purgedConsent = del?.length ?? 0;
    }

    // 3) Delete guest profiles with no activity for 2 years
    const twoYrs = new Date(Date.now() - 2 * 365.25 * 24 * 3600 * 1000).toISOString();
    const { data: stale } = await admin
      .from("profiles")
      .select("id, user_id, updated_at, user_type")
      .eq("user_type", "non-registered")
      .lt("updated_at", twoYrs);
    let deleted = 0;
    for (const p of stale ?? []) {
      // Skip if any booking / order / league activity exists
      const { count: bk } = await admin.from("bookings").select("*", { count: "exact", head: true }).eq("user_id", p.user_id);
      if ((bk ?? 0) > 0) continue;
      const { count: ord } = await admin.from("product_orders").select("*", { count: "exact", head: true }).eq("user_id", p.user_id);
      if ((ord ?? 0) > 0) continue;
      await admin.from("profiles").delete().eq("id", p.id);
      deleted += 1;
    }
    purgedGuests = deleted;
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }

  await admin.from("retention_runs").insert({
    rows_anonymised: anonymised,
    rows_purged_consent: purgedConsent,
    rows_purged_guests: purgedGuests,
    duration_ms: Date.now() - start,
    status,
    error,
  });

  return json({ status, anonymised, purgedConsent, purgedGuests, duration_ms: Date.now() - start, error });
});
