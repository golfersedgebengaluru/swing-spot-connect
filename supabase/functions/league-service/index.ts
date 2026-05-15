import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'node:crypto'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function err(message: string, status = 400) {
  return json({ error: message }, status)
}

// ── Auth helper ──────────────────────────────────────────────
async function getUser(req: Request, supabaseAdmin: any) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  return user
}

// ── Audit helper ─────────────────────────────────────────────
async function audit(
  supabase: any,
  tenantId: string,
  leagueId: string | null,
  actorId: string,
  actorRole: string,
  action: string,
  entityType: string,
  entityId: string | null,
  beforeData: any,
  afterData: any
) {
  await supabase.from('league_audit_log').insert({
    tenant_id: tenantId,
    league_id: leagueId,
    actor_id: actorId,
    actor_role: actorRole,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_data: beforeData,
    after_data: afterData,
  })
}

// ── Feed emit helper ─────────────────────────────────────────
async function emitFeed(
  supabase: any,
  tenantId: string,
  leagueId: string,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown> = {}
) {
  await supabase.from('league_feed_items').insert({
    tenant_id: tenantId,
    league_id: leagueId,
    actor_id: actorId,
    event_type: eventType,
    payload,
  })
}

// ── Role check helpers ───────────────────────────────────────
async function getUserLeagueRole(supabase: any, userId: string, tenantId: string): Promise<string | null> {
  // Check system admin first
  const { data: isSystemAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: userId })
  if (isSystemAdmin) return 'site_admin'

  const { data: roles } = await supabase
    .from('league_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)

  if (!roles || roles.length === 0) return null

  // Return highest privilege
  const roleOrder = ['franchise_admin', 'league_admin', 'player']
  for (const r of roleOrder) {
    if (roles.some((lr: any) => lr.role === r)) return r
  }
  return null
}

// ── Join code generator ──────────────────────────────────────
function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => chars[b % chars.length]).join('')
}

// ── URL validation (prevent open redirect) ───────────────────
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

// ── Hidden-holes sanitizer ───────────────────────────────────
// Detects stale rows where the saved selection no longer matches the league's
// current scoring_holes (e.g., league was switched from 18 → 9 after holes were
// already chosen, or count is wrong / out-of-range). Returns the row with
// hidden_holes nulled out and a `needs_reroll: true` flag so the UI can prompt
// the admin to re-randomize using the corrected logic.
function sanitizeHiddenHoles(row: any, scoringHoles: number) {
  if (!row) return row
  const expected = scoringHoles === 9 ? 3 : 6
  const holes = Array.isArray(row.hidden_holes) ? row.hidden_holes : []
  const inRange = holes.every((h: any) => Number.isInteger(h) && h >= 1 && h <= scoringHoles)
  const validCount = holes.length === expected
  if (!validCount || !inRange) {
    return { ...row, hidden_holes: null, needs_reroll: true }
  }
  return { ...row, needs_reroll: false }
}

// ── Route parser ─────────────────────────────────────────────
interface Route {
  action: string
  leagueId?: string
  subResource?: string
  bookingId?: string
  subId?: string
}

