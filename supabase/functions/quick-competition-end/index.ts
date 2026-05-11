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
  categoryLabel?: string;
  placeLabel?: string;
}): string {
  const title = opts.category === "longest" ? "LONGEST DRIVE" : "STRAIGHTEST DRIVE";
  const accent = opts.category === "longest" ? "#B8860B" : "#3E7090";
  const placeLabel = opts.placeLabel ?? "Champion";
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
      <stop offset="1" stop-color="#FAFAFA"/>
    </linearGradient>
  </defs>
  <rect width="1100" height="1100" fill="url(#bg)"/>
  <rect x="40" y="40" width="1020" height="1020" fill="none" stroke="${accent}" stroke-width="3" opacity="0.7" rx="20"/>
  <rect x="60" y="60" width="980" height="980" fill="none" stroke="${accent}" stroke-width="1" opacity="0.35" rx="12"/>
  <text x="550" y="180" text-anchor="middle" font-family="Playfair Display, serif" font-size="48" fill="#2C2C2C" font-style="italic">${escapeXml(placeLabel)}</text>
  <text x="550" y="270" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="56" fill="${accent}" font-weight="bold" letter-spacing="6">${title}</text>
  ${opts.categoryLabel ? `<text x="550" y="310" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="24" fill="#666" letter-spacing="3">${escapeXml(opts.categoryLabel.toUpperCase())}</text>` : ""}
  <line x1="350" y1="340" x2="750" y2="340" stroke="${accent}" stroke-width="2"/>
  <text x="550" y="490" text-anchor="middle" font-family="Playfair Display, serif" font-size="68" fill="#1A1A1A" font-weight="bold">${escapeXml(opts.winnerName)}</text>
  <text x="550" y="600" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="26" fill="#777" letter-spacing="3">${valueLabel.toUpperCase()}</text>
  <text x="550" y="720" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="96" fill="${accent}" font-weight="bold">${formatted}</text>
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

    // Load attempts + players + categories
    const [{ data: players }, { data: attempts }, { data: categories }] = await Promise.all([
      admin.from("quick_competition_players").select("id,name,category_id").eq("competition_id", competitionId),
      admin
        .from("quick_competition_attempts")
        .select("player_id,distance,offline,created_at")
        .eq("competition_id", competitionId)
        .order("created_at", { ascending: true }),
      admin
        .from("quick_competition_categories")
        .select("id,name,sort_order")
        .eq("competition_id", competitionId)
        .order("sort_order", { ascending: true }),
    ]);

    if (!players || players.length === 0 || !attempts || attempts.length === 0) {
      return ok({ success: false, error: "No attempts recorded — cannot end competition" });
    }

    const playerName = new Map(players.map((p) => [p.id, p.name]));
    const playerCategory = new Map(players.map((p) => [p.id, p.category_id as string | null]));

    type Best = { playerId: string; value: number; ts: string };

    function computeBests(playerIds: Set<string>): { longest: Best[]; straightest: Best[] } {
      const bestL = new Map<string, Best>();
      const bestS = new Map<string, Best>();
      for (const a of attempts) {
        if (!playerIds.has(a.player_id)) continue;
        const cur = bestL.get(a.player_id);
        if (!cur || a.distance > cur.value) {
          bestL.set(a.player_id, { playerId: a.player_id, value: Number(a.distance), ts: a.created_at });
        }
        const curS = bestS.get(a.player_id);
        if (!curS || a.offline < curS.value) {
          bestS.set(a.player_id, { playerId: a.player_id, value: Number(a.offline), ts: a.created_at });
        }
      }
      const lArr = [...bestL.values()].sort((a, b) => b.value - a.value || a.ts.localeCompare(b.ts));
      const sArr = [...bestS.values()].sort((a, b) => a.value - b.value || a.ts.localeCompare(b.ts));
      return { longest: lArr, straightest: sArr };
    }

    const dateStr = new Date(comp.created_at).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
    const compTitle = comp.name;
    const sponsorLogo = comp.sponsor_enabled ? comp.sponsor_logo_url : null;
    const unitLabel = comp.unit === "yd" ? "yards" : "metres";

    async function uploadCard(
      pathKey: string,
      category: "longest" | "straightest",
      winner: Best,
      categoryName?: string,
      placeLabel?: string,
    ): Promise<string> {
      const svg = buildCardSvg({
        category,
        competitionName: compTitle,
        winnerName: playerName.get(winner.playerId) ?? "Unknown",
        value: winner.value,
        unit: unitLabel,
        date: dateStr,
        sponsorLogoUrl: sponsorLogo,
        categoryLabel: categoryName,
        placeLabel,
      });
      const path = `${competitionId}/${pathKey}-${Date.now()}.svg`;
      const { error: upErr } = await admin.storage
        .from("quick-comp-sponsors")
        .upload(path, new Blob([svg], { type: "image/svg+xml" }), {
          contentType: "image/svg+xml",
          upsert: true,
        });
      if (upErr) throw new Error(`Upload ${pathKey}: ${upErr.message}`);
      const { data: pub } = admin.storage.from("quick-comp-sponsors").getPublicUrl(path);
      return pub.publicUrl;
    }

    async function buildPlaceEntry(
      pathKey: string,
      category: "longest" | "straightest",
      best: Best,
      categoryName: string | undefined,
      placeLabel: string,
    ) {
      const url = await uploadCard(pathKey, category, best, categoryName, placeLabel);
      return {
        player_id: best.playerId,
        player_name: playerName.get(best.playerId) ?? "Unknown",
        value: best.value,
        card_url: url,
      };
    }

    const updatePayload: Record<string, unknown> = {
      status: "completed",
      completed_at: new Date().toISOString(),
    };

    const auditDetails: Record<string, unknown> = {};

    if (comp.categories_enabled && categories && categories.length > 0) {
      const categoryWinners: Array<Record<string, unknown>> = [];
      for (const cat of categories) {
        const ids = new Set(players.filter((p) => p.category_id === cat.id).map((p) => p.id));
        if (ids.size === 0) continue;
        const { longest, straightest } = computeBests(ids);
        const entry: Record<string, unknown> = {
          category_id: cat.id,
          name: cat.name,
        };
        if (longest[0]) {
          entry.longest = await buildPlaceEntry(`longest-${cat.id}`, "longest", longest[0], cat.name, "Champion");
        }
        if (longest[1]) {
          entry.longest_runner_up = await buildPlaceEntry(`longest-runner-${cat.id}`, "longest", longest[1], cat.name, "Runner-Up Champion");
        }
        if (straightest[0]) {
          entry.straightest = await buildPlaceEntry(`straightest-${cat.id}`, "straightest", straightest[0], cat.name, "Champion");
        }
        if (straightest[1]) {
          entry.straightest_runner_up = await buildPlaceEntry(`straightest-runner-${cat.id}`, "straightest", straightest[1], cat.name, "Runner-Up Champion");
        }
        categoryWinners.push(entry);
      }
      if (categoryWinners.length === 0) {
        return ok({ success: false, error: "No attempts in any category — cannot end competition" });
      }
      updatePayload.category_winners = categoryWinners;
      auditDetails.category_winners = categoryWinners;
    } else {
      const allIds = new Set(players.map((p) => p.id));
      const { longest, straightest } = computeBests(allIds);
      if (!longest[0] || !straightest[0]) {
        return ok({ success: false, error: "No attempts recorded — cannot end competition" });
      }
      const longestUrl = await uploadCard("longest", "longest", longest[0], undefined, "Champion");
      const straightUrl = await uploadCard("straightest", "straightest", straightest[0], undefined, "Champion");
      updatePayload.longest_winner_player_id = longest[0].playerId;
      updatePayload.longest_winner_value = longest[0].value;
      updatePayload.straightest_winner_player_id = straightest[0].playerId;
      updatePayload.straightest_winner_value = straightest[0].value;
      updatePayload.longest_card_url = longestUrl;
      updatePayload.straightest_card_url = straightUrl;
      const runnersUp: Record<string, unknown> = {};
      if (longest[1]) {
        runnersUp.longest = await buildPlaceEntry("longest-runner", "longest", longest[1], undefined, "Runner-Up Champion");
      }
      if (straightest[1]) {
        runnersUp.straightest = await buildPlaceEntry("straightest-runner", "straightest", straightest[1], undefined, "Runner-Up Champion");
      }
      updatePayload.runners_up = runnersUp;
      auditDetails.longest = { player_id: longest[0].playerId, value: longest[0].value };
      auditDetails.straightest = { player_id: straightest[0].playerId, value: straightest[0].value };
      auditDetails.runners_up = runnersUp;
    }

    const { data: updated, error: upErr } = await admin
      .from("quick_competitions")
      .update(updatePayload)
      .eq("id", competitionId)
      .select()
      .single();
    if (upErr) return ok({ success: false, error: upErr.message });

    await admin.from("quick_competition_audit").insert({
      competition_id: competitionId,
      actor_id: userId,
      action: "end",
      details: auditDetails,
    });

    return ok({ success: true, competition: updated });
  } catch (e) {
    console.error("end-competition error", e);
    return ok({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});
