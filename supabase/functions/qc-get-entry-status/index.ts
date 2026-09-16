import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { canAccessQcEntry, resolveQcCaller } from "../_shared/qc-entry-access.ts";

const headers = { ...corsHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS" };
const Schema = z.object({
  entry_id: z.string().uuid(),
  guest_claim: z.string().length(64).regex(/^[a-f0-9]+$/).optional(),
});
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, "Content-Type": "application/json" },
});

export async function handleQcGetEntryStatus(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  try {
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return reply({ success: false, error: "Invalid request" }, 400);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const caller = await resolveQcCaller(req.headers.get("Authorization"), supabaseUrl, anonKey, createClient as unknown as Parameters<typeof resolveQcCaller>[3]);
    if (caller.kind === "invalid") return reply({ success: false, error: "Unauthorized" }, 401);
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: entry } = await admin
      .from("qc_entries")
      .select("id, owner_id, guest_claim_hash, player_name, amount, currency, status, competition_id, quick_competitions(name)")
      .eq("id", parsed.data.entry_id)
      .maybeSingle();
    if (!entry || !(await canAccessQcEntry(caller, entry, parsed.data.guest_claim))) {
      return reply({ success: false, error: "Entry not found" }, 404);
    }
    const competition = Array.isArray(entry.quick_competitions) ? entry.quick_competitions[0] : entry.quick_competitions;
    return reply({ success: true, entry: {
      id: entry.id,
      competition_id: entry.competition_id,
      competition_name: competition?.name ?? null,
      player_name: entry.player_name,
      amount: entry.amount,
      currency: entry.currency,
      status: entry.status,
    } });
  } catch (error) {
    console.error("qc-get-entry-status error", (error as Error).message);
    return reply({ success: false, error: "Internal error" }, 500);
  }
}

if (import.meta.main) Deno.serve(handleQcGetEntryStatus);