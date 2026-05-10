// End a Quick Competition: compute winners and generate sharable result cards.
// Admin-only. Returns 200 OK with { success, error? } per project convention.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!)
  );
}

function buildCardSvg(opts: {
  category: "longest" | "straightest";
  competitionName: string;
  winnerName: string;
  value: number;
  unit: string;
  date: string;
  sponsorLogoUrl?: string | null;
}): string {
  const title = opts.category === "longest" ? "LONGEST DRIVE" : "STRAIGHTEST DRIVE";
  const accent = opts.category === "longest" ? "#B8860B" : "#3E7090";
  const valueLabel = opts.category === "longest" ? "Distance" : "Offline";
  const formatted = `${opts.value.toFixed(1)} ${opts.unit}`;
  const sponsor = opts.sponsorLogoUrl
    ? `<image href="${escapeXml(opts.sponsorLogoUrl)}" x="430" y="940" width="240" height="80" preserveAspectRatio="xMidYMid meet" />
       <text x="550" y="920" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="20" fill="#999">Brought to you by</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1100" height="1100" viewBox="0 0 1100 1100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#F5F1E8"/>
    </linearGradient>
  </defs>
  <rect width="1100" height="1100" fill="url(#bg)"/>
  <rect x="40" y="40" width="1020" height="1020" fill="none" stroke="${accent}" stroke-width="3" rx="20"/>
  <rect x="60" y="60" width="980" height="980" fill="none" stroke="${accent}" stroke-width="1" opacity="0.4" rx="12"/>
  <text x="550" y="180" text-anchor="middle" font-family="Playfair Display, serif" font-size="48" fill="#2C2C2C" font-style="italic">Champion</text>
  <text x="550" y="270" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="56" fill="${accent}" font-weight="bold" letter-spacing="6">${title}</text>
  <line x1="350" y1="320" x2="750" y2="320" stroke="${accent}" stroke-width="2"/>
  <text x="550" y="490" text-anchor="middle" font-family="Playfair Display, serif" font-size="84" fill="#1A1A1A" font-weight="bold">${escapeXml(opts.winnerName)}</text>
  <text x="550" y="600" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="28" fill="#777" letter-spacing="3">${valueLabel.toUpperCase()}</text>
  <text x="550" y="720" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="120" fill="${accent}" font-weight="bold">${formatted}</text>
  <text x="550" y="830" text-anchor="middle" font-family="Playfair Display, serif" font-size="36" fill="#2C2C2C" font-style="italic">${escapeXml(opts.competitionName)}</text>
  <text x="550" y="880" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="22" fill="#888">${escapeXml(opts.date)}</text>
  ${sponsor}
</svg>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return ok({ success: false, error: "Missing authorization" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return ok({ success: false, error: "Unauthorized" });
    const userId = userData.user.id;

    const body = await req.json();
    const competitionId: string = body.competition_id;
    if (!competitionId) return ok({ success: false, error: "competition_id required" });

    const admin = createClient(supabaseUrl, serviceKey);

    // Load competition
    const { data: comp, error: compErr } = await admin
      .from("quick_competitions")
      .select("*")
      .eq("id", competitionId)
      .maybeSingle();
    if (compErr || !comp) return ok({ success: false, error: "Competition not found" });

    // Verify caller is admin for this tenant
    const { data: isAdmin } = await admin.rpc("is_franchise_or_site_admin", {
      _user_id: userId,
      _tenant_id: comp.tenant_id,
    });
    if (!isAdmin) return ok({ success: false, error: "Forbidden" });

    if (comp.status === "completed") {
      return ok({ success: true, already_completed: true, competition: comp });
    }

    // Load attempts + players
    const [{ data: players }, { data: attempts }, { data: tenant }] = await Promise.all([
      admin.from("quick_competition_players").select("id,name").eq("competition_id", competitionId),
      admin
        .from("quick_competition_attempts")
        .select("player_id,distance,offline,created_at")
        .eq("competition_id", competitionId)
        .order("created_at", { ascending: true }),
      admin.from("tenants").select("name,city").eq("id", comp.tenant_id).maybeSingle(),
    ]);

    if (!players || players.length === 0 || !attempts || attempts.length === 0) {
      return ok({ success: false, error: "No attempts recorded — cannot end competition" });
    }

    const playerName = new Map(players.map((p) => [p.id, p.name]));

    // Best per player + earliest-qualifying-attempt timestamp for tie-breaking
    type Best = { playerId: string; value: number; ts: string };
    const bestLongest = new Map<string, Best>();
    const bestStraightest = new Map<string, Best>();
    for (const a of attempts) {
      const cur = bestLongest.get(a.player_id);
      if (!cur || a.distance > cur.value) {
        bestLongest.set(a.player_id, { playerId: a.player_id, value: Number(a.distance), ts: a.created_at });
      }
      const curS = bestStraightest.get(a.player_id);
      if (!curS || a.offline < curS.value) {
        bestStraightest.set(a.player_id, { playerId: a.player_id, value: Number(a.offline), ts: a.created_at });
      }
    }

    const longestArr = [...bestLongest.values()].sort((a, b) =>
      b.value - a.value || a.ts.localeCompare(b.ts)
    );
    const straightArr = [...bestStraightest.values()].sort((a, b) =>
      a.value - b.value || a.ts.localeCompare(b.ts)
    );

    const longestWinner = longestArr[0];
    const straightWinner = straightArr[0];
    const dateStr = new Date(comp.created_at).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
    const venue = tenant ? `${tenant.name} · ${tenant.city}` : "";
    const compTitle = `${comp.name}${venue ? " — " + venue : ""}`;

    const sponsorLogo = comp.sponsor_enabled ? comp.sponsor_logo_url : null;

    // Render + upload both cards
    async function uploadCard(category: "longest" | "straightest", winner: Best): Promise<string> {
      const svg = buildCardSvg({
        category,
        competitionName: compTitle,
        winnerName: playerName.get(winner.playerId) ?? "Unknown",
        value: winner.value,
        unit: comp.unit === "yd" ? "yards" : "metres",
        date: dateStr,
        sponsorLogoUrl: sponsorLogo,
      });
      const path = `${competitionId}/${category}-${Date.now()}.svg`;
      const { error: upErr } = await admin.storage
        .from("quick-comp-sponsors")
        .upload(path, new Blob([svg], { type: "image/svg+xml" }), {
          contentType: "image/svg+xml",
          upsert: true,
        });
      if (upErr) throw new Error(`Upload ${category}: ${upErr.message}`);
      const { data: pub } = admin.storage.from("quick-comp-sponsors").getPublicUrl(path);
      return pub.publicUrl;
    }

    const longestUrl = await uploadCard("longest", longestWinner);
    const straightUrl = await uploadCard("straightest", straightWinner);

    // Mark complete
    const { data: updated, error: upErr } = await admin
      .from("quick_competitions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        longest_winner_player_id: longestWinner.playerId,
        longest_winner_value: longestWinner.value,
        straightest_winner_player_id: straightWinner.playerId,
        straightest_winner_value: straightWinner.value,
        longest_card_url: longestUrl,
        straightest_card_url: straightUrl,
      })
      .eq("id", competitionId)
      .select()
      .single();
    if (upErr) return ok({ success: false, error: upErr.message });

    // Audit
    await admin.from("quick_competition_audit").insert({
      competition_id: competitionId,
      actor_id: userId,
      action: "end",
      details: {
        longest: { player_id: longestWinner.playerId, value: longestWinner.value },
        straightest: { player_id: straightWinner.playerId, value: straightWinner.value },
      },
    });

    return ok({ success: true, competition: updated });
  } catch (e) {
    console.error("end-competition error", e);
    return ok({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});