function parseRoute(url: URL): Route {
  const segments = url.pathname.split('/').filter(Boolean)
  const resource = segments[1] || ''

  if (resource === 'join') return { action: 'join' }
  if (resource === 'tenants') {
    const tenantId = segments[2]
    if (tenantId) return { action: 'tenant-detail', leagueId: tenantId }
    return { action: 'tenants' }
  }
  if (resource === 'bays') return { action: 'bays' }
  if (resource === 'leagues') {
    const leagueId = segments[2]
    const subResource = segments[3]
    if (!leagueId) return { action: 'leagues' }
    if (!subResource) return { action: 'league-detail', leagueId }
    // /leagues/:id/bay-bookings/:bookingId
    if (subResource === 'bay-bookings' && segments[4]) {
      return { action: 'league-bay-booking-detail', leagueId, subResource, bookingId: segments[4] }
    }
    // /leagues/:id/players/:playerId/assign  (must come before /players/:playerId)
    if (subResource === 'players' && segments[4] && segments[5] === 'assign') {
      return { action: 'league-player-assign', leagueId, subResource, bookingId: segments[4] }
    }
    // /leagues/:id/players/:playerId
    if (subResource === 'players' && segments[4]) {
      return { action: 'league-player-detail', leagueId, subResource, bookingId: segments[4] }
    }
    // /leagues/:id/teams/:teamId/members/:memberId
    if (subResource === 'teams' && segments[4] && segments[5] === 'members' && segments[6]) {
      return { action: 'league-team-member-detail', leagueId, subResource, subId: segments[4], bookingId: segments[6] }
    }
    // /leagues/:id/teams/:teamId/members
    if (subResource === 'teams' && segments[4] && segments[5] === 'members') {
      return { action: 'league-team-members', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/teams/:teamId/assign  (must come before /teams/:teamId)
    if (subResource === 'teams' && segments[4] && segments[5] === 'assign') {
      return { action: 'league-team-assign', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/teams/:teamId
    if (subResource === 'teams' && segments[4]) {
      return { action: 'league-team-detail', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/rounds/:roundId/competitions
    if (subResource === 'rounds' && segments[4] && segments[5] === 'competitions') {
      return { action: 'league-round-competitions', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/rounds/:roundId
    if (subResource === 'rounds' && segments[4]) {
      return { action: 'league-round-detail', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/hidden-holes/admin   (admin-only preview, regardless of revealed_at)
    if (subResource === 'hidden-holes' && segments[4] === 'admin') {
      return { action: 'league-hidden-holes-admin', leagueId, subResource }
    }
    // /leagues/:id/hidden-holes
    if (subResource === 'hidden-holes') {
      return { action: 'league-hidden-holes', leagueId, subResource }
    }
    // /leagues/:id/leaderboard
    if (subResource === 'leaderboard') {
      return { action: 'league-leaderboard', leagueId, subResource }
    }
    // /leagues/:id/complete
    if (subResource === 'complete') {
      return { action: 'league-complete', leagueId, subResource }
    }
    // /leagues/:id/reopen
    if (subResource === 'reopen') {
      return { action: 'league-reopen', leagueId, subResource }
    }
    // /leagues/:id/wrap-up
    if (subResource === 'wrap-up') {
      return { action: 'league-wrap-up', leagueId, subResource }
    }
    // /leagues/:id/awards/:awardId
    if (subResource === 'awards' && segments[4]) {
      return { action: 'league-award-detail', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/awards
    if (subResource === 'awards') {
      return { action: 'league-awards', leagueId, subResource }
    }
    // /leagues/:id/recap-card/:playerId
    if (subResource === 'recap-card' && segments[4]) {
      return { action: 'league-recap-card', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/recap-card
    if (subResource === 'recap-card') {
      return { action: 'league-recap-card', leagueId, subResource }
    }
    // /leagues/:id/feed/:feedItemId/reactions
    if (subResource === 'feed' && segments[4] && segments[5] === 'reactions') {
      return { action: 'league-feed-reaction', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/feed
    if (subResource === 'feed') {
      return { action: 'league-feed', leagueId, subResource }
    }
    // /leagues/:id/cities/:cityId/locations/:locationId/bays/:bayId
    if (subResource === 'cities' && segments[4] && segments[5] === 'locations' && segments[6] && segments[7] === 'bays' && segments[8]) {
      return { action: 'league-location-bay-detail', leagueId, subResource, subId: segments[6], bookingId: segments[8] }
    }
    // /leagues/:id/cities/:cityId/locations/:locationId/bays
    if (subResource === 'cities' && segments[4] && segments[5] === 'locations' && segments[6] && segments[7] === 'bays') {
      return { action: 'league-location-bays', leagueId, subResource, subId: segments[6] }
    }
    // /leagues/:id/cities/:cityId/locations/:locationId
    if (subResource === 'cities' && segments[4] && segments[5] === 'locations' && segments[6]) {
      return { action: 'league-location-detail', leagueId, subResource, subId: segments[6] }
    }
    // /leagues/:id/cities/:cityId/locations
    if (subResource === 'cities' && segments[4] && segments[5] === 'locations') {
      return { action: 'league-city-locations', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/cities/:cityId
    if (subResource === 'cities' && segments[4]) {
      return { action: 'league-city-detail', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/cities
    if (subResource === 'cities') {
      return { action: 'league-cities', leagueId, subResource }
    }
    // ── Phase 2: legacy captain registration ──
    // /leagues/legacy/claim-invites and /leagues/legacy/claim-by-token (no leagueId)
    if (leagueId === 'legacy' && subResource === 'claim-invites') {
      return { action: 'legacy-claim-invites' }
    }
    if (leagueId === 'legacy' && subResource === 'claim-by-token') {
      return { action: 'legacy-claim-by-token' }
    }
    if (subResource === 'register-team-intent') {
      return { action: 'legacy-register-team-intent', leagueId, subResource }
    }
    if (subResource === 'verify-team-payment') {
      return { action: 'legacy-verify-team-payment', leagueId, subResource }
    }
    if (subResource === 'registered-teams') {
      return { action: 'legacy-registered-teams', leagueId, subResource }
    }
    if (subResource === 'my-team') {
      return { action: 'legacy-my-team', leagueId, subResource }
    }
    // /leagues/:id/screen → public bay-screen meta
    if (subResource === 'screen') {
      return { action: 'league-screen', leagueId, subResource }
    }
    // /leagues/:id/screen-leaderboard → public bay-screen leaderboard
    if (subResource === 'screen-leaderboard') {
      return { action: 'league-screen-leaderboard', leagueId, subResource }
    }
    return { action: `league-${subResource}`, leagueId, subResource }
  }
  return { action: 'unknown' }
}

// ── Leaderboard helper (shared with public bay-screen) ───────
async function computeLeaderboard(
  supabase: any,
  leagueId: string,
  opts: { round?: number | null; filter?: 'all' | 'individuals' | 'teams'; scope?: 'national' | 'city'; cityId?: string | null },
) {
  const filterParam = opts.filter || 'all'
  const scopeParam = opts.scope || 'national'
  const cityIdParam = opts.cityId || null
  const roundParam = opts.round ?? null

  const { data: league } = await supabase
    .from('leagues')
    .select('tenant_id, scoring_holes, fairness_factor_pct, team_aggregation_method, peoria_multiplier')
    .eq('id', leagueId)
    .single()
  if (!league) throw new Error('League not found')

  let cityScopedPlayerIds: Set<string> | null = null
  let cityScopedTeamIds: Set<string> | null = null
  if (scopeParam === 'city' && cityIdParam) {
    const { data: cityPlayers } = await supabase.from('league_players').select('user_id').eq('league_id', leagueId).eq('league_city_id', cityIdParam)
    cityScopedPlayerIds = new Set((cityPlayers || []).map((p: any) => p.user_id))
    const { data: cityTeams } = await supabase.from('league_teams').select('id').eq('league_id', leagueId).eq('league_city_id', cityIdParam)
    cityScopedTeamIds = new Set((cityTeams || []).map((t: any) => t.id))
  }

  let scoresQuery = supabase.from('league_scores').select('*').eq('league_id', leagueId)
  if (roundParam) scoresQuery = scoresQuery.eq('round_number', roundParam)
  const { data: scoresAll } = await scoresQuery
  const scores = cityScopedPlayerIds
    ? (scoresAll || []).filter((s: any) => cityScopedPlayerIds!.has(s.player_id))
    : (scoresAll || [])
  if (!scores || scores.length === 0) {
    return { entries: [], round: roundParam, filter: filterParam, scope: scopeParam, league_city_id: cityIdParam, handicap_active: false }
  }

  const hiddenHolesMap: Record<number, number[]> = {}
  const { data: allHH } = await supabase.from('league_round_hidden_holes').select('*').eq('league_id', leagueId)
  for (const hh of (allHH || [])) {
    if (hh.revealed_at) hiddenHolesMap[hh.round_number] = hh.hidden_holes as number[]
  }

  const { data: allRounds } = await supabase
    .from('league_rounds')
    .select('round_number, par_per_hole')
    .eq('league_id', leagueId)
  const roundParMap: Record<number, number> = {}
  for (const r of (allRounds || [])) {
    const arr = (r.par_per_hole as number[]) || []
    roundParMap[r.round_number] = arr.reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0)
  }

  const HC_MULTIPLIER = 3
  const fairnessPct = Number(league.fairness_factor_pct) || 0
  const aggregation = league.team_aggregation_method || 'best_ball'

  interface PlayerScoreEntry {
    player_id: string
    round_number: number
    gross_score: number
    net_score: number
    hidden_hole_sum: number
    peoria_handicap: number
  }

  const playerScores: PlayerScoreEntry[] = []
  for (const score of scores) {
    const holeScores = score.hole_scores as number[]
    const grossScore = score.total_score || (holeScores ? holeScores.reduce((s: number, v: number) => s + (v || 0), 0) : 0)
    const hiddenHoles = hiddenHolesMap[score.round_number]
    const roundPar = roundParMap[score.round_number] || 0
    let netScore = grossScore
    let hiddenSum = 0
    let handicap = 0
    if (hiddenHoles && holeScores && holeScores.length > 0 && roundPar > 0) {
      hiddenSum = hiddenHoles.reduce((sum, holeNum) => sum + (holeScores[holeNum - 1] || 0), 0)
      handicap = (hiddenSum * HC_MULTIPLIER) - roundPar
      netScore = grossScore - handicap
    }
    playerScores.push({
      player_id: score.player_id,
      round_number: score.round_number,
      gross_score: grossScore,
      net_score: netScore,
      hidden_hole_sum: hiddenSum,
      peoria_handicap: handicap,
    })
  }

  const { data: teams } = await supabase.from('league_teams').select('id, name, max_roster_size').eq('league_id', leagueId)
  const { data: teamMembers } = await supabase.from('league_team_members').select('team_id, player_id').in('team_id', (teams || []).map((t: any) => t.id))
  const { data: playerRows } = await supabase.from('league_players').select('id, user_id, team_id').eq('league_id', leagueId)

  const playerIdToTeamId: Record<string, string> = {}
  for (const tm of (teamMembers || [])) {
    const playerRow = (playerRows || []).find((p: any) => p.id === tm.player_id)
    if (playerRow) playerIdToTeamId[playerRow.user_id] = tm.team_id
  }
  for (const p of (playerRows || [])) {
    if (p.team_id && !playerIdToTeamId[p.user_id]) {
      playerIdToTeamId[p.user_id] = p.team_id
    }
  }

  const allPlayerIds = [...new Set(playerScores.map((ps) => ps.player_id))]
  let profileMap: Record<string, string> = {}
  if (allPlayerIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('user_id, display_name').in('user_id', allPlayerIds)
    if (profiles) profileMap = Object.fromEntries(profiles.map((p: any) => [p.user_id, p.display_name || '']))
  }

  const teamMap: Record<string, string> = {}
  for (const t of (teams || [])) teamMap[t.id] = t.name

  type LeaderboardEntry = {
    type: 'individual' | 'team'
    id: string
    name: string
    team_name?: string
    total_gross: number
    total_net: number
    final_score: number
    total_par: number
    net_vs_par: number
    final_vs_par: number
    rounds_played: number
    breakdown: { round: number; gross: number; net: number; handicap: number; par: number; net_vs_par: number }[]
    members?: { player_id: string; name: string; net_score: number; gross_score: number; total_par: number; vs_par: number }[]
  }

  const entries: LeaderboardEntry[] = []
  const individualScores: Record<string, PlayerScoreEntry[]> = {}
  for (const ps of playerScores) {
    if (!individualScores[ps.player_id]) individualScores[ps.player_id] = []
    individualScores[ps.player_id].push(ps)
  }

  if (filterParam !== 'teams') {
    for (const [playerId, pScores] of Object.entries(individualScores)) {
      const totalGross = pScores.reduce((s, p) => s + p.gross_score, 0)
      const totalNet = pScores.reduce((s, p) => s + p.net_score, 0)
      const totalPar = pScores.reduce((s, p) => s + (roundParMap[p.round_number] || 0), 0)
      const teamId = playerIdToTeamId[playerId]
      entries.push({
        type: 'individual',
        id: playerId,
        name: profileMap[playerId] || playerId.slice(0, 8),
        team_name: teamId ? teamMap[teamId] : undefined,
        total_gross: totalGross,
        total_net: totalNet,
        final_score: totalNet,
        total_par: totalPar,
        net_vs_par: totalNet - totalPar,
        final_vs_par: totalNet - totalPar,
        rounds_played: pScores.length,
        breakdown: pScores.map((p) => {
          const par = roundParMap[p.round_number] || 0
          return { round: p.round_number, gross: p.gross_score, net: p.net_score, handicap: p.peoria_handicap, par, net_vs_par: p.net_score - par }
        }),
      })
    }
  }

  if (filterParam !== 'individuals' && teams && teams.length > 0) {
    for (const team of teams) {
      if (cityScopedTeamIds && !cityScopedTeamIds.has(team.id)) continue
      const memberUserIds = Object.entries(playerIdToTeamId)
        .filter(([, tid]) => tid === team.id)
        .map(([uid]) => uid)
      if (memberUserIds.length === 0) continue
      const roundNumbers = [...new Set(playerScores.map((ps) => ps.round_number))]
      let teamTotalNet = 0
      let teamTotalGross = 0
      let teamTotalPar = 0
      const teamBreakdown: { round: number; gross: number; net: number; handicap: number; par: number; net_vs_par: number }[] = []
      for (const rn of roundNumbers) {
        const memberScoresForRound = playerScores.filter(
          (ps) => memberUserIds.includes(ps.player_id) && ps.round_number === rn
        )
        if (memberScoresForRound.length === 0) continue
        let roundGross: number
        if (aggregation === 'best_ball') {
          const best = memberScoresForRound.reduce((a, b) => a.gross_score < b.gross_score ? a : b)
          roundGross = best.gross_score
        } else {
          roundGross = memberScoresForRound.reduce((s, p) => s + p.gross_score, 0) / memberScoresForRound.length
        }
        const roundHandicap = memberScoresForRound.reduce((s, p) => s + p.peoria_handicap, 0) / memberScoresForRound.length
        const roundNet = roundGross - roundHandicap
        const roundPar = roundParMap[rn] || 0
        teamTotalNet += roundNet
        teamTotalGross += roundGross
        teamTotalPar += roundPar
        teamBreakdown.push({
          round: rn,
          gross: Math.round(roundGross * 100) / 100,
          net: Math.round(roundNet * 100) / 100,
          handicap: Math.round(roundHandicap * 100) / 100,
          par: roundPar,
          net_vs_par: Math.round((roundNet - roundPar) * 100) / 100,
        })
      }
      const finalScore = teamTotalNet * (1 - fairnessPct / 100)
      const memberDetails = memberUserIds.map((uid) => {
        const ms = individualScores[uid] || []
        const net = ms.reduce((s, p) => s + p.net_score, 0)
        const gross = ms.reduce((s, p) => s + p.gross_score, 0)
        const par = ms.reduce((s, p) => s + (roundParMap[p.round_number] || 0), 0)
        return {
          player_id: uid,
          name: profileMap[uid] || uid.slice(0, 8),
          net_score: net,
          gross_score: gross,
          total_par: par,
          vs_par: net - par,
        }
      })
      entries.push({
        type: 'team',
        id: team.id,
        name: team.name,
        total_gross: Math.round(teamTotalGross * 100) / 100,
        total_net: Math.round(teamTotalNet * 100) / 100,
        final_score: Math.round(finalScore * 100) / 100,
        total_par: teamTotalPar,
        net_vs_par: Math.round((teamTotalNet - teamTotalPar) * 100) / 100,
        final_vs_par: Math.round((finalScore - teamTotalPar) * 100) / 100,
        rounds_played: teamBreakdown.length,
        breakdown: teamBreakdown,
        members: memberDetails,
      })
    }
  }

  entries.sort((a, b) => a.final_score - b.final_score)
  const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }))
  const handicapActive = Object.keys(hiddenHolesMap).length > 0
  return { entries: ranked, round: roundParam, filter: filterParam, scope: scopeParam, league_city_id: cityIdParam, handicap_active: handicapActive }
}

// ══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const url = new URL(req.url)
  const route = parseRoute(url)
  const method = req.method

  // ── PUBLIC BAY-SCREEN ROUTES (no auth) ──────────────────────
  try {
    if (route.action === 'league-screen' && route.leagueId && method === 'GET') {
      const { data: league } = await supabase
        .from('leagues')
        .select('id, name, status, leaderboard_visibility, tenant_id')
        .eq('id', route.leagueId)
        .single()
      if (!league) return err('League not found', 404)
      if (league.leaderboard_visibility !== 'public') return err('Leaderboard is not public', 403)
      const { data: branding } = await supabase
        .from('league_branding')
        .select('logo_url, sponsor_name, sponsor_logo_url, sponsor_url')
        .eq('league_id', route.leagueId)
        .maybeSingle()
      const { data: tenant } = await supabase
        .from('tenants')
        .select('default_logo_url, name')
        .eq('id', league.tenant_id)
        .maybeSingle()
      const { data: cities } = await supabase
        .from('league_cities')
        .select('id, name, display_order')
        .eq('league_id', route.leagueId)
        .order('display_order', { ascending: true })
      return json({
        league: { id: league.id, name: league.name, status: league.status },
        branding: {
          logo_url: branding?.logo_url || tenant?.default_logo_url || null,
          sponsor_name: branding?.sponsor_name || null,
          sponsor_logo_url: branding?.sponsor_logo_url || null,
          sponsor_url: branding?.sponsor_url || null,
        },
        cities: cities || [],
      })
    }

    if (route.action === 'league-screen-leaderboard' && route.leagueId && method === 'GET') {
      const { data: league } = await supabase
        .from('leagues')
        .select('id, leaderboard_visibility')
        .eq('id', route.leagueId)
        .single()
      if (!league) return err('League not found', 404)
      if (league.leaderboard_visibility !== 'public') return err('Leaderboard is not public', 403)
      const cityId = url.searchParams.get('league_city_id')
      const result = await computeLeaderboard(supabase, route.leagueId, {
        round: null,
        filter: (url.searchParams.get('filter') as any) || 'all',
        scope: cityId ? 'city' : 'national',
        cityId,
      })
      return json(result)
    }
  } catch (e) {
    return err((e as Error).message, 500)
  }

  const user = await getUser(req, supabase)
  if (!user) return err('Unauthorized', 401)

  try {
    // ── TENANTS ────────────────────────────────────────────
    if (route.action === 'tenants') {
      if (method === 'GET') {
        const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
        if (isAdmin) {
          const { data, error } = await supabase.from('tenants').select('*').order('name')
          if (error) return err(error.message, 500)
          return json(data)
        }
        // Return tenants user has roles in
        const { data: roles } = await supabase
          .from('league_roles')
          .select('tenant_id')
          .eq('user_id', user.id)
        const tenantIds = [...new Set((roles || []).map((r: any) => r.tenant_id))]
        if (tenantIds.length === 0) return json([])
        const { data, error } = await supabase.from('tenants').select('*').in('id', tenantIds)
        if (error) return err(error.message, 500)
        return json(data)
      }

      if (method === 'POST') {
        const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
        if (!isAdmin) return err('Only site admins can create tenants', 403)
        const body = await req.json()
        if (!body.name || !body.city) return err('name and city are required')

        // Validate city exists in bays
        const { data: bayCheck } = await supabase.from('bays').select('city').eq('city', body.city).limit(1)
        if (!bayCheck || bayCheck.length === 0) return err('City not found in the system')

        const { data, error } = await supabase.from('tenants').insert({
          name: body.name,
          city: body.city,
          sponsorship_enabled: body.sponsorship_enabled ?? false,
          default_logo_url: body.default_logo_url ?? null,
          config: body.config ?? {},
        }).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, data.id, null, user.id, 'site_admin', 'TenantCreated', 'tenant', data.id, null, data)
        return json(data, 201)
      }
      return err('Method not allowed', 405)
    }

    // ── TENANT DETAIL (PATCH) ────────────────────────────────
    if (route.action === 'tenant-detail') {
      if (method === 'PATCH') {
        const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
        if (!isAdmin) return err('Only site admins can update tenants', 403)
        const body = await req.json()
        const updates: Record<string, unknown> = {}
        if (typeof body.sponsorship_enabled === 'boolean') updates.sponsorship_enabled = body.sponsorship_enabled
        if (body.default_logo_url !== undefined) updates.default_logo_url = body.default_logo_url
        if (body.name) updates.name = body.name
        if (Object.keys(updates).length === 0) return err('No valid fields to update')
        updates.updated_at = new Date().toISOString()
        const { data: before } = await supabase.from('tenants').select('*').eq('id', route.leagueId).single()
        const { data, error } = await supabase.from('tenants').update(updates).eq('id', route.leagueId).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, route.leagueId!, null, user.id, 'site_admin', 'TenantUpdated', 'tenant', route.leagueId!, before, data)
        return json(data)
      }
      return err('Method not allowed', 405)
    }

    // ── LEAGUES LIST / CREATE ──────────────────────────────
    if (route.action === 'leagues') {
      const tenantId = url.searchParams.get('tenant_id')
      if (!tenantId) return err('tenant_id query param required')

      if (method === 'GET') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role) return err('No access to this tenant', 403)

        let query = supabase.from('leagues').select('*, league_branding(*)').eq('tenant_id', tenantId).order('created_at', { ascending: false })

        if (role === 'player') {
          // Only show leagues user is a player in
          const { data: memberships } = await supabase
            .from('league_players')
            .select('league_id')
            .eq('user_id', user.id)
          const leagueIds = (memberships || []).map((m: any) => m.league_id)
          if (leagueIds.length === 0) return json([])
          query = query.in('id', leagueIds)
        }

        const { data, error } = await query
        if (error) return err(error.message, 500)

        // Strip branding if sponsorship disabled
        const { data: tenant } = await supabase.from('tenants').select('sponsorship_enabled').eq('id', tenantId).single()
        const sponsorshipOn = tenant?.sponsorship_enabled ?? false
        const result = (data || []).map((l: any) => ({
          ...l,
          league_branding: sponsorshipOn ? l.league_branding : null,
        }))

        return json(result)
      }

      if (method === 'POST') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role || role === 'player') return err('Insufficient permissions', 403)

        const body = await req.json()
        if (!body.name) return err('name is required')

        const validFormats = ['stroke_play', 'match_play', 'stableford', 'scramble', 'best_ball', 'skins']
        if (body.format && !validFormats.includes(body.format)) return err('Invalid format')

        const { data, error } = await supabase.from('leagues').insert({
          tenant_id: tenantId,
          name: body.name,
          format: body.format || 'stroke_play',
          season_start: body.season_start ?? null,
          season_end: body.season_end ?? null,
          venue_id: body.venue_id ?? null,
          status: 'draft',
          score_entry_method: body.score_entry_method || 'not_set',
          allowed_team_sizes: Array.isArray(body.allowed_team_sizes) ? body.allowed_team_sizes : [],
          show_on_landing: body.show_on_landing === true,
          price_per_person: typeof body.price_per_person === 'number' ? body.price_per_person : 0,
          currency: body.currency || 'INR',
          payment_city: typeof body.payment_city === 'string' && body.payment_city.trim() ? body.payment_city.trim() : null,
          created_by: user.id,
        }).select().single()

        if (error) return err(error.message, 500)

        // Auto-assign league_admin role to creator if they aren't franchise_admin
        if (role !== 'site_admin' && role !== 'franchise_admin') {
          await supabase.from('league_roles').insert({
            user_id: user.id,
            tenant_id: tenantId,
            league_id: data.id,
            role: 'league_admin',
          })
        }

        await audit(supabase, tenantId, data.id, user.id, role, 'LeagueCreated', 'league', data.id, null, data)
        return json(data, 201)
      }
      return err('Method not allowed', 405)
    }

    // ── LEAGUE DETAIL / UPDATE ─────────────────────────────
    if (route.action === 'league-detail' && route.leagueId) {
      const { data: league, error: lErr } = await supabase.from('leagues').select('*, league_branding(*)').eq('id', route.leagueId).single()
      if (lErr || !league) return err('League not found', 404)
      const tenantId = league.tenant_id

      if (method === 'GET') {
        const { data: tenant } = await supabase.from('tenants').select('sponsorship_enabled, default_logo_url').eq('id', tenantId).single()
        const sponsorshipOn = tenant?.sponsorship_enabled ?? false

        // Resolve logo: league branding → tenant default → none
        let resolvedLogo = null
        if (sponsorshipOn && league.league_branding?.logo_url) {
          resolvedLogo = league.league_branding.logo_url
        } else if (tenant?.default_logo_url) {
          resolvedLogo = tenant.default_logo_url
        }

        return json({
          ...league,
          league_branding: sponsorshipOn ? league.league_branding : null,
          resolved_logo_url: resolvedLogo,
        })
      }

      if (method === 'PATCH') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role || role === 'player') return err('Insufficient permissions', 403)

        const body = await req.json()
        const before = { ...league }
        delete before.league_branding

        const validStatuses = ['draft', 'active', 'completed', 'archived']
        if (body.status && !validStatuses.includes(body.status)) return err('Invalid status')

        // Enforce status transitions
        if (body.status) {
          const transitions: Record<string, string[]> = {
            draft: ['active'],
            active: ['draft', 'completed'],
            completed: ['active', 'archived'],
            archived: ['completed'],
          }
          if (!transitions[league.status]?.includes(body.status)) {
            return err(`Cannot transition from ${league.status} to ${body.status}`)
          }
        }

        const updates: Record<string, any> = {}
        const allowed = ['name', 'format', 'season_start', 'season_end', 'venue_id', 'status', 'score_entry_method', 'scoring_holes', 'fairness_factor_pct', 'team_aggregation_method', 'peoria_multiplier', 'allowed_team_sizes', 'show_on_landing', 'price_per_person', 'currency', 'payment_city']
        for (const key of allowed) {
          if (body[key] !== undefined) updates[key] = body[key]
        }

        const { data: updated, error } = await supabase
          .from('leagues')
          .update(updates)
          .eq('id', route.leagueId)
          .select()
          .single()

        if (error) return err(error.message, 500)

        const action = body.status ? 'LeagueStatusChanged' : 'LeagueUpdated'
        await audit(supabase, tenantId, route.leagueId, user.id, role!, action, 'league', route.leagueId, before, updated)
        return json(updated)
      }

      if (method === 'DELETE') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (role !== 'site_admin' && role !== 'franchise_admin') return err('Only admins can delete leagues', 403)
        const before = { ...league }
        delete before.league_branding
        const { error: delErr } = await supabase.from('leagues').delete().eq('id', route.leagueId)
        if (delErr) return err(delErr.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'LeagueDeleted', 'league', route.leagueId, before, null)
        return json({ success: true })
      }
      return err('Method not allowed', 405)
    }

    // ── JOIN CODES ─────────────────────────────────────────
    if (route.action === 'league-join-codes' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id

      if (method === 'GET') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role || role === 'player') return err('Insufficient permissions', 403)
        const { data, error } = await supabase.from('league_join_codes').select('*').eq('league_id', route.leagueId).order('created_at', { ascending: false })
        if (error) return err(error.message, 500)
        return json(data)
      }

      if (method === 'POST') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role || role === 'player') return err('Insufficient permissions', 403)

        const body = await req.json().catch(() => ({}))
        const expiresAt = body.expires_at ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        const maxUses = body.max_uses ?? 100

        // Validate team_id if provided
        if (body.team_id) {
          const { data: teamCheck } = await supabase.from('league_teams').select('id').eq('id', body.team_id).eq('league_id', route.leagueId).single()
          if (!teamCheck) return err('Team not found in this league', 404)
        }

        const code = generateCode()
        const { data, error } = await supabase.from('league_join_codes').insert({
          league_id: route.leagueId,
          code,
          expires_at: expiresAt,
          max_uses: maxUses,
          created_by: user.id,
          team_id: body.team_id ?? null,
        }).select().single()

        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'JoinCodeCreated', 'join_code', data.id, null, data)
        return json(data, 201)
      }

      // Revoke a code: DELETE /leagues/:id/join-codes?code_id=xxx
      if (method === 'DELETE') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role || role === 'player') return err('Insufficient permissions', 403)

        const codeId = url.searchParams.get('code_id')
        if (!codeId) return err('code_id query param required')

        const { data: before } = await supabase.from('league_join_codes').select('*').eq('id', codeId).single()
        const { error } = await supabase.from('league_join_codes').update({ revoked_at: new Date().toISOString() }).eq('id', codeId)
        if (error) return err(error.message, 500)

        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'JoinCodeRevoked', 'join_code', codeId, before, { ...before, revoked_at: new Date().toISOString() })
        return json({ success: true })
      }
      return err('Method not allowed', 405)
    }

    // ── JOIN (redeem code) ─────────────────────────────────
    if (route.action === 'join' && method === 'POST') {
      const body = await req.json()
      if (!body.code) return err('code is required')

      const { data: joinCode, error: cErr } = await supabase
        .from('league_join_codes')
        .select('*, leagues!inner(tenant_id, status)')
        .eq('code', body.code.toUpperCase().trim())
        .is('revoked_at', null)
        .single()

      if (cErr || !joinCode) return err('Invalid or expired join code', 404)

      // Validate code
      if (joinCode.expires_at && new Date(joinCode.expires_at) < new Date()) {
        return err('Join code has expired')
      }
      if (joinCode.use_count >= joinCode.max_uses) {
        return err('Join code has reached max uses')
      }
      if (joinCode.leagues.status !== 'active' && joinCode.leagues.status !== 'draft') {
        return err('League is not accepting new players')
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from('league_players')
        .select('id')
        .eq('league_id', joinCode.league_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (existing) return err('Already a member of this league')

      // Join
      const insertData: any = {
        league_id: joinCode.league_id,
        user_id: user.id,
        joined_via_code_id: joinCode.id,
        team_id: joinCode.team_id ?? null,
      }
      const { data: player, error: jErr } = await supabase.from('league_players').insert(insertData).select().single()

      if (jErr) return err(jErr.message, 500)

      // If team join code, also add to league_team_members
      if (joinCode.team_id) {
        // Check roster size
        const { data: team } = await supabase.from('league_teams').select('max_roster_size').eq('id', joinCode.team_id).single()
        const { count } = await supabase.from('league_team_members').select('id', { count: 'exact', head: true }).eq('team_id', joinCode.team_id)
        if (team && count !== null && count >= team.max_roster_size) {
          // Rollback player insert
          await supabase.from('league_players').delete().eq('id', player.id)
          return err('Team roster is full')
        }
        await supabase.from('league_team_members').insert({
          team_id: joinCode.team_id,
          player_id: player.id,
          assigned_by: user.id,
        })
      }

      // Increment use count
      await supabase.from('league_join_codes').update({ use_count: joinCode.use_count + 1 }).eq('id', joinCode.id)

      // Assign player role
      const tenantId = joinCode.leagues.tenant_id
      await supabase.from('league_roles').upsert({
        user_id: user.id,
        tenant_id: tenantId,
        league_id: joinCode.league_id,
        role: 'player',
      }, { onConflict: 'user_id,tenant_id,league_id,role' })

      await audit(supabase, tenantId, joinCode.league_id, user.id, 'player', 'PlayerJoined', 'league_player', player.id, null, { ...player, team_id: joinCode.team_id ?? null })
      await emitFeed(supabase, tenantId, joinCode.league_id, user.id, 'player_joined', { team_id: joinCode.team_id ?? null })
      return json({ success: true, league_id: joinCode.league_id, team_id: joinCode.team_id ?? null }, 201)
    }

    // ── SCORES ─────────────────────────────────────────────
    if (route.action === 'league-scores' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id, status').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id

      if (method === 'GET') {
        const roundNumber = url.searchParams.get('round')
        let query = supabase.from('league_scores').select('*').eq('league_id', route.leagueId).order('total_score', { ascending: true })
        if (roundNumber) query = query.eq('round_number', parseInt(roundNumber))
        const { data, error } = await query
        if (error) return err(error.message, 500)

        // Enrich with player names from profiles
        const playerIds = [...new Set((data || []).map((s: any) => s.player_id))]
        let profileMap: Record<string, string> = {}
        if (playerIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, display_name')
            .in('user_id', playerIds)
          if (profiles) {
            profileMap = Object.fromEntries(profiles.map((p: any) => [p.user_id, p.display_name || '']))
          }
        }

        const enriched = (data || []).map((s: any) => ({
          ...s,
          player_name: profileMap[s.player_id] || null,
        }))

        return json(enriched)
      }

      if (method === 'POST') {
        if (league.status !== 'active') return err('League is not active')

        const body = await req.json()
        if (!body.hole_scores && !body.total_score) return err('hole_scores or total_score required')

        const method_val = body.method || 'manual'
        const validMethods = ['photo_ocr', 'manual', 'api']
        if (!validMethods.includes(method_val)) return err('Invalid score method')

        // Determine target player. Admins can submit on behalf of others by passing player_id.
        let targetPlayerId = user.id
        let actorRole: string = 'player'
        if (body.player_id && body.player_id !== user.id) {
          const role = await getUserLeagueRole(supabase, user.id, tenantId)
          if (role !== 'franchise_admin' && role !== 'site_admin' && role !== 'league_admin') {
            return err('Only admins can submit scores for other players', 403)
          }
          // Verify target player belongs to this league
          const { data: lp } = await supabase.from('league_players').select('user_id').eq('league_id', route.leagueId).eq('user_id', body.player_id).maybeSingle()
          if (!lp) return err('Target player is not in this league', 404)
          targetPlayerId = body.player_id
          actorRole = role
        }

        // Apply per-hole cap (project rule: max +4 over par per hole) for gross-stroke formats only.
        // Stableford / match_play encode different per-hole semantics so we skip the cap there.
        let holeScores: number[] = Array.isArray(body.hole_scores) ? [...body.hole_scores] : []
        const STROKE_FORMATS = ['stroke_play', 'scramble', 'best_ball', 'skins']
        if (holeScores.length > 0 && body.round_number) {
          const { data: leagueFmt } = await supabase.from('leagues').select('format').eq('id', route.leagueId).single()
          if (leagueFmt && STROKE_FORMATS.includes(leagueFmt.format)) {
            const { data: roundRow } = await supabase
              .from('league_rounds')
              .select('par_per_hole')
              .eq('league_id', route.leagueId)
              .eq('round_number', body.round_number)
              .maybeSingle()
            const parPerHole = (roundRow?.par_per_hole as number[] | null) || []
            if (parPerHole.length > 0) {
              const MAX_OVER_PAR = 4
              holeScores = holeScores.map((s, i) => {
                const par = parPerHole[i]
                if (!par || par <= 0 || !Number.isFinite(s) || s <= 0) return s
                return Math.min(s, par + MAX_OVER_PAR)
              })
            }
          }
        }

        // Calculate total from (possibly capped) holes
        let totalScore = body.total_score
        if (holeScores.length > 0) {
          totalScore = holeScores.reduce((sum: number, s: number) => sum + (s || 0), 0)
        }

        const { data: score, error: sErr } = await supabase.from('league_scores').insert({
          league_id: route.leagueId,
          player_id: targetPlayerId,
          tenant_id: tenantId,
          round_number: body.round_number || 1,
          hole_scores: holeScores,
          total_score: totalScore,
          method: method_val,
          photo_url: body.photo_url ?? null,
          confirmed_at: method_val === 'manual' ? new Date().toISOString() : null,
          submitted_by: user.id,
        }).select().single()

        if (sErr) return err(sErr.message, 500)

        await audit(supabase, tenantId, route.leagueId, user.id, actorRole, 'ScoreSubmitted', 'league_score', score.id, null, score)
        await emitFeed(supabase, tenantId, route.leagueId, user.id, 'score_submitted', { total_score: score.total_score, round_number: score.round_number, method: method_val, player_id: targetPlayerId })
        return json(score, 201)
      }

      // Confirm OCR score
      if (method === 'PATCH') {
        const body = await req.json()
        if (!body.score_id) return err('score_id is required')

        const { data: before } = await supabase.from('league_scores').select('*').eq('id', body.score_id).single()
        if (!before) return err('Score not found', 404)
        if (before.player_id !== user.id) return err('Can only confirm own scores', 403)
        if (before.confirmed_at) return err('Score already confirmed')

        const updates: Record<string, any> = { confirmed_at: new Date().toISOString() }
        if (body.hole_scores) {
          updates.hole_scores = body.hole_scores
          updates.total_score = body.hole_scores.reduce((sum: number, s: number) => sum + (s || 0), 0)
        }

        const { data: updated, error } = await supabase.from('league_scores').update(updates).eq('id', body.score_id).select().single()
        if (error) return err(error.message, 500)

        await audit(supabase, tenantId, route.leagueId, user.id, 'player', 'ScoreConfirmed', 'league_score', body.score_id, before, updated)
        return json(updated)
      }
      return err('Method not allowed', 405)
    }

    // ── BRANDING ───────────────────────────────────────────
    if (route.action === 'league-branding' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id

      // Check sponsorship enabled
      const { data: tenant } = await supabase.from('tenants').select('sponsorship_enabled').eq('id', tenantId).single()
      if (!tenant?.sponsorship_enabled) return err('Sponsorship is not enabled for this tenant', 403)

      if (method === 'GET') {
        const { data, error } = await supabase.from('league_branding').select('*').eq('league_id', route.leagueId).maybeSingle()
        if (error) return err(error.message, 500)
        return json(data)
      }

      if (method === 'PUT') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role || role === 'player') return err('Insufficient permissions', 403)

        const body = await req.json()

        // Validate sponsor_url if provided
        if (body.sponsor_url && !isSafeUrl(body.sponsor_url)) {
          return err('Invalid sponsor URL')
        }

        const brandingData = {
          league_id: route.leagueId,
          logo_url: body.logo_url ?? null,
          sponsor_name: body.sponsor_name ?? null,
          sponsor_logo_url: body.sponsor_logo_url ?? null,
          sponsor_url: body.sponsor_url ?? null,
          placement_slots: body.placement_slots ?? [],
          valid_from: body.valid_from ?? null,
          valid_to: body.valid_to ?? null,
        }

        // Upsert branding
        const { data: existing } = await supabase.from('league_branding').select('*').eq('league_id', route.leagueId).maybeSingle()

        let result
        if (existing) {
          const { data, error } = await supabase.from('league_branding').update(brandingData).eq('league_id', route.leagueId).select().single()
          if (error) return err(error.message, 500)
          await audit(supabase, tenantId, route.leagueId, user.id, role!, 'BrandingUpdated', 'league_branding', data.id, existing, data)
          result = data
        } else {
          const { data, error } = await supabase.from('league_branding').insert(brandingData).select().single()
          if (error) return err(error.message, 500)
          await audit(supabase, tenantId, route.leagueId, user.id, role!, 'BrandingCreated', 'league_branding', data.id, null, data)
          result = data
        }

        return json(result)
      }
      return err('Method not allowed', 405)
    }

    // ── BAYS (for tenant's city) ──────────────────────────
    if (route.action === 'bays' && method === 'GET') {
      const tenantId = url.searchParams.get('tenant_id')
      if (!tenantId) return err('tenant_id query param required')

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role) return err('No access to this tenant', 403)

      const { data: tenant } = await supabase.from('tenants').select('city').eq('id', tenantId).single()
      if (!tenant?.city) return json([])

      const { data: bays, error } = await supabase
        .from('bays')
        .select('id, name, city, is_active')
        .eq('city', tenant.city)
        .eq('is_active', true)
        .order('sort_order')
      if (error) return err(error.message, 500)
      return json(bays)
    }

    // ── BAY BOOKINGS ─────────────────────────────────────────
    if (route.action === 'league-bay-bookings' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id, venue_id, status').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id

      // GET: list bookings for this league, optionally filtered by date
      if (method === 'GET') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role) return err('No access', 403)

        const dateParam = url.searchParams.get('date') // YYYY-MM-DD
        let query = supabase
          .from('league_bay_bookings')
          .select('*')
          .eq('league_id', route.leagueId)
          .eq('status', 'confirmed')
          .order('scheduled_at')

        if (dateParam) {
          query = query
            .gte('scheduled_at', `${dateParam}T00:00:00Z`)
            .lt('scheduled_at', `${dateParam}T23:59:59Z`)
        }

        const { data, error } = await query
        if (error) return err(error.message, 500)

        // Strip player details for non-admin roles (privacy)
        if (role === 'player') {
          const sanitized = (data || []).map((b: any) => ({
            ...b,
            players: b.players?.map(() => 'player'), // hide UUIDs
            booked_by: b.booked_by === user.id ? b.booked_by : 'hidden',
          }))
          return json(sanitized)
        }
        return json(data)
      }

      // POST: create a booking
      if (method === 'POST') {
        if (league.status !== 'active') return err('League is not active')

        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role) return err('No access', 403)

        const body = await req.json()
        if (!body.bay_id || !body.scheduled_at) return err('bay_id and scheduled_at are required')

        const durationMinutes = body.duration_minutes || 60
        const scheduledAt = new Date(body.scheduled_at)
        const scheduledEnd = new Date(scheduledAt.getTime() + durationMinutes * 60000)

        // Validate bay belongs to tenant's city
        const { data: tenant } = await supabase.from('tenants').select('city').eq('id', tenantId).single()
        const { data: bay } = await supabase.from('bays').select('id, city').eq('id', body.bay_id).single()
        if (!bay || bay.city !== tenant?.city) return err('Bay not available for this tenant')

        // If league has venue_id, enforce it
        if (league.venue_id && bay.id !== league.venue_id) {
          return err('Bay is not the designated venue for this league')
        }

        // Check for blocks
        const { data: blocks } = await supabase
          .from('league_bay_blocks')
          .select('id')
          .eq('bay_id', body.bay_id)
          .eq('tenant_id', tenantId)
          .lt('blocked_from', scheduledEnd.toISOString())
          .gt('blocked_to', scheduledAt.toISOString())
          .limit(1)
        if (blocks && blocks.length > 0) return err('Bay is blocked during this time')

        const isAdmin = role !== 'player'
        const bookingMethod = isAdmin && body.booking_method === 'admin_assigned' ? 'admin_assigned' : 'player_self'
        const players = body.players || [user.id]
        const maxPlayers = body.max_players || 4

        if (players.length > maxPlayers) return err('Too many players for this slot')

        // Insert — DB exclusion constraint prevents double-booking
        const { data: booking, error: bErr } = await supabase.from('league_bay_bookings').insert({
          league_id: route.leagueId,
          bay_id: body.bay_id,
          tenant_id: tenantId,
          scheduled_at: scheduledAt.toISOString(),
          scheduled_end: scheduledEnd.toISOString(),
          duration_minutes: durationMinutes,
          booked_by: user.id,
          booking_method: bookingMethod,
          players,
          max_players: maxPlayers,
          notes: body.notes ?? null,
        }).select().single()

        if (bErr) {
          if (bErr.message?.includes('no_overlapping_bay_bookings')) {
            return err('This bay is already booked for the selected time', 409)
          }
          return err(bErr.message, 500)
        }

        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'BayBookingCreated', 'league_bay_booking', booking.id, null, booking)

        // Notification for the booker
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'Bay Booking Confirmed',
          message: `Your bay booking is confirmed for ${scheduledAt.toLocaleDateString()}.`,
          type: 'league',
        })

        return json(booking, 201)
      }

      return err('Method not allowed', 405)
    }

    // ── BAY BOOKING DETAIL (join / cancel / reschedule) ────
    if (route.action === 'league-bay-booking-detail' && route.leagueId && route.bookingId) {
      const { data: booking } = await supabase.from('league_bay_bookings').select('*').eq('id', route.bookingId).single()
      if (!booking) return err('Booking not found', 404)
      if (booking.league_id !== route.leagueId) return err('Booking not in this league', 400)

      const tenantId = booking.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role) return err('No access', 403)
      const isAdmin = role !== 'player'

      // POST /leagues/:id/bay-bookings/:bookingId?action=join
      // POST /leagues/:id/bay-bookings/:bookingId?action=cancel
      // PATCH /leagues/:id/bay-bookings/:bookingId (reschedule — admin only)
      if (method === 'POST') {
        const actionParam = url.searchParams.get('action')

        if (actionParam === 'join') {
          if (booking.status !== 'confirmed') return err('Booking is cancelled')
          if (booking.players.includes(user.id)) return err('Already in this booking')
          if (booking.players.length >= booking.max_players) return err('Booking is full')

          const updatedPlayers = [...booking.players, user.id]
          const { data: updated, error } = await supabase
            .from('league_bay_bookings')
            .update({ players: updatedPlayers })
            .eq('id', route.bookingId)
            .select().single()
          if (error) return err(error.message, 500)

          await audit(supabase, tenantId, route.leagueId, user.id, role!, 'PlayerJoinedBayBooking', 'league_bay_booking', route.bookingId, booking, updated)
          return json(updated)
        }

        if (actionParam === 'cancel') {
          // Players can only cancel own bookings; admins can cancel any
          if (!isAdmin && booking.booked_by !== user.id) return err('Can only cancel own bookings', 403)
          if (booking.status === 'cancelled') return err('Already cancelled')

          const { data: updated, error } = await supabase
            .from('league_bay_bookings')
            .update({ status: 'cancelled' })
            .eq('id', route.bookingId)
            .select().single()
          if (error) return err(error.message, 500)

          await audit(supabase, tenantId, route.leagueId, user.id, role!, isAdmin ? 'AdminCancelledBayBooking' : 'PlayerCancelledBayBooking', 'league_bay_booking', route.bookingId, booking, updated)

          // Notify affected players (without exposing personal details)
          for (const playerId of booking.players) {
            if (playerId === user.id) continue
            await supabase.from('notifications').insert({
              user_id: playerId,
              title: 'Bay Booking Cancelled',
              message: isAdmin
                ? 'An admin has cancelled your bay booking. Please check your schedule.'
                : 'A bay booking you were part of has been cancelled.',
              type: 'league',
            })
          }

          return json(updated)
        }

        return err('Unknown action. Use ?action=join or ?action=cancel')
      }

      // PATCH: reschedule (admin only)
      if (method === 'PATCH') {
        if (!isAdmin) return err('Only admins can reschedule', 403)
        if (booking.status === 'cancelled') return err('Cannot reschedule cancelled booking')

        const body = await req.json()
        if (!body.scheduled_at) return err('scheduled_at is required')

        const newStart = new Date(body.scheduled_at)
        const duration = body.duration_minutes || booking.duration_minutes
        const newEnd = new Date(newStart.getTime() + duration * 60000)

        // Cancel old, create new (to respect exclusion constraint)
        await supabase.from('league_bay_bookings').update({ status: 'cancelled' }).eq('id', route.bookingId)

        const { data: newBooking, error: nErr } = await supabase.from('league_bay_bookings').insert({
          league_id: route.leagueId,
          bay_id: body.bay_id || booking.bay_id,
          tenant_id: tenantId,
          scheduled_at: newStart.toISOString(),
          scheduled_end: newEnd.toISOString(),
          duration_minutes: duration,
          booked_by: user.id,
          booking_method: 'admin_assigned',
          players: booking.players,
          max_players: booking.max_players,
          notes: body.notes ?? booking.notes,
        }).select().single()

        if (nErr) {
          // Revert cancel if new booking fails
          await supabase.from('league_bay_bookings').update({ status: 'confirmed' }).eq('id', route.bookingId)
          if (nErr.message?.includes('no_overlapping_bay_bookings')) {
            return err('New time slot conflicts with existing booking', 409)
          }
          return err(nErr.message, 500)
        }

        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'AdminRescheduledBayBooking', 'league_bay_booking', newBooking.id, booking, newBooking)

        // Notify players
        for (const playerId of booking.players) {
          await supabase.from('notifications').insert({
            user_id: playerId,
            title: 'Bay Booking Rescheduled',
            message: 'An admin has rescheduled your bay booking. Please check your updated schedule.',
            type: 'league',
          })
        }

        return json(newBooking)
      }

      return err('Method not allowed', 405)
    }

    // ── PLAYERS (list / add / remove) ───────────────────────
    if (route.action === 'league-players' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role || role === 'player') return err('Insufficient permissions', 403)

      // GET: list players with profile info
      if (method === 'GET') {
        const { data: players, error: pErr } = await supabase
          .from('league_players')
          .select('id, league_id, user_id, joined_via_code_id, joined_at, league_city_id, league_location_id, team_id')
          .eq('league_id', route.leagueId)
          .order('joined_at')
        if (pErr) return err(pErr.message, 500)

        // Resolve profile info for each player
        const userIds = (players || []).map((p: any) => p.user_id)
        let profiles: any[] = []
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, display_name, email')
            .in('user_id', userIds)
          profiles = profs || []
        }

        // Resolve team city/location for players that belong to a team
        const teamIds = Array.from(new Set((players || []).map((p: any) => p.team_id).filter(Boolean)))
        let teamMap = new Map<string, any>()
        if (teamIds.length > 0) {
          const { data: teamRows } = await supabase
            .from('league_teams')
            .select('id, name, league_city_id, league_location_id')
            .in('id', teamIds)
          teamMap = new Map((teamRows || []).map((t: any) => [t.id, t]))
        }

        const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]))
        const enriched = (players || []).map((p: any) => {
          const team = p.team_id ? teamMap.get(p.team_id) : null
          return {
            ...p,
            display_name: profileMap.get(p.user_id)?.display_name || null,
            email: profileMap.get(p.user_id)?.email || null,
            team_name: team?.name || null,
            team_city_id: team?.league_city_id || null,
            team_location_id: team?.league_location_id || null,
          }
        })

        return json(enriched)
      }

      // POST: admin adds a player by user_id
      if (method === 'POST') {
        const body = await req.json()
        if (!body.user_id) return err('user_id is required')

        // Check if already a member
        const { data: existing } = await supabase
          .from('league_players')
          .select('id')
          .eq('league_id', route.leagueId)
          .eq('user_id', body.user_id)
          .maybeSingle()
        if (existing) return err('User is already a member of this league')

        const { data: player, error: jErr } = await supabase.from('league_players').insert({
          league_id: route.leagueId,
          user_id: body.user_id,
        }).select().single()
        if (jErr) return err(jErr.message, 500)

        // Assign player role if not already present
        await supabase.from('league_roles').upsert({
          user_id: body.user_id,
          tenant_id: tenantId,
          league_id: route.leagueId,
          role: 'player',
        }, { onConflict: 'user_id,tenant_id,league_id,role' })

        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'AdminAddedPlayer', 'league_player', player.id, null, player)
        return json(player, 201)
      }

      // DELETE: admin removes a player
      if (method === 'DELETE') {
        const playerId = url.searchParams.get('player_id')
        if (!playerId) return err('player_id query param required')

        const { data: before } = await supabase.from('league_players').select('*').eq('id', playerId).eq('league_id', route.leagueId).single()
        if (!before) return err('Player not found in this league', 404)

        const { error: delErr } = await supabase.from('league_players').delete().eq('id', playerId)
        if (delErr) return err(delErr.message, 500)

        // Also remove league-specific role
        await supabase.from('league_roles').delete()
          .eq('user_id', before.user_id)
          .eq('tenant_id', tenantId)
          .eq('league_id', route.leagueId)
          .eq('role', 'player')

        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'AdminRemovedPlayer', 'league_player', playerId, before, null)
        return json({ success: true })
      }

      return err('Method not allowed', 405)
    }

    // ── BAY AVAILABILITY ──────────────────────────────────────
    if (route.action === 'league-bay-availability' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id, venue_id').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role) return err('No access', 403)

      const dateParam = url.searchParams.get('date')
      if (!dateParam) return err('date query param required (YYYY-MM-DD)')

      // Get tenant's bays
      const { data: tenant } = await supabase.from('tenants').select('city').eq('id', tenantId).single()
      let bayQuery = supabase.from('bays').select('id, name, city, is_active, open_time, close_time').eq('city', tenant?.city || '').eq('is_active', true)
      if (league.venue_id) bayQuery = bayQuery.eq('id', league.venue_id)
      const { data: bays } = await bayQuery

      if (!bays || bays.length === 0) return json([])

      const bayIds = bays.map((b: any) => b.id)

      // Get existing bookings for the date
      const { data: bookings } = await supabase
        .from('league_bay_bookings')
        .select('bay_id, scheduled_at, scheduled_end, players, max_players')
        .in('bay_id', bayIds)
        .eq('status', 'confirmed')
        .gte('scheduled_at', `${dateParam}T00:00:00Z`)
        .lt('scheduled_at', `${dateParam}T23:59:59Z`)

      // Get blocks
      const { data: blocksList } = await supabase
        .from('league_bay_blocks')
        .select('bay_id, blocked_from, blocked_to')
        .in('bay_id', bayIds)
        .eq('tenant_id', tenantId)
        .lt('blocked_from', `${dateParam}T23:59:59Z`)
        .gt('blocked_to', `${dateParam}T00:00:00Z`)

      return json({
        bays,
        bookings: bookings || [],
        blocks: blocksList || [],
      })
    }

    // ── BAY BLOCKS (admin) ────────────────────────────────────
    if (route.action === 'league-bay-blocks' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role || role === 'player') return err('Insufficient permissions', 403)

      if (method === 'GET') {
        const { data, error } = await supabase
          .from('league_bay_blocks')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('blocked_from')
        if (error) return err(error.message, 500)
        return json(data)
      }

      if (method === 'POST') {
        const body = await req.json()
        if (!body.bay_id || !body.blocked_from || !body.blocked_to) {
          return err('bay_id, blocked_from, blocked_to are required')
        }

        const { data: block, error } = await supabase.from('league_bay_blocks').insert({
          bay_id: body.bay_id,
          tenant_id: tenantId,
          blocked_from: body.blocked_from,
          blocked_to: body.blocked_to,
          reason: body.reason ?? null,
          blocked_by: user.id,
        }).select().single()

        if (error) return err(error.message, 500)

        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'BayBlocked', 'league_bay_block', block.id, null, block)
        return json(block, 201)
      }

      if (method === 'DELETE') {
        const blockId = url.searchParams.get('block_id')
        if (!blockId) return err('block_id query param required')

        const { data: before } = await supabase.from('league_bay_blocks').select('*').eq('id', blockId).single()
        const { error } = await supabase.from('league_bay_blocks').delete().eq('id', blockId)
        if (error) return err(error.message, 500)

        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'BayUnblocked', 'league_bay_block', blockId, before, null)
        return json({ success: true })
      }

      return err('Method not allowed', 405)
    }

    // ── ROUNDS ────────────────────────────────────────────────
    if (route.action === 'league-rounds' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role) return err('No access', 403)

      if (method === 'GET') {
        const { data, error } = await supabase
          .from('league_rounds')
          .select('*')
          .eq('league_id', route.leagueId)
          .order('round_number')
        if (error) return err(error.message, 500)
        return json(data)
      }

      if (method === 'POST') {
        if (role === 'player') return err('Insufficient permissions', 403)
        const body = await req.json()
        if (!body.name || !body.start_date || !body.end_date) return err('name, start_date, end_date are required')

        // Auto-assign round_number
        const { data: existing } = await supabase
          .from('league_rounds')
          .select('round_number')
          .eq('league_id', route.leagueId)
          .order('round_number', { ascending: false })
          .limit(1)
        const nextRound = (existing && existing.length > 0) ? existing[0].round_number + 1 : 1

        // Validate par_per_hole if provided (must match league.scoring_holes; values 3-6)
        let parPerHole: number[] | undefined = undefined
        if (Array.isArray(body.par_per_hole) && body.par_per_hole.length > 0) {
          const { data: lg } = await supabase.from('leagues').select('scoring_holes').eq('id', route.leagueId).single()
          const holes = (lg?.scoring_holes as number) || 18
          if (body.par_per_hole.length !== holes) return err(`par_per_hole must have ${holes} entries`)
          if (body.par_per_hole.some((p: number) => !Number.isInteger(p) || p < 3 || p > 6)) {
            return err('Each par value must be an integer between 3 and 6')
          }
          parPerHole = body.par_per_hole
        }

        const { data, error } = await supabase.from('league_rounds').insert({
          league_id: route.leagueId,
          tenant_id: tenantId,
          round_number: body.round_number || nextRound,
          name: body.name,
          description: body.description ?? null,
          start_date: body.start_date,
          end_date: body.end_date,
          ...(parPerHole ? { par_per_hole: parPerHole } : {}),
        }).select().single()
        if (error) return err(error.message, 500)

        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'RoundCreated', 'league_round', data.id, null, data)
        return json(data, 201)
      }

      return err('Method not allowed', 405)
    }

    // ── ROUND DETAIL (update / delete) ────────────────────────
    if (route.action === 'league-round-detail' && route.leagueId && route.subId) {
      const { data: round } = await supabase.from('league_rounds').select('*, leagues!inner(tenant_id)').eq('id', route.subId).single()
      if (!round) return err('Round not found', 404)
      const tenantId = (round as any).leagues.tenant_id

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role || role === 'player') return err('Insufficient permissions', 403)

      if (method === 'PATCH') {
        const body = await req.json()
        const updates: Record<string, any> = {}
        for (const key of ['name', 'description', 'start_date', 'end_date', 'round_number']) {
          if (body[key] !== undefined) updates[key] = body[key]
        }
        if (Array.isArray(body.par_per_hole)) {
          // Allow clearing with [] or setting full-length array
          if (body.par_per_hole.length > 0) {
            const { data: lg } = await supabase.from('leagues').select('scoring_holes').eq('id', route.leagueId).single()
            const holes = (lg?.scoring_holes as number) || 18
            if (body.par_per_hole.length !== holes) return err(`par_per_hole must have ${holes} entries`)
            if (body.par_per_hole.some((p: number) => !Number.isInteger(p) || p < 3 || p > 6)) {
              return err('Each par value must be an integer between 3 and 6')
            }
          }
          updates.par_per_hole = body.par_per_hole
        }
        const { data, error } = await supabase.from('league_rounds').update(updates).eq('id', route.subId).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId!, user.id, role!, 'RoundUpdated', 'league_round', route.subId, round, data)
        return json(data)
      }

      if (method === 'DELETE') {
        const { error } = await supabase.from('league_rounds').delete().eq('id', route.subId)
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId!, user.id, role!, 'RoundDeleted', 'league_round', route.subId, round, null)
        return json({ success: true })
      }

      return err('Method not allowed', 405)
    }

    // ── ROUND COMPETITIONS ────────────────────────────────────
    if (route.action === 'league-round-competitions' && route.leagueId && route.subId) {
      const { data: round } = await supabase.from('league_rounds').select('*, leagues!inner(tenant_id)').eq('id', route.subId).single()
      if (!round) return err('Round not found', 404)
      const tenantId = (round as any).leagues.tenant_id

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role) return err('No access', 403)

      if (method === 'GET') {
        const { data, error } = await supabase
          .from('league_competitions')
          .select('*')
          .eq('round_id', route.subId)
          .order('sort_order')
        if (error) return err(error.message, 500)
        return json(data)
      }

      if (method === 'POST') {
        if (role === 'player') return err('Insufficient permissions', 403)
        const body = await req.json()
        if (!body.name) return err('name is required')

        const { data, error } = await supabase.from('league_competitions').insert({
          round_id: route.subId,
          league_id: route.leagueId,
          tenant_id: tenantId,
          name: body.name,
          description: body.description ?? null,
          points_config: body.points_config ?? [],
          sort_order: body.sort_order ?? 0,
        }).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'CompetitionCreated', 'league_competition', data.id, null, data)
        return json(data, 201)
      }

      if (method === 'PATCH') {
        const compId = url.searchParams.get('competition_id')
        if (!compId) return err('competition_id query param required')
        if (role === 'player') return err('Insufficient permissions', 403)

        const body = await req.json()
        const updates: Record<string, any> = {}
        for (const key of ['name', 'description', 'points_config', 'sort_order']) {
          if (body[key] !== undefined) updates[key] = body[key]
        }
        const { data: before } = await supabase.from('league_competitions').select('*').eq('id', compId).single()
        const { data, error } = await supabase.from('league_competitions').update(updates).eq('id', compId).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'CompetitionUpdated', 'league_competition', compId, before, data)
        return json(data)
      }

      if (method === 'DELETE') {
        const compId = url.searchParams.get('competition_id')
        if (!compId) return err('competition_id query param required')
        if (role === 'player') return err('Insufficient permissions', 403)

        const { data: before } = await supabase.from('league_competitions').select('*').eq('id', compId).single()
        const { error } = await supabase.from('league_competitions').delete().eq('id', compId)
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'CompetitionDeleted', 'league_competition', compId, before, null)
        return json({ success: true })
      }

      return err('Method not allowed', 405)
    }

    // ── TEAMS (list / create) ────────────────────────────────
    if (route.action === 'league-teams' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id

      if (method === 'GET') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role) return err('No access', 403)

        const { data, error } = await supabase
          .from('league_teams')
          .select('*, league_team_members(*, league_players(user_id))')
          .eq('league_id', route.leagueId)
          .order('name')
        if (error) return err(error.message, 500)

        // Enrich with player display names
        const allUserIds = (data || []).flatMap((t: any) =>
          (t.league_team_members || []).map((m: any) => m.league_players?.user_id).filter(Boolean)
        )
        let profileMap: Record<string, string> = {}
        if (allUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, display_name')
            .in('user_id', [...new Set(allUserIds)])
          if (profiles) {
            profileMap = Object.fromEntries(profiles.map((p: any) => [p.user_id, p.display_name || '']))
          }
        }

        const enriched = (data || []).map((t: any) => ({
          ...t,
          members: (t.league_team_members || []).map((m: any) => ({
            id: m.id,
            player_id: m.player_id,
            user_id: m.league_players?.user_id,
            display_name: profileMap[m.league_players?.user_id] || null,
            assigned_at: m.assigned_at,
          })),
          league_team_members: undefined,
        }))

        return json(enriched)
      }

      if (method === 'POST') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role || role === 'player') return err('Insufficient permissions', 403)

        const body = await req.json()
        if (!body.name) return err('name is required')

        const { data, error } = await supabase.from('league_teams').insert({
          league_id: route.leagueId,
          tenant_id: tenantId,
          name: body.name,
          max_roster_size: body.max_roster_size ?? 4,
          created_by: user.id,
        }).select().single()
        if (error) {
          if (error.code === '23505') return err('A team with that name already exists in this league')
          return err(error.message, 500)
        }

        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'TeamCreated', 'league_team', data.id, null, data)
        return json(data, 201)
      }

      return err('Method not allowed', 405)
    }

    // ── TEAM DETAIL (update / delete) ─────────────────────────
    if (route.action === 'league-team-detail' && route.leagueId && route.subId) {
      const { data: team } = await supabase.from('league_teams').select('*').eq('id', route.subId).single()
      if (!team) return err('Team not found', 404)
      const tenantId = team.tenant_id

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role || role === 'player') return err('Insufficient permissions', 403)

      if (method === 'PATCH') {
        const body = await req.json()
        const updates: Record<string, any> = {}
        if (body.name !== undefined) updates.name = body.name
        if (body.max_roster_size !== undefined) updates.max_roster_size = body.max_roster_size

        const { data, error } = await supabase.from('league_teams').update(updates).eq('id', route.subId).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId!, user.id, role!, 'TeamUpdated', 'league_team', route.subId, team, data)
        return json(data)
      }

      if (method === 'DELETE') {
        // Check if team has members
        const { count } = await supabase.from('league_team_members').select('id', { count: 'exact', head: true }).eq('team_id', route.subId)
        if (count && count > 0) return err('Cannot delete a team with members. Remove all members first.')

        const { error } = await supabase.from('league_teams').delete().eq('id', route.subId)
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId!, user.id, role!, 'TeamDeleted', 'league_team', route.subId, team, null)
        return json({ success: true })
      }

      return err('Method not allowed', 405)
    }

    // ── TEAM MEMBERS (add) ────────────────────────────────────
    if (route.action === 'league-team-members' && route.leagueId && route.subId) {
      const { data: team } = await supabase.from('league_teams').select('*, leagues!inner(tenant_id)').eq('id', route.subId).single()
      if (!team) return err('Team not found', 404)
      const tenantId = (team as any).leagues.tenant_id

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role || role === 'player') return err('Insufficient permissions', 403)

      if (method === 'POST') {
        const body = await req.json()
        if (!body.player_id) return err('player_id is required')

        // Verify player belongs to this league
        const { data: player } = await supabase.from('league_players').select('id, user_id, team_id').eq('id', body.player_id).eq('league_id', route.leagueId).single()
        if (!player) return err('Player not found in this league', 404)

        // Check roster capacity
        const { count } = await supabase.from('league_team_members').select('id', { count: 'exact', head: true }).eq('team_id', route.subId)
        if (count !== null && count >= team.max_roster_size) return err('Team roster is full')

        // Remove from current team if any
        if (player.team_id && player.team_id !== route.subId) {
          await supabase.from('league_team_members').delete().eq('player_id', body.player_id).eq('team_id', player.team_id)
        }

        const { data, error } = await supabase.from('league_team_members').upsert({
          team_id: route.subId,
          player_id: body.player_id,
          assigned_by: user.id,
        }, { onConflict: 'team_id,player_id' }).select().single()
        if (error) return err(error.message, 500)

        // Update player's team_id
        await supabase.from('league_players').update({ team_id: route.subId }).eq('id', body.player_id)

        await audit(supabase, tenantId, route.leagueId!, user.id, role!, 'TeamMemberAdded', 'league_team_member', data.id, null, { ...data, user_id: player.user_id })
        return json(data, 201)
      }

      return err('Method not allowed', 405)
    }

    // ── TEAM MEMBER DETAIL (remove) ───────────────────────────
    if (route.action === 'league-team-member-detail' && route.leagueId && route.subId && route.bookingId) {
      const teamId = route.subId
      const memberId = route.bookingId

      const { data: team } = await supabase.from('league_teams').select('*, leagues!inner(tenant_id)').eq('id', teamId).single()
      if (!team) return err('Team not found', 404)
      const tenantId = (team as any).leagues.tenant_id

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role || role === 'player') return err('Insufficient permissions', 403)

      if (method === 'DELETE') {
        const { data: member } = await supabase.from('league_team_members').select('*, league_players(user_id)').eq('id', memberId).single()
        if (!member) return err('Member not found', 404)

        const { error } = await supabase.from('league_team_members').delete().eq('id', memberId)
        if (error) return err(error.message, 500)

        // Clear team_id on the player
        await supabase.from('league_players').update({ team_id: null }).eq('id', member.player_id)

        await audit(supabase, tenantId, route.leagueId!, user.id, role!, 'TeamMemberRemoved', 'league_team_member', memberId, member, null)
        return json({ success: true })
      }

      return err('Method not allowed', 405)
    }

    // ── HIDDEN HOLES — ADMIN-ONLY PREVIEW ───────────────────────
    // Returns hidden holes with values regardless of `revealed_at`. Admins use
    // this to verify Peoria selections privately during a live round.
    if (route.action === 'league-hidden-holes-admin' && route.leagueId) {
      if (method !== 'GET') return err('Method not allowed', 405)
      const { data: league } = await supabase.from('leagues').select('tenant_id, scoring_holes').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const role = await getUserLeagueRole(supabase, user.id, league.tenant_id)
      if (role !== 'franchise_admin' && role !== 'site_admin' && role !== 'league_admin') {
        return err('Admin access required', 403)
      }
      const { data, error } = await supabase
        .from('league_round_hidden_holes')
        .select('*')
        .eq('league_id', route.leagueId)
        .order('round_number')
      if (error) return err(error.message, 500)
      const scoringHoles = league.scoring_holes || 18
      const sanitized = (data || []).map((h: any) => sanitizeHiddenHoles(h, scoringHoles))
      return json(sanitized)
    }

    // ── HIDDEN HOLES (Peoria System) ────────────────────────────
    if (route.action === 'league-hidden-holes' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id, scoring_holes').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id
      const scoringHoles = league.scoring_holes || 18

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role) return err('No access', 403)

      // GET: list hidden holes (players only see revealed ones via RLS, admins see all)
      if (method === 'GET') {
        const isAdmin = role !== 'player'
        const { data, error } = await supabase
          .from('league_round_hidden_holes')
          .select('*')
          .eq('league_id', route.leagueId)
          .order('round_number')
        if (error) return err(error.message, 500)

        const sanitized = (data || []).map((h: any) => {
          const clean = sanitizeHiddenHoles(h, scoringHoles)
          // For players, strip hidden_holes if not yet revealed
          if (!isAdmin && !clean.revealed_at) {
            return { ...clean, hidden_holes: null }
          }
          return clean
        })
        return json(sanitized)
      }

      // POST: set hidden holes for a round
      if (method === 'POST') {
        if (role === 'player') return err('Insufficient permissions', 403)

        const body = await req.json()
        if (!body.round_number) return err('round_number is required')

        const scoringHoles = league.scoring_holes || 18
        const requiredHiddenCount = scoringHoles === 9 ? 3 : 6

        let hiddenHoles: number[] = body.hidden_holes || []

        // If randomize requested, pick random holes
        if (body.randomize) {
          // Fetch round par to honor par-mix rule (one par-3, one par-4, one par-5 for 9-hole Peoria)
          const { data: roundRow } = await supabase
            .from('league_rounds')
            .select('par_per_hole')
            .eq('league_id', route.leagueId)
            .eq('round_number', body.round_number)
            .maybeSingle()
          const parPerHole = (roundRow?.par_per_hole as number[] | null) || []

          const pickRandom = (arr: number[]): number | null => {
            if (arr.length === 0) return null
            const idx = Math.floor(Math.random() * arr.length)
            return arr.splice(idx, 1)[0]
          }

          if (scoringHoles === 9 && parPerHole.length === 9) {
            // 9-hole Peoria: pick one par-3, one par-4, one par-5 if available.
            // Fall back to random fill from remaining holes when a par class is missing.
            const byPar: Record<number, number[]> = { 3: [], 4: [], 5: [] }
            parPerHole.forEach((p, i) => {
              if (p === 3 || p === 4 || p === 5) byPar[p].push(i + 1)
            })
            hiddenHoles = []
            for (const p of [3, 4, 5]) {
              const picked = pickRandom(byPar[p])
              if (picked !== null) hiddenHoles.push(picked)
            }
            // Top up if any par class was empty
            if (hiddenHoles.length < requiredHiddenCount) {
              const remaining = Array.from({ length: 9 }, (_, i) => i + 1).filter(h => !hiddenHoles.includes(h))
              while (hiddenHoles.length < requiredHiddenCount) {
                const picked = pickRandom(remaining)
                if (picked === null) break
                hiddenHoles.push(picked)
              }
            }
            hiddenHoles.sort((a, b) => a - b)
          } else {
            // 18-hole or par not yet configured → uniform random pick
            const allHoles = Array.from({ length: scoringHoles }, (_, i) => i + 1)
            hiddenHoles = []
            for (let i = 0; i < requiredHiddenCount; i++) {
              const picked = pickRandom(allHoles)
              if (picked === null) break
              hiddenHoles.push(picked)
            }
            hiddenHoles.sort((a, b) => a - b)
          }
        }

        if (hiddenHoles.length !== requiredHiddenCount) {
          return err(`Exactly ${requiredHiddenCount} hidden holes required for ${scoringHoles}-hole play`)
        }

        // Validate hole numbers are in range
        if (hiddenHoles.some((h: number) => h < 1 || h > scoringHoles)) {
          return err(`Hole numbers must be between 1 and ${scoringHoles}`)
        }

        // Upsert
        const { data: existing } = await supabase
          .from('league_round_hidden_holes')
          .select('*')
          .eq('league_id', route.leagueId)
          .eq('round_number', body.round_number)
          .maybeSingle()

        if (existing && existing.revealed_at) {
          return err('Cannot modify hidden holes after round is closed')
        }

        let result
        if (existing) {
          const { data, error } = await supabase
            .from('league_round_hidden_holes')
            .update({ hidden_holes: hiddenHoles, selected_by: user.id })
            .eq('id', existing.id)
            .select().single()
          if (error) return err(error.message, 500)
          await audit(supabase, tenantId, route.leagueId, user.id, role!, 'HiddenHolesUpdated', 'league_round_hidden_holes', data.id, existing, data)
          result = data
        } else {
          const { data, error } = await supabase
            .from('league_round_hidden_holes')
            .insert({
              league_id: route.leagueId,
              round_number: body.round_number,
              hidden_holes: hiddenHoles,
              selected_by: user.id,
              tenant_id: tenantId,
            })
            .select().single()
          if (error) return err(error.message, 500)
          await audit(supabase, tenantId, route.leagueId, user.id, role!, 'HiddenHolesSet', 'league_round_hidden_holes', data.id, null, data)
          result = data
        }

        return json(result, 201)
      }

      // PATCH: close round (reveal hidden holes and calculate Peoria handicaps)
      if (method === 'PATCH') {
        if (role === 'player') return err('Insufficient permissions', 403)

        const body = await req.json()
        if (!body.round_number) return err('round_number is required')
        if (body.action !== 'close_round') return err('action must be close_round')

        const { data: hiddenHolesRecord } = await supabase
          .from('league_round_hidden_holes')
          .select('*')
          .eq('league_id', route.leagueId)
          .eq('round_number', body.round_number)
          .single()

        if (!hiddenHolesRecord) return err('Hidden holes not set for this round', 404)
        if (hiddenHolesRecord.revealed_at) return err('Round is already closed')

        // Reveal
        const { data: revealed, error: revErr } = await supabase
          .from('league_round_hidden_holes')
          .update({ revealed_at: new Date().toISOString() })
          .eq('id', hiddenHolesRecord.id)
          .select().single()
        if (revErr) return err(revErr.message, 500)

        // Calculate Peoria handicaps for all scores in this round
        const { data: scores } = await supabase
          .from('league_scores')
          .select('*')
          .eq('league_id', route.leagueId)
          .eq('round_number', body.round_number)

        const hiddenHoles = hiddenHolesRecord.hidden_holes as number[]

        // Fetch round par_per_hole from league_rounds (drives the handicap formula)
        const { data: roundCfg } = await supabase
          .from('league_rounds')
          .select('par_per_hole')
          .eq('league_id', route.leagueId)
          .eq('round_number', body.round_number)
          .maybeSingle()
        const parPerHole: number[] = (roundCfg?.par_per_hole as number[]) || []
        const roundPar = parPerHole.reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0)

        // Peoria-style handicap: (sum of hidden hole scores × 3) − round par
        // Works for both 9-hole (3 hidden × 3 = 9 holes) and 18-hole (6 hidden × 3 = 18 holes)
        const HC_MULTIPLIER = 3

        const results: any[] = []
        for (const score of (scores || [])) {
          const holeScores = score.hole_scores as number[]
          if (!holeScores || holeScores.length === 0) continue

          // Sum hidden hole scores (0-indexed: hole 1 = index 0)
          const hiddenSum = hiddenHoles.reduce((sum, holeNum) => {
            const idx = holeNum - 1
            return sum + (holeScores[idx] || 0)
          }, 0)

          const peoriaHandicap = roundPar > 0 ? (hiddenSum * HC_MULTIPLIER) - roundPar : 0
          const grossScore = score.total_score || holeScores.reduce((s: number, v: number) => s + (v || 0), 0)
          const netScore = grossScore - peoriaHandicap

          results.push({
            score_id: score.id,
            player_id: score.player_id,
            gross_score: grossScore,
            hidden_hole_sum: hiddenSum,
            peoria_handicap: peoriaHandicap,
            net_score: netScore,
          })
        }

        await audit(supabase, tenantId, route.leagueId, user.id, role!, 'RoundClosed', 'league_round_hidden_holes', hiddenHolesRecord.id, hiddenHolesRecord, revealed)
        await emitFeed(supabase, tenantId, route.leagueId, user.id, 'round_closed', { round_number: body.round_number, hidden_holes: revealed.hidden_holes, scores_processed: results.length })

        return json({
          revealed: revealed,
          peoria_results: results,
        })
      }

      return err('Method not allowed', 405)
    }

    // ── LEADERBOARD ──────────────────────────────────────────
    if (route.action === 'league-leaderboard' && route.leagueId && method === 'GET') {
      const { data: league } = await supabase.from('leagues').select('tenant_id, leaderboard_visibility').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const role = await getUserLeagueRole(supabase, user.id, league.tenant_id)
      if (!role) return err('No access', 403)
      if (league.leaderboard_visibility === 'admin_only' && role === 'player') {
        return err('Leaderboard not yet visible', 403)
      }
      const roundParam = url.searchParams.get('round')
      const result = await computeLeaderboard(supabase, route.leagueId, {
        round: roundParam ? parseInt(roundParam) : null,
        filter: (url.searchParams.get('filter') as any) || 'all',
        scope: (url.searchParams.get('scope') as any) || 'national',
        cityId: url.searchParams.get('league_city_id'),
      })
      return json(result)
    }

    // ── ACTIVITY FEED ────────────────────────────────────────
    if (route.action === 'league-feed' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id

      if (method === 'GET') {
        // Verify user has access
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        const { data: isMember } = await supabase
          .from('league_players')
          .select('id')
          .eq('league_id', route.leagueId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (!role && !isMember) return err('No access', 403)

        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
        const offset = parseInt(url.searchParams.get('offset') || '0')

        const { data: items, error: feedErr } = await supabase
          .from('league_feed_items')
          .select('*')
          .eq('league_id', route.leagueId)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)

        if (feedErr) return err(feedErr.message, 500)

        // Fetch reactions for these items
        const itemIds = (items || []).map((i: any) => i.id)
        let reactions: any[] = []
        if (itemIds.length > 0) {
          const { data: rxns } = await supabase
            .from('league_feed_reactions')
            .select('*')
            .in('feed_item_id', itemIds)
            .eq('tenant_id', tenantId)
          reactions = rxns || []
        }

        // Fetch actor profiles
        const actorIds = [...new Set((items || []).map((i: any) => i.actor_id))]
        let profileMap: Record<string, string> = {}
        if (actorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, display_name')
            .in('user_id', actorIds)
          for (const p of profiles || []) {
            profileMap[p.user_id] = p.display_name || p.user_id.slice(0, 8)
          }
        }

        // Group reactions per item
        const reactionMap: Record<string, { emoji: string; count: number; user_reacted: boolean }[]> = {}
        for (const r of reactions) {
          if (!reactionMap[r.feed_item_id]) reactionMap[r.feed_item_id] = []
          const existing = reactionMap[r.feed_item_id].find((x: any) => x.emoji === r.emoji)
          if (existing) {
            existing.count++
            if (r.user_id === user.id) existing.user_reacted = true
          } else {
            reactionMap[r.feed_item_id].push({ emoji: r.emoji, count: 1, user_reacted: r.user_id === user.id })
          }
        }

        const enrichedItems = (items || []).map((item: any) => ({
          ...item,
          actor_name: profileMap[item.actor_id] || item.actor_id.slice(0, 8),
          reactions: reactionMap[item.id] || [],
        }))

        return json(enrichedItems)
      }
      return err('Method not allowed', 405)
    }

    // ── FEED REACTIONS ─────────────────────────────────────
    if (route.action === 'league-feed-reaction' && route.leagueId && route.subId) {
      const feedItemId = route.subId
      const { data: feedItem } = await supabase
        .from('league_feed_items')
        .select('league_id, tenant_id')
        .eq('id', feedItemId)
        .single()
      if (!feedItem) return err('Feed item not found', 404)
      if (feedItem.league_id !== route.leagueId) return err('Feed item not in this league', 403)
      const tenantId = feedItem.tenant_id

      // Verify user is a member
      const { data: isMember } = await supabase
        .from('league_players')
        .select('id')
        .eq('league_id', route.leagueId)
        .eq('user_id', user.id)
        .maybeSingle()

      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role && !isMember) return err('No access', 403)

      if (method === 'POST') {
        const body = await req.json().catch(() => ({}))
        const emoji = body.emoji || '👏'
        if (typeof emoji !== 'string' || emoji.length > 10) return err('Invalid emoji')

        const { data, error } = await supabase
          .from('league_feed_reactions')
          .upsert(
            { feed_item_id: feedItemId, user_id: user.id, emoji, tenant_id: tenantId },
            { onConflict: 'feed_item_id,user_id,emoji' }
          )
          .select()
          .single()

        if (error) return err(error.message, 500)
        return json(data, 201)
      }

      if (method === 'DELETE') {
        const emoji = url.searchParams.get('emoji') || '👏'
        const { error } = await supabase
          .from('league_feed_reactions')
          .delete()
          .eq('feed_item_id', feedItemId)
          .eq('user_id', user.id)
          .eq('emoji', emoji)

        if (error) return err(error.message, 500)
        return json({ ok: true })
      }

      return err('Method not allowed', 405)
    }

    // ── LEAGUE CITIES (list/create) ──────────────────────────
    if (route.action === 'league-cities' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role) return err('No access', 403)

      if (method === 'GET') {
        const { data, error } = await supabase
          .from('league_cities')
          .select('*')
          .eq('league_id', route.leagueId)
          .order('display_order', { ascending: true })
          .order('name', { ascending: true })
        if (error) return err(error.message, 500)
        return json(data)
      }

      if (method === 'POST') {
        if (role !== 'franchise_admin' && role !== 'site_admin') return err('Forbidden', 403)
        const body = await req.json().catch(() => ({}))
        if (!body.name || typeof body.name !== 'string') return err('name is required')
        const { data, error } = await supabase
          .from('league_cities')
          .insert({
            league_id: route.leagueId,
            tenant_id: tenantId,
            name: body.name.trim(),
            display_order: typeof body.display_order === 'number' ? body.display_order : 0,
            created_by: user.id,
          })
          .select()
          .single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueCityCreated', 'league_city', data.id, null, data)
        return json(data, 201)
      }

      return err('Method not allowed', 405)
    }

    // ── LEAGUE CITY DETAIL (PATCH / DELETE) ──────────────────
    if (route.action === 'league-city-detail' && route.leagueId && route.subId) {
      const { data: city } = await supabase.from('league_cities').select('*').eq('id', route.subId).single()
      if (!city || city.league_id !== route.leagueId) return err('City not found', 404)
      const tenantId = city.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (role !== 'franchise_admin' && role !== 'site_admin') return err('Forbidden', 403)

      if (method === 'PATCH') {
        const body = await req.json().catch(() => ({}))
        const updates: Record<string, unknown> = {}
        if (typeof body.name === 'string') updates.name = body.name.trim()
        if (typeof body.display_order === 'number') updates.display_order = body.display_order
        if (Object.keys(updates).length === 0) return err('No valid fields')
        const { data, error } = await supabase.from('league_cities').update(updates).eq('id', route.subId).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueCityUpdated', 'league_city', route.subId, city, data)
        return json(data)
      }

      if (method === 'DELETE') {
        const { error } = await supabase.from('league_cities').delete().eq('id', route.subId)
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueCityDeleted', 'league_city', route.subId, city, null)
        return json({ ok: true })
      }

      return err('Method not allowed', 405)
    }

    // ── LEAGUE CITY LOCATIONS (list/create) ──────────────────
    if (route.action === 'league-city-locations' && route.leagueId && route.subId) {
      const cityId = route.subId
      const { data: city } = await supabase.from('league_cities').select('*').eq('id', cityId).single()
      if (!city || city.league_id !== route.leagueId) return err('City not found', 404)
      const tenantId = city.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role) return err('No access', 403)

      if (method === 'GET') {
        const { data, error } = await supabase
          .from('league_locations')
          .select('*')
          .eq('league_city_id', cityId)
          .order('display_order', { ascending: true })
          .order('name', { ascending: true })
        if (error) return err(error.message, 500)
        return json(data)
      }

      if (method === 'POST') {
        if (role !== 'franchise_admin' && role !== 'site_admin') return err('Forbidden', 403)
        const body = await req.json().catch(() => ({}))
        if (!body.name || typeof body.name !== 'string') return err('name is required')
        const { data, error } = await supabase
          .from('league_locations')
          .insert({
            league_city_id: cityId,
            league_id: route.leagueId,
            tenant_id: tenantId,
            name: body.name.trim(),
            display_order: typeof body.display_order === 'number' ? body.display_order : 0,
            created_by: user.id,
          })
          .select()
          .single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueLocationCreated', 'league_location', data.id, null, data)
        return json(data, 201)
      }

      return err('Method not allowed', 405)
    }

    // ── LEAGUE LOCATION DETAIL (PATCH / DELETE) ──────────────
    if (route.action === 'league-location-detail' && route.leagueId && route.subId) {
      const { data: loc } = await supabase.from('league_locations').select('*').eq('id', route.subId).single()
      if (!loc || loc.league_id !== route.leagueId) return err('Location not found', 404)
      const tenantId = loc.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (role !== 'franchise_admin' && role !== 'site_admin') return err('Forbidden', 403)

      if (method === 'PATCH') {
        const body = await req.json().catch(() => ({}))
        const updates: Record<string, unknown> = {}
        if (typeof body.name === 'string') updates.name = body.name.trim()
        if (typeof body.display_order === 'number') updates.display_order = body.display_order
        if (Object.keys(updates).length === 0) return err('No valid fields')
        const { data, error } = await supabase.from('league_locations').update(updates).eq('id', route.subId).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueLocationUpdated', 'league_location', route.subId, loc, data)
        return json(data)
      }

      if (method === 'DELETE') {
        const { error } = await supabase.from('league_locations').delete().eq('id', route.subId)
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueLocationDeleted', 'league_location', route.subId, loc, null)
        return json({ ok: true })
      }

      return err('Method not allowed', 405)
    }

    // ── LEAGUE LOCATION BAYS (list/create) ───────────────────
    if (route.action === 'league-location-bays' && route.leagueId && route.subId) {
      const locId = route.subId
      const { data: loc } = await supabase.from('league_locations').select('*').eq('id', locId).single()
      if (!loc || loc.league_id !== route.leagueId) return err('Location not found', 404)
      const tenantId = loc.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role) return err('No access', 403)

      if (method === 'GET') {
        const { data, error } = await supabase
          .from('league_bay_mappings')
          .select('*, bays:bay_id(name, city)')
          .eq('league_location_id', locId)
        if (error) return err(error.message, 500)
        const enriched = (data || []).map((m: any) => ({
          id: m.id,
          league_location_id: m.league_location_id,
          league_id: m.league_id,
          tenant_id: m.tenant_id,
          bay_id: m.bay_id,
          created_at: m.created_at,
          bay_name: m.bays?.name ?? null,
          bay_city: m.bays?.city ?? null,
        }))
        return json(enriched)
      }

      if (method === 'POST') {
        if (role !== 'franchise_admin' && role !== 'site_admin') return err('Forbidden', 403)
        const body = await req.json().catch(() => ({}))
        const bayIds: string[] = Array.isArray(body.bay_ids) ? body.bay_ids : (body.bay_id ? [body.bay_id] : [])
        if (bayIds.length === 0) return err('bay_ids or bay_id required')
        const rows = bayIds.map((b) => ({
          league_location_id: locId,
          league_id: route.leagueId,
          tenant_id: tenantId,
          bay_id: b,
          created_by: user.id,
        }))
        const { data, error } = await supabase
          .from('league_bay_mappings')
          .upsert(rows, { onConflict: 'league_id,bay_id' })
          .select()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueBaysMapped', 'league_bay_mapping', locId, null, { bay_ids: bayIds })
        return json(data, 201)
      }

      return err('Method not allowed', 405)
    }

    // ── LEAGUE LOCATION BAY DETAIL (DELETE) ──────────────────
    if (route.action === 'league-location-bay-detail' && route.leagueId && route.bookingId) {
      const mappingId = route.bookingId
      const { data: mapping } = await supabase.from('league_bay_mappings').select('*').eq('id', mappingId).single()
      if (!mapping || mapping.league_id !== route.leagueId) return err('Mapping not found', 404)
      const tenantId = mapping.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (role !== 'franchise_admin' && role !== 'site_admin') return err('Forbidden', 403)

      if (method === 'DELETE') {
        const { error } = await supabase.from('league_bay_mappings').delete().eq('id', mappingId)
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueBayUnmapped', 'league_bay_mapping', mappingId, mapping, null)
        return json({ ok: true })
      }

      return err('Method not allowed', 405)
    }

    // ── PLAYER CITY/LOCATION ASSIGN (PATCH) ──────────────────
    if (route.action === 'league-player-assign' && route.leagueId && route.bookingId && method === 'PATCH') {
      const playerId = route.bookingId
      const { data: player } = await supabase.from('league_players').select('*').eq('id', playerId).single()
      if (!player || player.league_id !== route.leagueId) return err('Player not found', 404)
      const { data: leagueRow } = await supabase.from('leagues').select('tenant_id').eq('id', route.leagueId).single()
      const tenantId = leagueRow!.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (role !== 'franchise_admin' && role !== 'site_admin' && role !== 'league_admin') return err('Forbidden', 403)

      const body = await req.json().catch(() => ({}))
      const updates: Record<string, unknown> = {}
      if (body.league_city_id !== undefined) updates.league_city_id = body.league_city_id
      if (body.league_location_id !== undefined) updates.league_location_id = body.league_location_id
      if (Object.keys(updates).length === 0) return err('No valid fields')

      // Guard: if the player belongs to a team that already has a city/location,
      // the player inherits it and cannot be reassigned individually.
      if (player.team_id) {
        const { data: team } = await supabase
          .from('league_teams')
          .select('league_city_id, league_location_id, name')
          .eq('id', player.team_id)
          .maybeSingle()
        if (team && (team.league_city_id || team.league_location_id)) {
          return err(`Player inherits city/location from team "${team.name}". Reassign the team instead.`, 409)
        }
      }

      const { data, error } = await supabase.from('league_players').update(updates).eq('id', playerId).select().single()
      if (error) return err(error.message, 500)
      await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeaguePlayerAssigned', 'league_player', playerId, player, data)
      return json(data)
    }

    // ── TEAM CITY/LOCATION ASSIGN (PATCH) ────────────────────
    if (route.action === 'league-team-assign' && route.leagueId && route.subId && method === 'PATCH') {
      const teamId = route.subId
      const { data: team } = await supabase.from('league_teams').select('*').eq('id', teamId).single()
      if (!team || team.league_id !== route.leagueId) return err('Team not found', 404)
      const tenantId = team.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (role !== 'franchise_admin' && role !== 'site_admin' && role !== 'league_admin') return err('Forbidden', 403)

      const body = await req.json().catch(() => ({}))
      const updates: Record<string, unknown> = {}
      if (body.league_city_id !== undefined) updates.league_city_id = body.league_city_id
      if (body.league_location_id !== undefined) updates.league_location_id = body.league_location_id
      if (Object.keys(updates).length === 0) return err('No valid fields')

      const { data, error } = await supabase.from('league_teams').update(updates).eq('id', teamId).select().single()
      if (error) return err(error.message, 500)
      await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueTeamAssigned', 'league_team', teamId, team, data)
      return json(data)
    }

    // ══════════════════════════════════════════════════════════
    // PHASE 4 — SEASON WRAP-UP
    // ══════════════════════════════════════════════════════════

    // Helper: build full final standings (net + gross) for a league
    async function buildFinalStandings(leagueId: string) {
      const { data: league } = await supabase.from('leagues').select('*').eq('id', leagueId).single()
      if (!league) return null
      const { data: scores } = await supabase.from('league_scores').select('*').eq('league_id', leagueId)
      const { data: allHH } = await supabase.from('league_round_hidden_holes').select('*').eq('league_id', leagueId)
      const { data: rounds } = await supabase.from('league_rounds').select('round_number, par_per_hole').eq('league_id', leagueId)
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name')

      const hiddenMap: Record<number, number[]> = {}
      for (const hh of (allHH || [])) {
        if ((hh as any).revealed_at) hiddenMap[(hh as any).round_number] = (hh as any).hidden_holes as number[]
      }
      const parMap: Record<number, number> = {}
      for (const r of (rounds || [])) {
        const arr = ((r as any).par_per_hole as number[]) || []
        parMap[(r as any).round_number] = arr.reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0)
      }
      const nameMap: Record<string, string> = {}
      for (const p of (profiles || [])) nameMap[(p as any).user_id] = (p as any).display_name || ''

      const HC_MULT = 3
      type Row = { player_id: string; round_number: number; gross: number; net: number; hidden_sum: number; handicap: number; par: number; hole_scores: number[] }
      const rows: Row[] = []
      for (const s of (scores || [])) {
        const sc: any = s
        const hs: number[] = (sc.hole_scores as number[]) || []
        const gross = sc.total_score || hs.reduce((a, b) => a + (b || 0), 0)
        const hidden = hiddenMap[sc.round_number]
        const par = parMap[sc.round_number] || 0
        let handicap = 0, hSum = 0, net = gross
        if (hidden && hs.length > 0 && par > 0) {
          hSum = hidden.reduce((a, h) => a + (hs[h - 1] || 0), 0)
          handicap = (hSum * HC_MULT) - par
          net = gross - handicap
        }
        rows.push({ player_id: sc.player_id, round_number: sc.round_number, gross, net, hidden_sum: hSum, handicap, par, hole_scores: hs })
      }

      // Aggregate per player
      const byPlayer: Record<string, Row[]> = {}
      for (const r of rows) {
        if (!byPlayer[r.player_id]) byPlayer[r.player_id] = []
        byPlayer[r.player_id].push(r)
      }

      const netStandings: any[] = []
      const grossStandings: any[] = []
      for (const [pid, list] of Object.entries(byPlayer)) {
        const totalGross = list.reduce((s, r) => s + r.gross, 0)
        const totalNet = list.reduce((s, r) => s + r.net, 0)
        const totalPar = list.reduce((s, r) => s + r.par, 0)
        const base = {
          player_id: pid,
          name: nameMap[pid] || pid.slice(0, 8),
          total_gross: totalGross,
          total_net: totalNet,
          total_par: totalPar,
          rounds_played: list.length,
        }
        netStandings.push({ ...base, score: totalNet, vs_par: totalNet - totalPar })
        grossStandings.push({ ...base, score: totalGross, vs_par: totalGross - totalPar })
      }
      netStandings.sort((a, b) => a.vs_par - b.vs_par)
      grossStandings.sort((a, b) => a.vs_par - b.vs_par)
      netStandings.forEach((e, i) => (e.rank = i + 1))
      grossStandings.forEach((e, i) => (e.rank = i + 1))

      // Per-player stats for awards
      const playerStats: Record<string, { birdies: number; best_round: number | null; net_avg_vs_par: number; first_net_vs_par: number | null; last_net_vs_par: number | null; rounds: number }> = {}
      for (const [pid, list] of Object.entries(byPlayer)) {
        let birdies = 0
        for (const r of list) {
          // Need par_per_hole for birdie detection
          const round = (rounds || []).find((rd: any) => rd.round_number === r.round_number) as any
          const ph: number[] = (round?.par_per_hole as number[]) || []
          for (let i = 0; i < r.hole_scores.length; i++) {
            const sc = r.hole_scores[i] || 0
            const par = ph[i] || 0
            if (sc > 0 && par > 0 && sc === par - 1) birdies++
          }
        }
        const sorted = [...list].sort((a, b) => a.round_number - b.round_number)
        const netVsPars = sorted.map((r) => r.net - r.par)
        const bestRound = sorted.length ? Math.min(...sorted.map((r) => r.net)) : null
        const avg = netVsPars.length ? netVsPars.reduce((a, b) => a + b, 0) / netVsPars.length : 0
        playerStats[pid] = {
          birdies,
          best_round: bestRound,
          net_avg_vs_par: avg,
          first_net_vs_par: netVsPars[0] ?? null,
          last_net_vs_par: netVsPars[netVsPars.length - 1] ?? null,
          rounds: sorted.length,
        }
      }

      return { league, netStandings, grossStandings, playerStats, nameMap }
    }

    // Helper: compute auto awards from playerStats
    function computeAutoAwards(playerStats: Record<string, any>, nameMap: Record<string, string>) {
      const players = Object.entries(playerStats)
      const awards: any[] = []
      if (!players.length) return awards

      // Most birdies
      const mostBird = [...players].sort((a, b) => b[1].birdies - a[1].birdies)[0]
      if (mostBird && mostBird[1].birdies > 0) {
        awards.push({ award_type: 'most_birdies', name: 'Most Birdies', winner_player_id: mostBird[0], value: mostBird[1].birdies, detail: `${mostBird[1].birdies} birdies` })
      }
      // Best single round (lowest net score in any round)
      const withBest = players.filter((p) => p[1].best_round !== null)
      if (withBest.length) {
        const best = withBest.sort((a, b) => a[1].best_round - b[1].best_round)[0]
        awards.push({ award_type: 'best_round', name: 'Best Single Round', winner_player_id: best[0], value: best[1].best_round, detail: `Lowest net round: ${best[1].best_round}` })
      }
      // Most improved (largest drop = first - last, more positive = better)
      const improvable = players.filter((p) => p[1].rounds >= 2 && p[1].first_net_vs_par !== null && p[1].last_net_vs_par !== null)
      if (improvable.length) {
        const best = improvable.sort((a, b) => (b[1].first_net_vs_par - b[1].last_net_vs_par) - (a[1].first_net_vs_par - a[1].last_net_vs_par))[0]
        const delta = best[1].first_net_vs_par - best[1].last_net_vs_par
        if (delta > 0) {
          awards.push({ award_type: 'most_improved', name: 'Most Improved', winner_player_id: best[0], value: delta, detail: `Improved by ${delta} strokes` })
        }
      }
      // Lowest season average
      const withAvg = players.filter((p) => p[1].rounds > 0)
      if (withAvg.length) {
        const best = withAvg.sort((a, b) => a[1].net_avg_vs_par - b[1].net_avg_vs_par)[0]
        awards.push({ award_type: 'lowest_avg', name: 'Lowest Season Average', winner_player_id: best[0], value: Math.round(best[1].net_avg_vs_par * 100) / 100, detail: `Avg ${best[1].net_avg_vs_par.toFixed(2)} vs par` })
      }
      return awards
    }

    // ── COMPLETE SEASON ──────────────────────────────────────
    if (route.action === 'league-complete' && route.leagueId && method === 'POST') {
      const { data: league } = await supabase.from('leagues').select('*').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = (league as any).tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role || role === 'player') return err('Insufficient permissions', 403)
      if ((league as any).status === 'completed') return err('Season already completed', 409)

      const standings = await buildFinalStandings(route.leagueId!)
      if (!standings) return err('Failed to build standings', 500)

      // Update league status
      const { data: updated, error: uErr } = await supabase
        .from('leagues')
        .update({ status: 'completed' })
        .eq('id', route.leagueId)
        .select()
        .single()
      if (uErr) return err(uErr.message, 500)

      // Snapshot standings
      await supabase.from('league_season_snapshots').upsert({
        league_id: route.leagueId,
        tenant_id: tenantId,
        net_standings: standings.netStandings,
        gross_standings: standings.grossStandings,
        stats: standings.playerStats,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
      } as any, { onConflict: 'league_id' })

      // Wipe existing auto awards (manual ones preserved) and insert fresh
      await supabase.from('league_awards').delete().eq('league_id', route.leagueId).eq('is_manual', false)
      const autoAwards = computeAutoAwards(standings.playerStats, standings.nameMap)
      if (autoAwards.length) {
        await supabase.from('league_awards').insert(autoAwards.map((a) => ({
          ...a,
          league_id: route.leagueId,
          tenant_id: tenantId,
          is_manual: false,
          created_by: user.id,
        })) as any)
      }

      await audit(supabase, tenantId, route.leagueId, user.id, role, 'SeasonCompleted', 'league', route.leagueId, league, updated)
      await emitFeed(supabase, tenantId, route.leagueId, user.id, 'season_completed', { auto_awards: autoAwards.length })
      return json({ league: updated, auto_awards: autoAwards.length })
    }

    // ── REOPEN SEASON (site/master admin only) ───────────────
    if (route.action === 'league-reopen' && route.leagueId && method === 'POST') {
      const { data: league } = await supabase.from('leagues').select('*').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const { data: isSysAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
      if (!isSysAdmin) return err('Only a site admin can re-open a completed season', 403)
      if ((league as any).status !== 'completed') return err('League is not completed', 409)

      const { data: updated, error: uErr } = await supabase
        .from('leagues')
        .update({ status: 'active' })
        .eq('id', route.leagueId)
        .select()
        .single()
      if (uErr) return err(uErr.message, 500)
      const tenantId = (league as any).tenant_id
      await audit(supabase, tenantId, route.leagueId, user.id, 'site_admin', 'SeasonReopened', 'league', route.leagueId, league, updated)
      return json({ league: updated })
    }

    // ── GET WRAP-UP (snapshot + awards) ──────────────────────
    if (route.action === 'league-wrap-up' && route.leagueId && method === 'GET') {
      const { data: league } = await supabase.from('leagues').select('*, league_branding(*)').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = (league as any).tenant_id

      // Access: any tenant member or league player
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      const { data: playerRow } = await supabase.from('league_players').select('id').eq('league_id', route.leagueId).eq('user_id', user.id).maybeSingle()
      if (!role && !playerRow) return err('No access', 403)

      const { data: snapshot } = await supabase.from('league_season_snapshots').select('*').eq('league_id', route.leagueId).maybeSingle()
      const { data: awards } = await supabase.from('league_awards').select('*').eq('league_id', route.leagueId).order('is_manual').order('created_at')

      // Sponsor data only if enabled
      const { data: tenant } = await supabase.from('tenants').select('sponsorship_enabled').eq('id', tenantId).single()
      const sponsorshipOn = (tenant as any)?.sponsorship_enabled ?? false
      const branding = sponsorshipOn ? (league as any).league_branding : null

      return json({
        league: { id: (league as any).id, name: (league as any).name, status: (league as any).status, resolved_logo_url: (league as any).resolved_logo_url },
        snapshot: snapshot || null,
        awards: awards || [],
        branding,
        sponsorship_enabled: sponsorshipOn,
      })
    }

    // ── AWARDS LIST / CREATE MANUAL ──────────────────────────
    if (route.action === 'league-awards' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = (league as any).tenant_id

      if (method === 'GET') {
        const { data, error } = await supabase.from('league_awards').select('*').eq('league_id', route.leagueId).order('is_manual').order('created_at')
        if (error) return err(error.message, 500)
        return json(data || [])
      }

      if (method === 'POST') {
        const role = await getUserLeagueRole(supabase, user.id, tenantId)
        if (!role || role === 'player') return err('Insufficient permissions', 403)
        const body = await req.json().catch(() => ({}))
        if (!body.name || typeof body.name !== 'string' || body.name.length > 120) return err('name is required (≤120 chars)')
        if (!body.winner_player_id && !body.winner_team_id) return err('winner_player_id or winner_team_id is required')

        const { data, error } = await supabase.from('league_awards').insert({
          league_id: route.leagueId,
          tenant_id: tenantId,
          award_type: 'manual',
          name: body.name,
          winner_player_id: body.winner_player_id || null,
          winner_team_id: body.winner_team_id || null,
          detail: body.detail || null,
          is_manual: true,
          created_by: user.id,
        } as any).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'ManualAwardCreated', 'league_award', (data as any).id, null, data)
        return json(data)
      }
      return err('Method not allowed', 405)
    }

    // ── AWARD UPDATE / DELETE (manual only) ──────────────────
    if (route.action === 'league-award-detail' && route.leagueId && route.subId) {
      const awardId = route.subId
      const { data: award } = await supabase.from('league_awards').select('*').eq('id', awardId).single()
      if (!award) return err('Award not found', 404)
      const tenantId = (award as any).tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role || role === 'player') return err('Insufficient permissions', 403)
      if (!(award as any).is_manual) return err('Auto-calculated awards cannot be edited', 403)

      if (method === 'PATCH') {
        const body = await req.json().catch(() => ({}))
        const updates: any = {}
        if (body.name !== undefined) updates.name = body.name
        if (body.winner_player_id !== undefined) updates.winner_player_id = body.winner_player_id || null
        if (body.winner_team_id !== undefined) updates.winner_team_id = body.winner_team_id || null
        if (body.detail !== undefined) updates.detail = body.detail || null
        const { data, error } = await supabase.from('league_awards').update(updates).eq('id', awardId).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'ManualAwardUpdated', 'league_award', awardId, award, data)
        return json(data)
      }
      if (method === 'DELETE') {
        const { error } = await supabase.from('league_awards').delete().eq('id', awardId)
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'ManualAwardDeleted', 'league_award', awardId, award, null)
        return json({ deleted: true })
      }
      return err('Method not allowed', 405)
    }

    // ── RECAP CARD (server-generated SVG → PNG) ──────────────
    // GET /leagues/:id/recap-card?player_id=xxx  (player_id optional → caller's own)
    if (route.action === 'league-recap-card' && route.leagueId && method === 'GET') {
      const { data: league } = await supabase.from('leagues').select('*, league_branding(*)').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = (league as any).tenant_id

      const targetPlayerUserId = url.searchParams.get('player_id') || user.id

      // Access check: caller must be tenant member, the target player themselves, or admin
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      const { data: callerPlayer } = await supabase.from('league_players').select('id, user_id').eq('league_id', route.leagueId).eq('user_id', user.id).maybeSingle()
      if (!role && !callerPlayer) return err('No access', 403)
      if (!role && callerPlayer && targetPlayerUserId !== user.id) return err('Players can only access their own recap', 403)

      // Get snapshot + awards (tenant-scoped queries)
      const { data: snapshot } = await supabase.from('league_season_snapshots').select('*').eq('league_id', route.leagueId).eq('tenant_id', tenantId).maybeSingle()
      if (!snapshot) return err('Season not yet completed', 409)
      const { data: awards } = await supabase.from('league_awards').select('*').eq('league_id', route.leagueId).eq('tenant_id', tenantId)
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', targetPlayerUserId).maybeSingle()

      const netStandings = ((snapshot as any).net_standings || []) as any[]
      const myRow = netStandings.find((r) => r.player_id === targetPlayerUserId)
      if (!myRow) return err('Player not found in standings', 404)
      const stats = ((snapshot as any).stats || {}) as Record<string, any>
      const myStats = stats[targetPlayerUserId] || {}
      const myAwards = (awards || []).filter((a: any) => a.winner_player_id === targetPlayerUserId)

      // Sponsor (only if enabled for tenant)
      const { data: tenant } = await supabase.from('tenants').select('sponsorship_enabled').eq('id', tenantId).single()
      const sponsorshipOn = (tenant as any)?.sponsorship_enabled ?? false
      const branding = sponsorshipOn ? (league as any).league_branding : null
      const sponsorName: string | null = branding?.sponsor_name || null

      // Build SVG
      const playerName = (profile as any)?.display_name || myRow.name || 'Player'
      const leagueName = (league as any).name
      const rank = myRow.rank
      const vsPar = myRow.vs_par
      const vsParStr = vsPar === 0 ? 'E' : (vsPar > 0 ? `+${vsPar}` : `${vsPar}`)
      const bestRound = myStats.best_round ?? '—'
      const birdies = myStats.birdies ?? 0
      const escape = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

      const awardsList = myAwards.length
        ? myAwards.map((a: any, i: number) => `<text x="60" y="${560 + i * 36}" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#fbbf24">★ ${escape(a.name)}</text>`).join('')
        : `<text x="60" y="560" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#94a3b8" font-style="italic">No awards this season</text>`

      const sponsorBlock = sponsorName
        ? `<text x="600" y="780" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#94a3b8">Presented by ${escape(sponsorName)}</text>`
        : ''

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e3a5f"/>
    </linearGradient>
  </defs>
  <rect width="640" height="800" fill="url(#bg)"/>
  <text x="60" y="80" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#94a3b8" letter-spacing="3">SEASON WRAP-UP</text>
  <text x="60" y="130" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="700" fill="#ffffff">${escape(leagueName)}</text>
  <line x1="60" y1="160" x2="580" y2="160" stroke="#334155" stroke-width="1"/>
  <text x="60" y="230" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff">${escape(playerName)}</text>
  <text x="60" y="290" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#94a3b8">Final Rank</text>
  <text x="60" y="350" font-family="Helvetica, Arial, sans-serif" font-size="72" font-weight="700" fill="#fbbf24">#${rank}</text>
  <text x="60" y="400" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#cbd5e1">${vsParStr} vs Par</text>
  <line x1="60" y1="430" x2="580" y2="430" stroke="#334155" stroke-width="1"/>
  <text x="60" y="475" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#94a3b8">Best Round</text>
  <text x="60" y="510" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="600" fill="#ffffff">${bestRound}</text>
  <text x="320" y="475" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#94a3b8">Total Birdies</text>
  <text x="320" y="510" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="600" fill="#ffffff">${birdies}</text>
  ${awardsList}
  ${sponsorBlock}
  <text x="60" y="780" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#64748b">Golfer's Edge League</text>
</svg>`

      // Store in tenant-scoped path
      const path = `${tenantId}/${route.leagueId}/${targetPlayerUserId}.svg`
      const bytes = new TextEncoder().encode(svg)
      await supabase.storage.from('league-recaps').upload(path, bytes, {
        contentType: 'image/svg+xml',
        upsert: true,
      })

      // Generate signed URL (1 hour)
      const { data: signed } = await supabase.storage.from('league-recaps').createSignedUrl(path, 3600)

      await audit(supabase, tenantId, route.leagueId, user.id, role || 'player', 'RecapGenerated', 'league_recap', targetPlayerUserId, null, { path })

      return json({
        url: signed?.signedUrl || null,
        path,
        player: { id: targetPlayerUserId, name: playerName, rank, vs_par: vsPar, best_round: bestRound, birdies, awards: myAwards },
        sponsor: sponsorName,
      })
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 2 — Legacy League captain registration + Razorpay
    // ══════════════════════════════════════════════════════════════

    // ── Register team intent (creates Razorpay order + pending row) ─
    if (route.action === 'legacy-register-team-intent' && route.leagueId && method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const { league_city_id, league_location_id, team_name, team_size, invite_emails, coupon_code } = body || {}
      if (!league_city_id || !league_location_id || !team_name || !team_size) {
        return err('league_city_id, league_location_id, team_name, team_size are required')
      }
      const cleanedCoupon = typeof coupon_code === 'string' ? coupon_code.trim().toUpperCase() : ''
      const size = Number(team_size)
      if (!Number.isInteger(size) || size < 1 || size > 20) return err('Invalid team_size')
      if (typeof team_name !== 'string' || team_name.trim().length < 1 || team_name.trim().length > 80) {
        return err('Invalid team_name')
      }

      // Validate + normalize invite emails (max team_size - 1)
      const captainEmail = (user.email || '').toLowerCase()
      const cleanedInviteEmails: string[] = Array.isArray(invite_emails)
        ? Array.from(new Set(
            (invite_emails as unknown[])
              .map((e) => String(e || '').trim().toLowerCase())
              .filter((e) => e.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
              .filter((e) => e !== captainEmail)
          ))
        : []
      if (cleanedInviteEmails.length > size - 1) {
        return err(`At most ${size - 1} invite emails for a team of ${size}`)
      }
      // League validation
      const { data: league } = await supabase
        .from('leagues')
        .select('id, tenant_id, name, status, show_on_landing, allowed_team_sizes, price_per_person, currency, payment_city')
        .eq('id', route.leagueId)
        .single()
      if (!league) return err('League not found', 404)
      if (league.status !== 'active' || !league.show_on_landing) return err('League is not open for registration', 400)
      if (!Array.isArray(league.allowed_team_sizes) || !league.allowed_team_sizes.includes(size)) {
        return err('Selected team size is not allowed for this league')
      }

      // City + location must belong to league
      const { data: city } = await supabase.from('league_cities').select('id, name, league_id').eq('id', league_city_id).single()
      if (!city || city.league_id !== route.leagueId) return err('City not found for this league', 404)
      const { data: loc } = await supabase.from('league_locations').select('id, name, league_id, league_city_id').eq('id', league_location_id).single()
      if (!loc || loc.league_id !== route.leagueId || loc.league_city_id !== league_city_id) return err('Location not found for this city', 404)

      // Captain may register only one team per league
      const { data: existing } = await supabase
        .from('legacy_league_team_registrations')
        .select('id')
        .eq('league_id', route.leagueId)
        .eq('captain_user_id', user.id)
        .maybeSingle()
      if (existing) return err('You have already registered a team for this league', 409)

      const originalAmount = Number(league.price_per_person) * size
      const currency = league.currency || 'INR'

      // Optional coupon
      let couponId: string | null = null
      let couponCodeFinal: string | null = null
      let discountAmount = 0
      if (cleanedCoupon) {
        const { data: vc, error: vcErr } = await supabase.rpc('validate_coupon', {
          p_code: cleanedCoupon, p_user_id: user.id, p_session_id: null,
        })
        if (vcErr) return err(`Coupon error: ${vcErr.message}`, 400)
        const v = vc as { valid?: boolean; error?: string; coupon_id?: string; discount_type?: string; discount_value?: number; code?: string }
        if (!v?.valid) return err(v?.error || 'Invalid coupon code', 400)
        if (v.discount_type === 'percentage') {
          discountAmount = Math.round((originalAmount * Number(v.discount_value || 0)) / 100 * 100) / 100
        } else {
          discountAmount = Math.min(Number(v.discount_value || 0), originalAmount)
        }
        if (discountAmount < 0) discountAmount = 0
        if (discountAmount > originalAmount) discountAmount = originalAmount
        couponId = v.coupon_id || null
        couponCodeFinal = v.code || cleanedCoupon
      }
      const amount = Math.max(0, originalAmount - discountAmount)

      // Resolve payment gateway city: prefer league.payment_city, fallback to tenant city
      let gatewayCity: string | null = (league as any).payment_city || null
      if (!gatewayCity) {
        const { data: tenant } = await supabase.from('tenants').select('city').eq('id', league.tenant_id).single()
        gatewayCity = tenant?.city || null
      }
      if (!gatewayCity) return err('League payment account not configured', 500)

      const { data: gateway } = await supabase
        .from('payment_gateways')
        .select('api_key, api_secret, is_test_mode, is_active')
        .eq('city', gatewayCity).eq('name', 'razorpay').eq('is_active', true).maybeSingle()
      if (!gateway) return err('Payment gateway not configured for this city', 500)

      const apiKey = (gateway.api_key || '').trim()
      const citySlug = gatewayCity.toLowerCase().replace(/[^a-z0-9]/g, '_').toUpperCase()
      const apiSecret = (Deno.env.get(`RAZORPAY_SECRET_${citySlug}`) || gateway.api_secret || '').trim()
      if (!apiKey || !apiSecret) return err('Razorpay credentials missing', 500)

      // Helper: post-create captain + invite rows
      const finalizeTeam = async (regId: string) => {
        await supabase.from('legacy_league_team_members').insert({
          team_registration_id: regId,
          league_id: route.leagueId,
          user_id: user.id,
          role: 'captain',
          joined_via: 'captain',
        })
        if (cleanedInviteEmails.length > 0) {
          await supabase.from('legacy_league_team_invites').insert(
            cleanedInviteEmails.map((email) => ({
              team_registration_id: regId,
              league_id: route.leagueId,
              email,
              invited_by: user.id,
              status: 'pending',
            }))
          )
        }
      }

      // Helper: record coupon redemption (best effort, idempotency via order_id absent here for free path)
      const recordCouponRedemption = async (orderId: string | null) => {
        if (!couponId || discountAmount <= 0) return
        await supabase.from('coupon_redemptions').insert({
          coupon_id: couponId,
          user_id: user.id,
          session_id: null,
          order_id: orderId,
          discount_applied: discountAmount,
        })
        const { data: cpn } = await supabase.from('coupons').select('total_used').eq('id', couponId).single()
        if (cpn) await supabase.from('coupons').update({ total_used: (cpn.total_used || 0) + 1 }).eq('id', couponId)
      }

      // Free league (or 100% off coupon) — skip Razorpay entirely
      if (amount <= 0) {
        const { data: reg, error: regErr } = await supabase
          .from('legacy_league_team_registrations')
          .insert({
            league_id: route.leagueId,
            league_city_id,
            league_location_id,
            captain_user_id: user.id,
            team_name: team_name.trim(),
            team_size: size,
            total_amount: 0,
            original_amount: originalAmount,
            discount_amount: discountAmount,
            coupon_id: couponId,
            coupon_code: couponCodeFinal,
            currency,
            payment_status: 'paid',
          })
          .select()
          .single()
        if (regErr) return err(regErr.message, 500)
        await finalizeTeam(reg.id)
        await recordCouponRedemption(null)
        return json({ success: true, free: true, registration: reg, join_token: reg.join_token })
      }

      // Create Razorpay order
      const auth = btoa(`${apiKey}:${apiSecret}`)
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency,
          receipt: `lleg_${Date.now()}`,
          notes: { league_id: route.leagueId, captain_id: user.id, city: gatewayCity },
        }),
      })
      if (!rzpRes.ok) {
        console.error('Razorpay order create failed', rzpRes.status, await rzpRes.text())
        return err('Could not start payment', 500)
      }
      const order = await rzpRes.json()

      // Pending row for webhook reconciliation
      const { error: pErr } = await supabase
        .from('pending_legacy_league_team_registrations')
        .insert({
          razorpay_order_id: order.id,
          captain_user_id: user.id,
          league_id: route.leagueId,
          league_city_id,
          league_location_id,
          team_name: team_name.trim(),
          team_size: size,
          amount,
          original_amount: originalAmount,
          discount_amount: discountAmount,
          coupon_id: couponId,
          coupon_code: couponCodeFinal,
          currency,
          city: gatewayCity,
          status: 'pending',
          invite_emails: cleanedInviteEmails,
        })
      if (pErr) {
        console.error('pending insert failed', pErr)
        return err('Could not stage registration', 500)
      }

      return json({
        success: true,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: apiKey,
        league_name: league.name,
        original_amount: originalAmount,
        discount_amount: discountAmount,
        coupon_code: couponCodeFinal,
      })
    }

    // ── Verify team payment ─────────────────────────────────────────
    if (route.action === 'legacy-verify-team-payment' && route.leagueId && method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {}
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return err('Missing payment fields')

      const { data: pending } = await supabase
        .from('pending_legacy_league_team_registrations')
        .select('*')
        .eq('razorpay_order_id', razorpay_order_id)
        .single()
      if (!pending) return err('Pending registration not found', 404)
      if (pending.captain_user_id !== user.id) return err('Forbidden', 403)
      if (pending.league_id !== route.leagueId) return err('League mismatch', 400)

      // Resolve gateway city from league (payment_city) → tenant fallback. NOT pending.city
      // (pending.city is the team's selected city, which may not have its own Razorpay account)
      const { data: leagueRow } = await supabase
        .from('leagues')
        .select('tenant_id, payment_city')
        .eq('id', pending.league_id)
        .single()
      let gatewayCity: string | null = (leagueRow as any)?.payment_city || null
      if (!gatewayCity && leagueRow?.tenant_id) {
        const { data: tenant } = await supabase.from('tenants').select('city').eq('id', leagueRow.tenant_id).single()
        gatewayCity = tenant?.city || null
      }
      const { data: gw } = await supabase
        .from('payment_gateways')
        .select('api_secret')
        .eq('city', gatewayCity || '').eq('name', 'razorpay').eq('is_active', true).maybeSingle()
      const citySlug = (gatewayCity || '').toLowerCase().replace(/[^a-z0-9]/g, '_').toUpperCase()
      const apiSecret = (Deno.env.get(`RAZORPAY_SECRET_${citySlug}`) || gw?.api_secret || '').trim()
      if (!apiSecret) return err('Verification unavailable', 500)

      const expected = createHmac('sha256', apiSecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex')
      if (expected !== razorpay_signature) {
        await supabase.from('pending_legacy_league_team_registrations')
          .update({ status: 'invalid_signature', error_message: 'Signature mismatch' })
          .eq('id', pending.id)
        return err('Payment signature invalid', 400)
      }

      // Idempotency: if already completed, return existing
      if (pending.status === 'completed' && pending.registration_id) {
        const { data: reg } = await supabase
          .from('legacy_league_team_registrations')
          .select('*').eq('id', pending.registration_id).single()
        return json({ success: true, registration: reg, join_token: reg?.join_token })
      }

      const { data: reg, error: regErr } = await supabase
        .from('legacy_league_team_registrations')
        .insert({
          league_id: pending.league_id,
          league_city_id: pending.league_city_id,
          league_location_id: pending.league_location_id,
          captain_user_id: pending.captain_user_id,
          team_name: pending.team_name,
          team_size: pending.team_size,
          total_amount: pending.amount,
          original_amount: pending.original_amount ?? pending.amount,
          discount_amount: pending.discount_amount ?? 0,
          coupon_id: pending.coupon_id ?? null,
          coupon_code: pending.coupon_code ?? null,
          currency: pending.currency,
          payment_status: 'paid',
          razorpay_order_id,
          razorpay_payment_id,
        })
        .select()
        .single()
      if (regErr) {
        await supabase.from('pending_legacy_league_team_registrations')
          .update({ status: 'duplicate', error_message: regErr.message })
          .eq('id', pending.id)
        return err(regErr.message, 500)
      }

      // Record coupon redemption (best-effort)
      if (pending.coupon_id && Number(pending.discount_amount) > 0) {
        await supabase.from('coupon_redemptions').insert({
          coupon_id: pending.coupon_id,
          user_id: pending.captain_user_id,
          session_id: null,
          order_id: null,
          discount_applied: pending.discount_amount,
        })
        const { data: cpn } = await supabase.from('coupons').select('total_used').eq('id', pending.coupon_id).single()
        if (cpn) await supabase.from('coupons').update({ total_used: (cpn.total_used || 0) + 1 }).eq('id', pending.coupon_id)
      }

      // Captain into roster + invites from pending
      await supabase.from('legacy_league_team_members').insert({
        team_registration_id: reg.id,
        league_id: pending.league_id,
        user_id: pending.captain_user_id,
        role: 'captain',
        joined_via: 'captain',
      })
      const pendingEmails: string[] = Array.isArray(pending.invite_emails) ? pending.invite_emails : []
      if (pendingEmails.length > 0) {
        await supabase.from('legacy_league_team_invites').insert(
          pendingEmails.map((email: string) => ({
            team_registration_id: reg.id,
            league_id: pending.league_id,
            email,
            invited_by: pending.captain_user_id,
            status: 'pending',
          }))
        )
      }

      await supabase.from('pending_legacy_league_team_registrations')
        .update({ status: 'completed', registration_id: reg.id })
        .eq('id', pending.id)

      return json({ success: true, registration: reg, join_token: reg.join_token })
    }

    // ── Auto-claim email invites on login ───────────────────────────
    if (route.action === 'legacy-claim-invites' && method === 'POST') {
      if (!user.email) return json({ success: true, claimed: 0 })
      const { data, error } = await supabase.rpc('claim_legacy_league_invites', {
        _user_id: user.id, _email: user.email,
      })
      if (error) return err(error.message, 500)
      return json({ success: true, claimed: Number(data) || 0 })
    }

    // ── Claim by share token ────────────────────────────────────────
    if (route.action === 'legacy-claim-by-token' && method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const token = String(body?.token || '').trim()
      if (!token) return err('token required')
      const { data, error } = await supabase.rpc('claim_legacy_league_team_by_token', {
        _user_id: user.id, _token: token,
      })
      if (error) return err(error.message, 500)
      return json({ success: true, result: data })
    }

    // ── My team for a league ────────────────────────────────────────
    if (route.action === 'legacy-my-team' && route.leagueId && method === 'GET') {
      const { data: member } = await supabase
        .from('legacy_league_team_members')
        .select('team_registration_id, role')
        .eq('league_id', route.leagueId).eq('user_id', user.id).maybeSingle()
      if (!member) return json({ success: true, team: null })
      const { data: team } = await supabase
        .from('legacy_league_team_registrations')
        .select(`
          id, team_name, team_size, currency, total_amount, payment_status,
          join_token, captain_user_id, league_city_id, league_location_id,
          city:league_cities!league_city_id(name),
          location:league_locations!league_location_id(name)
        `)
        .eq('id', member.team_registration_id).single()
      const { data: members } = await supabase
        .from('legacy_league_team_members')
        .select('user_id, role, joined_at')
        .eq('team_registration_id', member.team_registration_id)
      const { data: invites } = await supabase
        .from('legacy_league_team_invites')
        .select('email, status')
        .eq('team_registration_id', member.team_registration_id)
      return json({ success: true, team, my_role: member.role, members: members || [], invites: invites || [] })
    }

    // ── List registered teams (admin) ───────────────────────────────
    if (route.action === 'legacy-registered-teams' && route.leagueId && method === 'GET') {
      const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
      if (!isAdmin) return err('Forbidden', 403)
      const { data, error } = await supabase
        .from('legacy_league_team_registrations')
        .select(`
          id, team_name, team_size, total_amount, currency, payment_status,
          razorpay_order_id, razorpay_payment_id, captain_user_id, created_at,
          league_city_id, league_location_id,
          city:league_cities!league_city_id(name),
          location:league_locations!league_location_id(name)
        `)
        .eq('league_id', route.leagueId)
        .order('created_at', { ascending: false })
      if (error) return err(error.message, 500)

      // Decorate with captain display_name + email
      const ids = Array.from(new Set((data || []).map((r: any) => r.captain_user_id))).filter(Boolean)
      let profilesById: Record<string, { display_name: string | null; email: string | null }> = {}
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name, email')
          .in('user_id', ids)
        for (const p of profs || []) {
          profilesById[(p as any).user_id] = { display_name: (p as any).display_name, email: (p as any).email }
        }
      }
      const decorated = (data || []).map((r: any) => ({
        ...r,
        captain_name: profilesById[r.captain_user_id]?.display_name ?? null,
        captain_email: profilesById[r.captain_user_id]?.email ?? null,
        city_name: r.city?.name ?? null,
        location_name: r.location?.name ?? null,
      }))
      return json(decorated)
    }

    return err('Not found', 404)
  } catch (e) {
    console.error('League service error:', e)
    return err('Internal server error', 500)
  }
})
