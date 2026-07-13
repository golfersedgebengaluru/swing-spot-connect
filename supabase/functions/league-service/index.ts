import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'node:crypto'
import {
  finalizeLegacyTeamRegistration,
  resolveOrCreateLegacyRegistration,
} from '../_shared/legacy-league-finalize.ts'


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

// ── Team-creation email helper (best-effort, never blocks team creation) ──
async function sendTeamCreationEmails(opts: {
  supabaseUrl: string
  serviceKey: string
  origin: string
  captainUserId: string
  captainEmail: string | null
  captainName: string | null
  leagueName: string
  teamName: string
  teamSize: number
  locationName: string | null
  joinToken: string | null
  inviteEmails: string[]
}) {
  const joinUrl = opts.joinToken ? `${opts.origin.replace(/\/$/, '')}/league-team-join/${opts.joinToken}` : ''
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.serviceKey}`,
    apikey: opts.serviceKey,
  }
  const post = (body: Record<string, unknown>) =>
    fetch(`${opts.supabaseUrl}/functions/v1/send-notification-email`, {
      method: 'POST', headers, body: JSON.stringify(body),
    }).then((r) => r.ok ? null : r.text().then((t) => console.error('[league email] failed', body.template, r.status, t)))
      .catch((e) => console.error('[league email] error', body.template, e))

  const tasks: Promise<unknown>[] = []
  // Captain confirmation
  if (opts.captainEmail) {
    tasks.push(post({
      user_id: opts.captainUserId,
      template: 'league_team_created',
      subject: `Team "${opts.teamName}" registered — ${opts.leagueName}`,
      data: {
        display_name: opts.captainName,
        league_name: opts.leagueName,
        team_name: opts.teamName,
        team_size: opts.teamSize,
        invites_sent: opts.inviteEmails.length,
        join_url: joinUrl,
      },
    }))
  }
  // Invitees
  for (const email of opts.inviteEmails) {
    tasks.push(post({
      user_id: null,
      recipient_email: email,
      template: 'league_team_invite',
      subject: `You've been added to "${opts.teamName}" — ${opts.leagueName}`,
      data: {
        captain_name: opts.captainName,
        league_name: opts.leagueName,
        team_name: opts.teamName,
        location: opts.locationName,
        join_url: joinUrl,
      },
    }))
  }
  // Admin notifications (free path — no payment)
  try {
    const adminSupabase = (await import('https://esm.sh/@supabase/supabase-js@2')).createClient(opts.supabaseUrl, opts.serviceKey)
    const { data: roleRows } = await adminSupabase.from('user_roles').select('user_id').eq('role', 'admin')
    const adminIds = ((roleRows || []) as Array<{ user_id: string }>).map((r) => r.user_id)
    if (adminIds.length > 0) {
      const { data: adminProfiles } = await adminSupabase.from('profiles').select('email').in('user_id', adminIds)
      const adminEmails = Array.from(new Set(((adminProfiles || []) as Array<{ email: string | null }>).map((p) => p.email).filter((e): e is string => !!e)))
      for (const adminEmail of adminEmails) {
        tasks.push(post({
          user_id: null,
          recipient_email: adminEmail,
          template: 'admin_league_registration',
          subject: `New registration: "${opts.teamName}" — ${opts.leagueName}`,
          data: {
            league_name: opts.leagueName,
            team_name: opts.teamName,
            captain_name: opts.captainName,
            captain_email: opts.captainEmail,
            location: opts.locationName,
            team_size: opts.teamSize,
            invites_sent: opts.inviteEmails.length,
          },
        }))
      }
    }
  } catch (e) {
    console.error('[league email] admin notify (free) failed:', e)
  }
  await Promise.allSettled(tasks)
}

// ── Managed-team email helpers ───────────────────────────────
// Sends welcome mail to every member with an email + admin notification.
async function sendManagedTeamEmails(opts: {
  supabaseUrl: string
  serviceKey: string
  origin: string
  registrationId: string
}) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.serviceKey}`,
    apikey: opts.serviceKey,
  }
  const adminSupabase = createClient(opts.supabaseUrl, opts.serviceKey, { auth: { persistSession: false } })
  const post = (body: Record<string, unknown>) =>
    fetch(`${opts.supabaseUrl}/functions/v1/send-notification-email`, {
      method: 'POST', headers, body: JSON.stringify(body),
    }).then((r) => r.ok ? null : r.text().then((t) => console.error('[managed email] failed', body.template, r.status, t)))
      .catch((e) => console.error('[managed email] error', body.template, e))

  const { data: reg } = await adminSupabase
    .from('legacy_league_team_registrations')
    .select('id, league_id, team_name, team_size, league_city_id, league_location_id')
    .eq('id', opts.registrationId).maybeSingle()
  if (!reg) return
  const [{ data: league }, { data: loc }, { data: members }] = await Promise.all([
    adminSupabase.from('leagues').select('name').eq('id', (reg as any).league_id).maybeSingle(),
    (reg as any).league_location_id
      ? adminSupabase.from('league_locations').select('name').eq('id', (reg as any).league_location_id).maybeSingle()
      : Promise.resolve({ data: null }),
    adminSupabase.from('legacy_league_team_members')
      .select('display_name, email, role')
      .eq('team_registration_id', opts.registrationId),
  ])
  const leagueName = (league as any)?.name || 'League'
  const locationName = (loc as any)?.name || null
  const teamName = (reg as any).team_name
  const teamSize = (reg as any).team_size
  const captainRow = ((members || []) as any[]).find((m) => m.role === 'captain') || null

  const tasks: Promise<unknown>[] = []
  for (const m of ((members || []) as any[])) {
    if (!m.email) continue
    tasks.push(post({
      user_id: null,
      recipient_email: m.email,
      template: 'league_managed_team_welcome',
      subject: `You've been added to "${teamName}" — ${leagueName}`,
      data: {
        display_name: m.display_name,
        league_name: leagueName,
        team_name: teamName,
        location: locationName,
        role: m.role,
      },
    }))
  }

  // Admin notification: global admins + site admins matching the league city
  try {
    let cityName: string | null = null
    if ((reg as any).league_city_id) {
      const { data: cityRow } = await adminSupabase
        .from('league_cities').select('name').eq('id', (reg as any).league_city_id).maybeSingle()
      cityName = (cityRow as any)?.name ?? null
    }
    const { data: adminRoles } = await adminSupabase.from('user_roles').select('user_id').eq('role', 'admin')
    const adminIds = ((adminRoles || []) as any[]).map((r) => r.user_id)
    const siteAdminIds: string[] = []
    if (cityName) {
      const aliases = new Set<string>([cityName.toLowerCase()])
      const lc = cityName.toLowerCase()
      if (lc === 'bangalore') aliases.add('bengaluru')
      if (lc === 'bengaluru') aliases.add('bangalore')
      const { data: sacRows } = await adminSupabase.from('site_admin_cities').select('user_id, city')
      for (const row of ((sacRows || []) as any[])) {
        if (row?.city && aliases.has(String(row.city).toLowerCase())) siteAdminIds.push(row.user_id)
      }
    }
    const allIds = Array.from(new Set([...adminIds, ...siteAdminIds]))
    if (allIds.length > 0) {
      const { data: adminProfiles } = await adminSupabase.from('profiles').select('email').in('user_id', allIds)
      const adminEmails = Array.from(new Set(((adminProfiles || []) as any[]).map((p) => p.email).filter((e): e is string => !!e)))
      for (const adminEmail of adminEmails) {
        tasks.push(post({
          user_id: null,
          recipient_email: adminEmail,
          template: 'admin_league_registration',
          subject: `New managed team: "${teamName}" — ${leagueName}`,
          data: {
            league_name: leagueName,
            team_name: teamName,
            captain_name: captainRow?.display_name || null,
            captain_email: captainRow?.email || null,
            location: locationName,
            team_size: teamSize,
            invites_sent: 0,
            managed: true,
          },
        }))
      }
    }
  } catch (e) { console.error('[managed email] admin notify failed:', e) }

  await Promise.allSettled(tasks)
}

async function sendManagedMemberWelcome(opts: {
  supabaseUrl: string
  serviceKey: string
  origin: string
  memberId: string
}) {
  const adminSupabase = createClient(opts.supabaseUrl, opts.serviceKey, { auth: { persistSession: false } })
  const { data: m } = await adminSupabase
    .from('legacy_league_team_members')
    .select('display_name, email, role, team_registration_id, league_id')
    .eq('id', opts.memberId).maybeSingle()
  if (!m || !(m as any).email) return
  const [{ data: reg }, { data: league }] = await Promise.all([
    adminSupabase.from('legacy_league_team_registrations')
      .select('team_name, league_location_id').eq('id', (m as any).team_registration_id).maybeSingle(),
    adminSupabase.from('leagues').select('name').eq('id', (m as any).league_id).maybeSingle(),
  ])
  const { data: loc } = (reg as any)?.league_location_id
    ? await adminSupabase.from('league_locations').select('name').eq('id', (reg as any).league_location_id).maybeSingle()
    : { data: null } as any
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.serviceKey}`,
    apikey: opts.serviceKey,
  }
  await fetch(`${opts.supabaseUrl}/functions/v1/send-notification-email`, {
    method: 'POST', headers, body: JSON.stringify({
      user_id: null,
      recipient_email: (m as any).email,
      template: 'league_managed_team_welcome',
      subject: `You've been added to "${(reg as any)?.team_name}" — ${(league as any)?.name || 'League'}`,
      data: {
        display_name: (m as any).display_name,
        league_name: (league as any)?.name || 'League',
        team_name: (reg as any)?.team_name,
        location: (loc as any)?.name || null,
        role: (m as any).role,
      },
    }),
  }).catch((e) => console.error('[managed member email]', e))
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
    if (leagueId === 'legacy' && subResource === 'claim-by-invite') {
      return { action: 'legacy-claim-by-invite' }
    }
    if (subResource === 'legacy-invites' && segments[4] && segments[5]) {
      // /leagues/:id/legacy-invites/:inviteId/(revoke|rotate)
      return { action: 'legacy-invite-action', leagueId, subResource, subId: segments[4], bookingId: segments[5] }
    }
    if (subResource === 'legacy-invites') {
      return { action: 'legacy-invites-list', leagueId, subResource }
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
    // Admin-managed teams:
    // POST   /leagues/:id/managed-teams
    // POST   /leagues/:id/managed-teams/:regId/members
    // PATCH  /leagues/:id/managed-members/:memberId
    // DELETE /leagues/:id/managed-members/:memberId
    if (subResource === 'managed-teams' && segments[4] && segments[5] === 'members') {
      return { action: 'admin-managed-add-member', leagueId, subId: segments[4] }
    }
    if (subResource === 'managed-teams') {
      return { action: 'admin-managed-create-team', leagueId }
    }
    if (subResource === 'managed-members' && segments[4]) {
      return { action: 'admin-managed-member', leagueId, subId: segments[4] }
    }
    // /leagues/:id/team-registrations/:regId  (PATCH / DELETE)
    if (subResource === 'team-registrations' && segments[4]) {
      return { action: 'admin-team-registration', leagueId, subId: segments[4] }
    }
    // /leagues/:id/screen → public bay-screen meta
    if (subResource === 'screen') {
      return { action: 'league-screen', leagueId, subResource }
    }
    // /leagues/:id/screen-leaderboard → public bay-screen leaderboard
    if (subResource === 'screen-leaderboard') {
      return { action: 'league-screen-leaderboard', leagueId, subResource }
    }
    // /leagues/:id/par-sets/:parSetId
    if (subResource === 'par-sets' && segments[4]) {
      return { action: 'league-par-set-detail', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/par-sets
    if (subResource === 'par-sets') {
      return { action: 'league-par-sets', leagueId, subResource }
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
    .select('tenant_id, scoring_holes, fairness_factor_pct, team_aggregation_method, peoria_multiplier, stableford_enabled')
    .eq('id', leagueId)
    .single()
  if (!league) throw new Error('League not found')

  let cityScopedPlayerIds: Set<string> | null = null
  let cityScopedTeamIds: Set<string> | null = null
  if (scopeParam === 'city' && cityIdParam) {
    // Include BOTH identity keys used in league_scores.player_id:
    //   user_id for claimed players, league_players.id for admin-added shadows.
    const { data: cityPlayers } = await supabase.from('league_players').select('id, user_id').eq('league_id', leagueId).eq('league_city_id', cityIdParam)
    cityScopedPlayerIds = new Set<string>()
    for (const p of (cityPlayers || []) as any[]) {
      if (p.user_id) cityScopedPlayerIds.add(p.user_id)
      cityScopedPlayerIds.add(p.id)
    }
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
    .select('round_number, par_per_hole, course_name')
    .eq('league_id', leagueId)

  // ── Per-team par resolver ─────────────────────────────────
  // For each (userId, roundNumber): resolve par via
  //   round.course_name + player-location.software → league_par_sets match.
  // Falls back to round.par_per_hole when any piece is missing.
  const [{ data: parSetsAll }, { data: locsAll }, { data: playersAll }] = await Promise.all([
    supabase.from('league_par_sets').select('course_name, software, par_per_hole').eq('league_id', leagueId),
    supabase.from('league_locations').select('id, software').eq('league_id', leagueId),
    supabase.from('league_players').select('id, user_id, league_location_id, league_teams!team_id(league_location_id)').eq('league_id', leagueId),
  ])
  const parSetMap: Record<string, number[]> = {}
  for (const ps of ((parSetsAll || []) as any[])) {
    parSetMap[`${ps.course_name}||${ps.software}`] = (ps.par_per_hole as number[]) || []
  }
  const locSoftware: Record<string, string> = {}
  for (const l of ((locsAll || []) as any[])) locSoftware[l.id] = l.software || 'TGC'
  // Key by BOTH user_id (claimed players) and league_players.id (shadow players)
  // because score.player_id can be either.
  const userLocation: Record<string, string | null> = {}
  for (const p of ((playersAll || []) as any[])) {
    const teamLoc = Array.isArray(p.league_teams) ? p.league_teams[0]?.league_location_id : p.league_teams?.league_location_id
    const loc = p.league_location_id || teamLoc || null
    if (p.user_id) userLocation[p.user_id] = loc
    userLocation[p.id] = loc
  }
  const roundInfo: Record<number, { par: number[]; course: string | null }> = {}
  for (const r of ((allRounds || []) as any[])) {
    roundInfo[r.round_number] = { par: (r.par_per_hole as number[]) || [], course: r.course_name || null }
  }
  const resolvePar = (playerKey: string, roundNumber: number): number[] => {
    const info = roundInfo[roundNumber]
    if (!info) return []
    if (info.course) {
      const locId = userLocation[playerKey]

      const sw = locId ? locSoftware[locId] : null
      if (sw) {
        const custom = parSetMap[`${info.course}||${sw}`]
        if (custom && custom.length > 0) return custom
      }
    }
    return info.par
  }
  const resolveTotalPar = (userId: string, roundNumber: number): number =>
    resolvePar(userId, roundNumber).reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0)

  // Legacy maps kept for team best-ball loop (see below); they use round.par as team default.
  const roundParMap: Record<number, number> = {}
  const parPerHoleMap: Record<number, number[]> = {}
  for (const r of ((allRounds || []) as any[])) {
    const arr = (r.par_per_hole as number[]) || []
    roundParMap[r.round_number] = arr.reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0)
    parPerHoleMap[r.round_number] = arr.map((p) => Number(p) || 0)
  }

  const HC_MULTIPLIER = 3
  const fairnessPct = Number(league.fairness_factor_pct) || 0
  const aggregation = league.team_aggregation_method || 'best_ball'

  // Modified Stableford points layer (additive, does not affect stroke logic).
  // Tiers: ≤−3 +8, −2 +5, −1 +2, 0 0, +1 −1, ≥+2 −2 (capped).
  const holeToStableford = (strokes: number, par: number): number => {
    if (!strokes || strokes <= 0 || !par || par <= 0) return 0
    const diff = strokes - par
    if (diff <= -3) return 8
    if (diff === -2) return 5
    if (diff === -1) return 2
    if (diff === 0) return 0
    if (diff === 1) return -1
    return -2
  }
  const sumStableford = (holes: number[], pars: number[]): number => {
    let total = 0
    for (let i = 0; i < holes.length; i++) total += holeToStableford(holes[i], pars[i] ?? 0)
    return total
  }

  interface PlayerScoreEntry {
    player_id: string
    round_number: number
    gross_score: number
    net_score: number
    hidden_hole_sum: number
    peoria_handicap: number
    hole_scores: number[]
    stableford_points: number
  }

  const playerScores: PlayerScoreEntry[] = []
  for (const score of scores) {
    const holeScores = (score.hole_scores as number[]) || []
    const grossScore = score.total_score || holeScores.reduce((s: number, v: number) => s + (v || 0), 0)
    const hiddenHoles = hiddenHolesMap[score.round_number]
    // Per-team par: resolved by (round.course_name, player's location software).
    const parsForRound = resolvePar(score.player_id, score.round_number)
    const roundPar = parsForRound.reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0)
    let netScore = grossScore
    let hiddenSum = 0
    let handicap = 0
    if (hiddenHoles && holeScores.length > 0 && roundPar > 0) {
      hiddenSum = hiddenHoles.reduce((sum, holeNum) => sum + (holeScores[holeNum - 1] || 0), 0)
      handicap = Math.max(0, (hiddenSum * HC_MULTIPLIER) - roundPar)
      netScore = grossScore - handicap
    }
    playerScores.push({
      player_id: score.player_id,
      round_number: score.round_number,
      gross_score: grossScore,
      net_score: netScore,
      hidden_hole_sum: hiddenSum,
      peoria_handicap: handicap,
      hole_scores: holeScores,
      stableford_points: sumStableford(holeScores, parsForRound),
    })
  }


  const { data: teams } = await supabase.from('league_teams').select('id, name, max_roster_size').eq('league_id', leagueId)
  const { data: teamMembers } = await supabase.from('league_team_members').select('team_id, player_id').in('team_id', (teams || []).map((t: any) => t.id))
  const { data: playerRows } = await supabase.from('league_players').select('id, user_id, team_id, display_name, email').eq('league_id', leagueId)

  // Identity key for a score/player row: user_id when present, else league_players.id
  // (shadow / admin-managed players don't have a user_id).
  const playerRowById: Record<string, any> = {}
  for (const p of (playerRows || [])) playerRowById[p.id] = p
  const identityKey = (p: any): string => (p?.user_id || p?.id)

  const playerIdToTeamId: Record<string, string> = {}
  for (const tm of (teamMembers || [])) {
    const playerRow = playerRowById[tm.player_id]
    if (playerRow) playerIdToTeamId[identityKey(playerRow)] = tm.team_id
  }
  for (const p of (playerRows || [])) {
    const k = identityKey(p)
    if (p.team_id && !playerIdToTeamId[k]) {
      playerIdToTeamId[k] = p.team_id
    }
  }

  // All identity keys we may need names for: score authors + rostered teammates.
  const rosterKeys = (playerRows || []).map(identityKey).filter(Boolean)
  const allNeededIds = [...new Set([
    ...playerScores.map((ps) => ps.player_id),
    ...rosterKeys,
  ])]
  const allPlayerIds = [...new Set(playerScores.map((ps) => ps.player_id))]

  // Name map: seed with league_players.display_name / email (covers shadow rows),
  // then override with profiles.display_name for claimed users.
  const nameMap: Record<string, string> = {}
  for (const p of (playerRows || [])) {
    const dn = (p.display_name || '').trim()
    const em = (p.email || '').trim()
    let name = dn
    if (!name && em && !em.includes('privaterelay.appleid.com')) name = em.split('@')[0]
    if (name) {
      if (p.user_id) nameMap[p.user_id] = name
      nameMap[p.id] = name
    }
  }
  const userIdsToLookup = allNeededIds.filter((id) => !!id)
  if (userIdsToLookup.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, email')
      .in('user_id', userIdsToLookup)
    for (const p of (profiles || [])) {
      const dn = (p.display_name || '').trim()
      const em = (p.email || '').trim()
      let name = dn
      if (!name && em && !em.includes('privaterelay.appleid.com')) name = em.split('@')[0]
      if (name) nameMap[p.user_id] = name
    }
  }
  const nameFor = (uid: string) => nameMap[uid] || 'Player'


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
    /** Modified Stableford points (additive layer on top of stroke scoring). */
    total_stableford: number
    rounds_played: number
    /** True when the entrant has submitted scores for every published (closed) round. */
    qualified?: boolean
    breakdown: { round: number; gross: number; net: number; handicap: number; par: number; net_vs_par: number; stableford: number }[]
    members?: { player_id: string; name: string; net_score: number; gross_score: number; total_par: number; vs_par: number; stableford?: number }[]
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
      const totalPar = pScores.reduce((s, p) => s + resolveTotalPar(playerId, p.round_number), 0)
      const totalStableford = pScores.reduce((s, p) => s + (p.stableford_points || 0), 0)
      const teamId = playerIdToTeamId[playerId]
      entries.push({
        type: 'individual',
        id: playerId,
        name: nameFor(playerId),
        team_name: teamId ? teamMap[teamId] : undefined,
        total_gross: totalGross,
        total_net: totalNet,
        final_score: totalNet,
        total_par: totalPar,
        net_vs_par: totalNet - totalPar,
        final_vs_par: totalNet - totalPar,
        total_stableford: totalStableford,
        rounds_played: pScores.length,
        breakdown: pScores.map((p) => {
          const par = resolveTotalPar(playerId, p.round_number)
          return { round: p.round_number, gross: p.gross_score, net: p.net_score, handicap: p.peoria_handicap, par, net_vs_par: p.net_score - par, stableford: p.stableford_points || 0 }
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
      let teamTotalStableford = 0
      const teamBreakdown: { round: number; gross: number; net: number; handicap: number; par: number; net_vs_par: number; stableford: number }[] = []
      for (const rn of roundNumbers) {
        const memberScoresForRound = playerScores.filter(
          (ps) => memberUserIds.includes(ps.player_id) && ps.round_number === rn
        )
        if (memberScoresForRound.length === 0) continue
        // Build per-hole best-ball (min across teammates, skipping 0) once and
        // reuse for both gross aggregation (best-ball leagues) and Stableford.
        const teamHoleArrays = memberScoresForRound.map((p) => p.hole_scores || [])
        const len = Math.max(0, ...teamHoleArrays.map((a) => a.length))
        const bestBallHoles: number[] = new Array(len).fill(0)
        for (let i = 0; i < len; i++) {
          let best = 0
          for (const arr of teamHoleArrays) {
            const v = arr[i]
            if (typeof v === 'number' && v > 0 && (best === 0 || v < best)) best = v
          }
          bestBallHoles[i] = best
        }
        let roundGross: number
        if (aggregation === 'best_ball') {
          // Best ball = per-hole minimum summed, NOT the lower player's total.
          const bestBallGross = bestBallHoles.reduce((s, v) => s + (v || 0), 0)
          if (bestBallGross > 0) {
            roundGross = bestBallGross
          } else {
            // Fallback when hole-level data is missing: use lowest player total.
            const best = memberScoresForRound.reduce((a, b) => a.gross_score < b.gross_score ? a : b)
            roundGross = best.gross_score
          }
        } else {
          roundGross = memberScoresForRound.reduce((s, p) => s + p.gross_score, 0) / memberScoresForRound.length
        }
        // Team par: all members share a location, so use first member's resolved par.
        const teamParUid = memberScoresForRound[0]?.player_id || memberUserIds[0]
        const parsForRound = resolvePar(teamParUid, rn)
        const roundPar = parsForRound.reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0)
        // Team Peoria handicap: apply the Peoria formula to the team's BEST-BALL
        // score on the hidden holes (per-hole minimum across teammates), rather
        // than averaging each player's individually-computed handicap.
        // Fall back to the average of individual handicaps when hidden holes are
        // not yet revealed or per-hole data is missing (so live leaderboards
        // mid-round don't regress).
        const hiddenHolesForRound = hiddenHolesMap[rn]
        let roundHandicap: number
        if (hiddenHolesForRound && bestBallHoles.length > 0 && roundPar > 0) {
          const teamHiddenSum = hiddenHolesForRound.reduce(
            (sum, holeNum) => sum + (bestBallHoles[holeNum - 1] || 0), 0,
          )
          roundHandicap = Math.max(0, (teamHiddenSum * HC_MULTIPLIER) - roundPar)
        } else {
          roundHandicap = memberScoresForRound.reduce((s, p) => s + p.peoria_handicap, 0) / memberScoresForRound.length
        }
        const roundNet = roundGross - roundHandicap
        const roundStableford = sumStableford(bestBallHoles, parsForRound)

        teamTotalNet += roundNet
        teamTotalGross += roundGross
        teamTotalPar += roundPar
        teamTotalStableford += roundStableford
        teamBreakdown.push({
          round: rn,
          gross: Math.round(roundGross * 100) / 100,
          net: Math.round(roundNet * 100) / 100,
          handicap: Math.round(roundHandicap * 100) / 100,
          par: roundPar,
          net_vs_par: Math.round((roundNet - roundPar) * 100) / 100,
          stableford: roundStableford,
        })
      }
      const finalScore = teamTotalNet * (1 - fairnessPct / 100)
      const memberDetails = memberUserIds.map((uid) => {
        const ms = individualScores[uid] || []
        const net = ms.reduce((s, p) => s + p.net_score, 0)
        const gross = ms.reduce((s, p) => s + p.gross_score, 0)
        const par = ms.reduce((s, p) => s + resolveTotalPar(uid, p.round_number), 0)
        const stableford = ms.reduce((s, p) => s + (p.stableford_points || 0), 0)
        return {
          player_id: uid,
          name: nameFor(uid),
          net_score: net,
          gross_score: gross,
          total_par: par,
          vs_par: net - par,
          stableford,
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
        total_stableford: teamTotalStableford,
        rounds_played: teamBreakdown.length,
        breakdown: teamBreakdown,
        members: memberDetails,
      })
    }
  }

  // Qualification: an entry qualifies for ranking only after submitting scores for
  // every published round. Non-qualified entries are always ranked below all
  // qualified ones (grouped-sort), regardless of score.
  const publishedRoundSet = new Set<number>(Object.keys(hiddenHolesMap).map((k) => Number(k)))
  const totalActiveRounds = publishedRoundSet.size
  for (const e of entries) {
    const playedPublished = totalActiveRounds === 0
      ? 0
      : (e.breakdown || []).filter((b) => publishedRoundSet.has(b.round)).length
    e.qualified = totalActiveRounds === 0 ? true : playedPublished >= totalActiveRounds
  }

  // Primary rank: Modified Stableford points (highest first) when enabled.
  // When disabled, fall back to lower final stroke score wins.
  const stablefordEnabled = league.stableford_enabled !== false
  entries.sort((a, b) => {
    // Qualified entrants always ahead of non-qualified.
    if ((a.qualified ? 1 : 0) !== (b.qualified ? 1 : 0)) return a.qualified ? -1 : 1
    if (stablefordEnabled) {
      const ptsDiff = (b.total_stableford || 0) - (a.total_stableford || 0)
      if (ptsDiff !== 0) return ptsDiff
    }
    return a.final_score - b.final_score
  })
  const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }))
  const handicapActive = Object.keys(hiddenHolesMap).length > 0
  return { entries: ranked, round: roundParam, filter: filterParam, scope: scopeParam, league_city_id: cityIdParam, handicap_active: handicapActive, stableford_enabled: stablefordEnabled, total_active_rounds: totalActiveRounds }

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
      const { data: rounds } = await supabase
        .from('league_rounds')
        .select('round_number, name, start_date, end_date')
        .eq('league_id', route.leagueId)
        .order('round_number', { ascending: true })
      const { data: hh } = await supabase
        .from('league_round_hidden_holes')
        .select('round_number, revealed_at')
        .eq('league_id', route.leagueId)
      const closedMap: Record<number, string | null> = {}
      for (const r of (hh || []) as Array<{ round_number: number; revealed_at: string | null }>) {
        closedMap[r.round_number] = r.revealed_at
      }
      return json({
        league: { id: league.id, name: league.name, status: league.status },
        branding: {
          logo_url: branding?.logo_url || tenant?.default_logo_url || null,
          sponsor_name: branding?.sponsor_name || null,
          sponsor_logo_url: branding?.sponsor_logo_url || null,
          sponsor_url: branding?.sponsor_url || null,
        },
        cities: cities || [],
        rounds: (rounds || []).map((r: any) => ({
          round_number: r.round_number,
          name: r.name,
          start_date: r.start_date,
          end_date: r.end_date,
          closed_at: closedMap[r.round_number] ?? null,
        })),
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
          landing_note: typeof body.landing_note === 'string' && body.landing_note.trim() ? body.landing_note.trim() : null,
          price_per_person: typeof body.price_per_person === 'number' ? body.price_per_person : 0,
          currency: body.currency || 'INR',
          payment_city: typeof body.payment_city === 'string' && body.payment_city.trim() ? body.payment_city.trim() : null,
          gst_mode: ['none','inclusive','exclusive'].includes(body.gst_mode) ? body.gst_mode : 'none',
          gst_rate: typeof body.gst_rate === 'number' ? body.gst_rate : 0,
          sac_code: typeof body.sac_code === 'string' && body.sac_code.trim() ? body.sac_code.trim() : '9996',
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
        const allowed = ['name', 'format', 'season_start', 'season_end', 'venue_id', 'status', 'score_entry_method', 'scoring_holes', 'fairness_factor_pct', 'team_aggregation_method', 'peoria_multiplier', 'stableford_enabled', 'allowed_team_sizes', 'show_on_landing', 'landing_note', 'price_per_person', 'currency', 'payment_city', 'gst_mode', 'gst_rate', 'sac_code']
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

        // Resolve per-player par via (round.course_name, player-location.software) → league_par_sets
        const [{ data: parSetsAll }, { data: locsAll }, { data: playersAll }, { data: roundsAll }, { data: teamsAll }] = await Promise.all([
          supabase.from('league_par_sets').select('course_name, software, par_per_hole').eq('league_id', route.leagueId),
          supabase.from('league_locations').select('id, software').eq('league_id', route.leagueId),
          supabase.from('league_players').select('id, user_id, display_name, team_id, league_location_id, league_teams!team_id(league_location_id)').eq('league_id', route.leagueId),
          supabase.from('league_rounds').select('round_number, par_per_hole, course_name').eq('league_id', route.leagueId),
          supabase.from('league_teams').select('id, name').eq('league_id', route.leagueId),
        ])
        const parSetMap: Record<string, number[]> = {}
        for (const ps of ((parSetsAll || []) as any[])) {
          parSetMap[`${ps.course_name}||${ps.software}`] = (ps.par_per_hole as number[]) || []
        }
        const locSoftware: Record<string, string> = {}
        for (const l of ((locsAll || []) as any[])) locSoftware[l.id] = l.software || 'TGC'
        // Index league_players by BOTH user_id and league_players.id so we
        // resolve shadow rows (user_id NULL, score.player_id = league_players.id).
        const playerByKey: Record<string, { id: string; user_id: string | null; display_name: string | null; team_id: string | null; location_id: string | null }> = {}
        for (const p of ((playersAll || []) as any[])) {
          const teamLoc = Array.isArray(p.league_teams) ? p.league_teams[0]?.league_location_id : p.league_teams?.league_location_id
          const rec = {
            id: p.id,
            user_id: p.user_id || null,
            display_name: p.display_name || null,
            team_id: p.team_id || null,
            location_id: p.league_location_id || teamLoc || null,
          }
          playerByKey[p.id] = rec
          if (p.user_id) playerByKey[p.user_id] = rec
        }
        // Enrich player names from profiles for claimed users
        const claimedUserIds = [...new Set((data || []).map((s: any) => s.player_id).filter((id: string) => playerByKey[id]?.user_id === id))]
        let profileMap: Record<string, string> = {}
        if (claimedUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, display_name')
            .in('user_id', claimedUserIds)
          if (profiles) {
            profileMap = Object.fromEntries(profiles.map((p: any) => [p.user_id, p.display_name || '']))
          }
        }
        const teamNameMap: Record<string, string> = {}
        for (const t of ((teamsAll || []) as any[])) teamNameMap[t.id] = t.name
        const roundInfo: Record<number, { par: number[]; course: string | null }> = {}
        for (const r of ((roundsAll || []) as any[])) {
          roundInfo[r.round_number] = { par: (r.par_per_hole as number[]) || [], course: r.course_name || null }
        }
        const resolveParFor = (playerKey: string, roundNumber: number): number[] => {
          const info = roundInfo[roundNumber]
          if (!info) return []
          if (info.course) {
            const locId = playerByKey[playerKey]?.location_id || null
            const sw = locId ? locSoftware[locId] : null
            if (sw) {
              const custom = parSetMap[`${info.course}||${sw}`]
              if (custom && custom.length > 0) return custom
            }
          }
          return info.par
        }

        const enriched = (data || []).map((s: any) => {
          const rec = playerByKey[s.player_id]
          const tid = rec?.team_id || null
          const name = profileMap[s.player_id] || rec?.display_name || null
          return {
            ...s,
            player_name: name,
            league_player_id: rec?.id || null,
            resolved_par_per_hole: resolveParFor(s.player_id, s.round_number),
            team_id: tid,
            team_name: tid ? (teamNameMap[tid] || null) : null,
          }
        })

        return json(enriched)
      }

      if (method === 'POST') {
        if (league.status !== 'active') return err('League is not active')

        const body = await req.json()
        if (!body.hole_scores && !body.total_score) return err('hole_scores or total_score required')

        // Block score submission for closed rounds (revealed_at = round was closed).
        const submitRound = body.round_number || 1
        const { data: hhRow } = await supabase
          .from('league_round_hidden_holes')
          .select('revealed_at')
          .eq('league_id', route.leagueId)
          .eq('round_number', submitRound)
          .maybeSingle()
        if (hhRow?.revealed_at) {
          return err(`Round ${submitRound} is closed — scores can no longer be submitted`, 403)
        }

        const method_val = body.method || 'manual'
        const validMethods = ['photo_ocr', 'manual', 'api']
        if (!validMethods.includes(method_val)) return err('Invalid score method')

        // Determine target player. Admins can submit on behalf of others.
        // Preferred: body.league_player_id (league_players.id) — works for managed/shadow players (user_id NULL).
        // Legacy: body.player_id (user_id).
        let targetPlayerId = user.id
        let actorRole: string = 'player'
        if (body.league_player_id) {
          const role = await getUserLeagueRole(supabase, user.id, tenantId)
          if (role !== 'franchise_admin' && role !== 'site_admin' && role !== 'league_admin') {
            return err('Only admins can submit scores for other players', 403)
          }
          const { data: lp } = await supabase.from('league_players')
            .select('id, user_id')
            .eq('league_id', route.leagueId)
            .eq('id', body.league_player_id)
            .maybeSingle()
          if (!lp) return err('Target player is not in this league', 404)
          // Use user_id when present; fall back to league_players.id (unique uuid) for shadow rows.
          targetPlayerId = lp.user_id || lp.id
          actorRole = role
        } else if (body.player_id && body.player_id !== user.id) {
          const role = await getUserLeagueRole(supabase, user.id, tenantId)
          if (role !== 'franchise_admin' && role !== 'site_admin' && role !== 'league_admin') {
            return err('Only admins can submit scores for other players', 403)
          }
          // Verify target player belongs to this league
          const { data: lp } = await supabase.from('league_players').select('user_id').eq('league_id', route.leagueId).eq('user_id', body.player_id).maybeSingle()
          if (!lp) return err('Target player is not in this league', 404)
          targetPlayerId = body.player_id
          actorRole = role
        } else {
          // Self-submit path: caller must be a rostered player in this league,
          // otherwise the row would be an orphan (no team linkage, no name).
          const { data: selfLp } = await supabase
            .from('league_players')
            .select('id')
            .eq('league_id', route.leagueId)
            .eq('user_id', user.id)
            .maybeSingle()
          if (!selfLp) return err('You are not registered as a player in this league', 403)
        }

        // Apply per-hole cap (project rule: max +4 over par per hole) for gross-stroke formats only.
        // Stableford / match_play encode different per-hole semantics so we skip the cap there.
        // Par is resolved per player: round.course_name + player-location.software → league_par_sets,
        // falling back to round.par_per_hole. This mirrors the leaderboard's resolver so the cap
        // matches the pars later shown for the same score.
        let holeScores: number[] = Array.isArray(body.hole_scores) ? [...body.hole_scores] : []
        const STROKE_FORMATS = ['stroke_play', 'scramble', 'best_ball', 'skins']
        if (holeScores.length > 0 && body.round_number) {
          const { data: leagueFmt } = await supabase.from('leagues').select('format').eq('id', route.leagueId).single()
          if (leagueFmt && STROKE_FORMATS.includes(leagueFmt.format)) {
            const [{ data: roundRow }, { data: parSetsAll }, { data: locsAll }, { data: playerRow }] = await Promise.all([
              supabase
                .from('league_rounds')
                .select('par_per_hole, course_name')
                .eq('league_id', route.leagueId)
                .eq('round_number', body.round_number)
                .maybeSingle(),
              supabase.from('league_par_sets').select('course_name, software, par_per_hole').eq('league_id', route.leagueId),
              supabase.from('league_locations').select('id, software').eq('league_id', route.leagueId),
              supabase
                .from('league_players')
                .select('league_location_id, league_teams!team_id(league_location_id)')
                .eq('league_id', route.leagueId)
                .or(`user_id.eq.${targetPlayerId},id.eq.${targetPlayerId}`)
                .maybeSingle(),
            ])
            // Resolve player's location (own, then team fallback) → software → par set.
            const teamLoc = Array.isArray((playerRow as any)?.league_teams)
              ? (playerRow as any).league_teams[0]?.league_location_id
              : (playerRow as any)?.league_teams?.league_location_id
            const locId = (playerRow as any)?.league_location_id || teamLoc || null
            const sw = locId ? (((locsAll || []) as any[]).find((l) => l.id === locId)?.software || null) : null
            const course = (roundRow as any)?.course_name || null
            let parPerHole = ((roundRow?.par_per_hole as number[] | null) || [])
            if (course && sw) {
              const match = ((parSetsAll || []) as any[]).find((ps) => ps.course_name === course && ps.software === sw)
              if (match && Array.isArray(match.par_per_hole) && match.par_per_hole.length > 0) {
                parPerHole = match.par_per_hole as number[]
              }
            }
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
          .select('id, league_id, user_id, joined_via_code_id, joined_at, league_city_id, league_location_id, team_id, display_name, email, phone')
          .eq('league_id', route.leagueId)
          .order('joined_at')
        if (pErr) return err(pErr.message, 500)

        // Resolve profile info for each player
        const userIds = (players || []).map((p: any) => p.user_id).filter(Boolean)
        let profiles: any[] = []
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id, display_name, email')
            .in('user_id', userIds)
          profiles = profs || []
        }

        // Fallback: admin-managed team members store display_name/email on
        // legacy_league_team_members (no profiles row until they claim).
        let managedByUserId = new Map<string, { display_name: string | null; email: string | null }>()
        if (userIds.length > 0) {
          const { data: managed } = await supabase
            .from('legacy_league_team_members')
            .select('user_id, display_name, email')
            .eq('league_id', route.leagueId)
            .in('user_id', userIds)
          for (const m of (managed || []) as any[]) {
            if (m.user_id) managedByUserId.set(m.user_id, { display_name: m.display_name, email: m.email })
          }
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
          const prof = p.user_id ? profileMap.get(p.user_id) : null
          const managed = p.user_id ? managedByUserId.get(p.user_id) : null
          return {
            ...p,
            display_name: prof?.display_name || p.display_name || managed?.display_name || null,
            email: prof?.email || p.email || managed?.email || null,
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
        // Attach closed_at (from league_round_hidden_holes.revealed_at) so the
        // UI can disable score submission for closed rounds.
        const { data: hhRows } = await supabase
          .from('league_round_hidden_holes')
          .select('round_number, revealed_at')
          .eq('league_id', route.leagueId)
        const closedMap = new Map<number, string | null>()
        for (const r of (hhRows || []) as Array<{ round_number: number; revealed_at: string | null }>) {
          closedMap.set(r.round_number, r.revealed_at)
        }
        const enriched = (data || []).map((r: any) => ({
          ...r,
          closed_at: closedMap.get(r.round_number) ?? null,
        }))
        return json(enriched)
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
          course_name: (typeof body.course_name === 'string' && body.course_name.trim()) ? body.course_name.trim() : null,
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
        if (body.course_name !== undefined) {
          updates.course_name = (typeof body.course_name === 'string' && body.course_name.trim()) ? body.course_name.trim() : null
        }
        if (Array.isArray(body.par_per_hole)) {
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
          .select('*, league_team_members(*, league_players(id, user_id, display_name, email))')
          .eq('league_id', route.leagueId)
          .order('name')
        if (error) return err(error.message, 500)

        // Enrich with player display names. Shadow (admin-managed) players have
        // no user_id / profile row — fall back to league_players.display_name/email.
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

        const resolveName = (lp: any): string | null => {
          if (!lp) return null
          const fromProfile = lp.user_id ? profileMap[lp.user_id] : null
          if (fromProfile) return fromProfile
          const dn = (lp.display_name || '').trim()
          if (dn) return dn
          const em = (lp.email || '').trim()
          if (em && !em.includes('privaterelay.appleid.com')) return em.split('@')[0]
          return null
        }

        const enriched = (data || []).map((t: any) => ({
          ...t,
          members: (t.league_team_members || []).map((m: any) => ({
            id: m.id,
            player_id: m.player_id,
            user_id: m.league_players?.user_id,
            display_name: resolveName(m.league_players),
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

        // ── Collect every identity key ever associated with this team ──
        // league_scores.player_id is dual-identity: user_id for claimed players,
        // league_players.id for admin-added shadow players. Purge both.
        const userIds = new Set<string>()          // claimed user_ids (also used to purge feed_items.actor_id)
        const scorePlayerIds = new Set<string>()   // union: user_ids + shadow league_players.id

        // New-model members via league_players
        const { data: newMembers } = await supabase
          .from('league_team_members')
          .select('player_id, league_players(id, user_id)')
          .eq('team_id', route.subId)
        for (const m of (newMembers || []) as any[]) {
          const lp = m?.league_players
          const uid = lp?.user_id
          if (uid) {
            userIds.add(uid)
            scorePlayerIds.add(uid)
          }
          if (lp?.id) scorePlayerIds.add(lp.id)     // shadow rows: score.player_id = league_players.id
          else if (m?.player_id) scorePlayerIds.add(m.player_id)
        }

        // Legacy registration (match by captain_user_id when possible, else team_name)
        const { data: legacyRegs } = await supabase
          .from('legacy_league_team_registrations')
          .select('id, captain_user_id')
          .eq('league_id', route.leagueId)
          .eq('team_name', (team as any).name)
        const legacyRegIds = ((legacyRegs || []) as any[]).map((r) => r.id)
        for (const r of (legacyRegs || []) as any[]) if (r.captain_user_id) {
          userIds.add(r.captain_user_id)
          scorePlayerIds.add(r.captain_user_id)
        }
        if (legacyRegIds.length) {
          const { data: legacyMembers } = await supabase
            .from('legacy_league_team_members')
            .select('user_id, league_player_id')
            .in('team_registration_id', legacyRegIds)
          for (const m of (legacyMembers || []) as any[]) {
            if (m.user_id) {
              userIds.add(m.user_id)
              scorePlayerIds.add(m.user_id)
            }
            if (m.league_player_id) scorePlayerIds.add(m.league_player_id)
          }
        }

        const userIdList = Array.from(userIds)
        const scorePlayerIdList = Array.from(scorePlayerIds)

        const { error } = await supabase.from('league_teams').delete().eq('id', route.subId)
        if (error) return err(error.message, 500)

        // Delete the mirrored legacy registration (cascades to legacy members/invites)
        // so the captain no longer sees the team on their /leagues page.
        const { error: legacyErr } = await supabase
          .from('legacy_league_team_registrations')
          .delete()
          .eq('league_id', route.leagueId)
          .eq('team_name', (team as any).name)
        if (legacyErr) console.error('[league-team-detail DELETE] legacy cleanup failed:', legacyErr.message)

        // Purge scores for BOTH claimed and shadow players; feed items are only
        // ever authored by claimed users (actor_id = auth user_id).
        if (scorePlayerIdList.length > 0) {
          const { error: scoresErr } = await supabase
            .from('league_scores')
            .delete()
            .eq('league_id', route.leagueId)
            .in('player_id', scorePlayerIdList)
          if (scoresErr) console.error('[league-team-detail DELETE] league_scores cleanup failed:', scoresErr.message)
        }
        if (userIdList.length > 0) {


          const { error: feedErr } = await supabase
            .from('league_feed_items')
            .delete()
            .eq('league_id', route.leagueId)
            .in('actor_id', userIdList)
          if (feedErr) console.error('[league-team-detail DELETE] league_feed_items cleanup failed:', feedErr.message)
        }

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

          const peoriaHandicap = roundPar > 0 ? Math.max(0, (hiddenSum * HC_MULTIPLIER) - roundPar) : 0
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
            software: typeof body.software === 'string' && ['TGC','GSPro','Other'].includes(body.software) ? body.software : 'TGC',
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
        if (typeof body.software === 'string' && ['TGC','GSPro','Other'].includes(body.software)) {
          updates.software = body.software
        }
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

    // ── LEAGUE PAR SETS (list/create) ────────────────────────
    if (route.action === 'league-par-sets' && route.leagueId) {
      const { data: league } = await supabase.from('leagues').select('tenant_id, scoring_holes').eq('id', route.leagueId).single()
      if (!league) return err('League not found', 404)
      const tenantId = league.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (!role) return err('No access', 403)

      if (method === 'GET') {
        const { data, error } = await supabase
          .from('league_par_sets')
          .select('*')
          .eq('league_id', route.leagueId)
          .order('name', { ascending: true })
        if (error) return err(error.message, 500)
        return json(data)
      }

      if (method === 'POST') {
        if (role !== 'franchise_admin' && role !== 'site_admin' && role !== 'league_admin') return err('Forbidden', 403)
        const body = await req.json().catch(() => ({}))
        if (!body.name || typeof body.name !== 'string') return err('name is required')
        const courseName = (typeof body.course_name === 'string' && body.course_name.trim()) ? body.course_name.trim() : body.name.trim()
        const holes = league.scoring_holes || 18
        let parPerHole: number[] = Array(holes).fill(4)
        if (Array.isArray(body.par_per_hole) && body.par_per_hole.length > 0) {
          if (body.par_per_hole.length !== holes) return err(`par_per_hole must have ${holes} entries`)
          if (body.par_per_hole.some((p: number) => !Number.isInteger(p) || p < 3 || p > 6)) return err('par values must be integers 3-6')
          parPerHole = body.par_per_hole
        }
        const software = typeof body.software === 'string' && body.software.trim() ? body.software.trim() : 'TGC'
        const { data, error } = await supabase
          .from('league_par_sets')
          .insert({
            league_id: route.leagueId,
            tenant_id: tenantId,
            name: body.name.trim(),
            course_name: courseName,
            software,
            par_per_hole: parPerHole,
            created_by: user.id,
          })
          .select()
          .single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueParSetCreated', 'league_par_set', data.id, null, data)
        return json(data, 201)
      }

      return err('Method not allowed', 405)
    }

    // ── LEAGUE PAR SET DETAIL (PATCH / DELETE) ───────────────
    if (route.action === 'league-par-set-detail' && route.leagueId && route.subId) {
      const { data: ps } = await supabase.from('league_par_sets').select('*').eq('id', route.subId).single()
      if (!ps || ps.league_id !== route.leagueId) return err('Par set not found', 404)
      const tenantId = ps.tenant_id
      const role = await getUserLeagueRole(supabase, user.id, tenantId)
      if (role !== 'franchise_admin' && role !== 'site_admin' && role !== 'league_admin') return err('Forbidden', 403)

      if (method === 'PATCH') {
        const body = await req.json().catch(() => ({}))
        const { data: league } = await supabase.from('leagues').select('scoring_holes').eq('id', route.leagueId).single()
        const holes = league?.scoring_holes || 18
        const updates: Record<string, unknown> = {}
        if (typeof body.name === 'string') updates.name = body.name.trim()
        if (typeof body.software === 'string') updates.software = body.software.trim()
        if (typeof body.course_name === 'string') updates.course_name = body.course_name.trim()
        if (Array.isArray(body.par_per_hole)) {
          if (body.par_per_hole.length !== holes) return err(`par_per_hole must have ${holes} entries`)
          if (body.par_per_hole.some((p: number) => !Number.isInteger(p) || p < 3 || p > 6)) return err('par values must be integers 3-6')
          updates.par_per_hole = body.par_per_hole
        }
        if (Object.keys(updates).length === 0) return err('No valid fields')
        const { data, error } = await supabase.from('league_par_sets').update(updates).eq('id', route.subId).select().single()
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueParSetUpdated', 'league_par_set', route.subId, ps, data)
        return json(data)
      }

      if (method === 'DELETE') {
        const { error } = await supabase.from('league_par_sets').delete().eq('id', route.subId)
        if (error) return err(error.message, 500)
        await audit(supabase, tenantId, route.leagueId, user.id, role, 'LeagueParSetDeleted', 'league_par_set', route.subId, ps, null)
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
      // Load league_players first so shadow (admin-managed) rows — whose scores
      // are keyed by league_players.id, not user_id — still resolve to a name.
      const { data: leaguePlayers } = await supabase
        .from('league_players')
        .select('id, user_id, display_name, email')
        .eq('league_id', leagueId)
      const claimedUserIds = ((leaguePlayers || []) as any[]).map((p) => p.user_id).filter(Boolean)
      const { data: profiles } = claimedUserIds.length > 0
        ? await supabase.from('profiles').select('user_id, display_name, email').in('user_id', claimedUserIds)
        : { data: [] as any[] }

      const hiddenMap: Record<number, number[]> = {}
      for (const hh of (allHH || [])) {
        if ((hh as any).revealed_at) hiddenMap[(hh as any).round_number] = (hh as any).hidden_holes as number[]
      }
      const parMap: Record<number, number> = {}
      for (const r of (rounds || [])) {
        const arr = ((r as any).par_per_hole as number[]) || []
        parMap[(r as any).round_number] = arr.reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0)
      }
      const readableName = (dn?: string | null, em?: string | null): string => {
        const d = (dn || '').trim()
        if (d) return d
        const e = (em || '').trim()
        if (e && !e.includes('privaterelay.appleid.com')) return e.split('@')[0]
        return ''
      }
      const nameMap: Record<string, string> = {}
      // Seed from league_players (covers shadow rows and gives us a name
      // under BOTH the user_id and the league_players.id).
      for (const p of ((leaguePlayers || []) as any[])) {
        const name = readableName(p.display_name, p.email)
        if (!name) continue
        if (p.user_id) nameMap[p.user_id] = name
        nameMap[p.id] = name
      }
      // Override with profile name for claimed users.
      for (const p of ((profiles || []) as any[])) {
        const name = readableName(p.display_name, p.email)
        if (name) nameMap[p.user_id] = name
      }



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
          handicap = Math.max(0, (hSum * HC_MULT) - par)
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

      // Qualification: only players who submitted scores for every published
      // round are eligible for ranking / awards. Others rank below all qualified.
      const publishedRoundSet = new Set<number>(Object.keys(hiddenMap).map((k) => Number(k)))
      const totalActiveRounds = publishedRoundSet.size

      const netStandings: any[] = []
      const grossStandings: any[] = []
      for (const [pid, list] of Object.entries(byPlayer)) {
        const totalGross = list.reduce((s, r) => s + r.gross, 0)
        const totalNet = list.reduce((s, r) => s + r.net, 0)
        const totalPar = list.reduce((s, r) => s + r.par, 0)
        const playedPublished = totalActiveRounds === 0
          ? 0
          : list.filter((r) => publishedRoundSet.has(r.round_number)).length
        const qualified = totalActiveRounds === 0 ? true : playedPublished >= totalActiveRounds
        const base = {
          player_id: pid,
          name: nameMap[pid] || 'Player',
          total_gross: totalGross,
          total_net: totalNet,
          total_par: totalPar,
          rounds_played: list.length,
          qualified,
        }
        netStandings.push({ ...base, score: totalNet, vs_par: totalNet - totalPar })
        grossStandings.push({ ...base, score: totalGross, vs_par: totalGross - totalPar })
      }
      const groupSort = (a: any, b: any) => {
        if ((a.qualified ? 1 : 0) !== (b.qualified ? 1 : 0)) return a.qualified ? -1 : 1
        return a.vs_par - b.vs_par
      }
      netStandings.sort(groupSort)
      grossStandings.sort(groupSort)
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
        .select('id, tenant_id, name, status, show_on_landing, allowed_team_sizes, price_per_person, currency, payment_city, gst_mode, gst_rate, sac_code')
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

      const pricePerPerson = Number(league.price_per_person) || 0
      const lineAmount = pricePerPerson * size
      const gstMode = (league as any).gst_mode || 'none'
      const gstRate = Number((league as any).gst_rate) || 0
      const sacCode = (league as any).sac_code || '9996'

      // Compute originalAmount (gross, what user pays) and the GST breakup
      let originalAmount = lineAmount
      let taxableAmount = lineAmount
      let gstAmount = 0
      if (gstMode === 'exclusive' && gstRate > 0) {
        gstAmount = Math.round(lineAmount * gstRate) / 100
        originalAmount = Math.round((lineAmount + gstAmount) * 100) / 100
        taxableAmount = lineAmount
      } else if (gstMode === 'inclusive' && gstRate > 0) {
        taxableAmount = Math.round((lineAmount / (1 + gstRate / 100)) * 100) / 100
        gstAmount = Math.round((lineAmount - taxableAmount) * 100) / 100
        originalAmount = lineAmount
      }
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

      // Helper: post-create captain + invite rows, bridge to new tables, send emails
      const finalizeTeam = async (regId: string, joinToken: string | null) => {
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
        // Bridge into new league_teams / league_players / league_team_members / league_roles
        // so the team appears in admin Teams tab and the captain sees the league in /leagues.
        const { error: promErr } = await supabase.rpc('promote_legacy_team_member', {
          _registration_id: regId,
          _user_id: user.id,
        })
        if (promErr) console.error('promote_legacy_team_member (free path) failed:', promErr)

        // Best-effort email notifications — never block team creation
        try {
          const [{ data: captainProfile }, { data: loc }] = await Promise.all([
            supabase.from('profiles').select('email, display_name').eq('user_id', user.id).maybeSingle(),
            supabase.from('league_locations').select('name').eq('id', league_location_id).maybeSingle(),
          ])
          const origin = req.headers.get('origin') || req.headers.get('referer') || 'https://golfersedge.golf-collective.com'
          await sendTeamCreationEmails({
            supabaseUrl: Deno.env.get('SUPABASE_URL')!,
            serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            origin: origin.replace(/(https?:\/\/[^/]+).*/, '$1'),
            captainUserId: user.id,
            captainEmail: captainProfile?.email || user.email || null,
            captainName: captainProfile?.display_name || null,
            leagueName: (league as any)?.name || 'League',
            teamName: team_name.trim(),
            teamSize: size,
            locationName: loc?.name || null,
            joinToken,
            inviteEmails: cleanedInviteEmails,
          })
        } catch (e) {
          console.error('[league email] finalize (free) failed:', e)
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
            gst_mode: gstMode,
            gst_rate: gstRate,
            sac_code: sacCode,
            taxable_amount: taxableAmount,
            gst_amount: gstAmount,
            payment_status: 'paid',
          })
          .select()
          .single()
        if (regErr) return err(regErr.message, 500)
        await finalizeTeam(reg.id, reg.join_token)
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
          gst_mode: gstMode,
          gst_rate: gstRate,
          sac_code: sacCode,
          taxable_amount: taxableAmount,
          gst_amount: gstAmount,
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
        gst_mode: gstMode,
        gst_rate: gstRate,
        sac_code: sacCode,
        taxable_amount: taxableAmount,
        gst_amount: gstAmount,
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

      // Race-safe: lookup existing reg by order_id, else insert; on
      // (league_id, captain_user_id) unique violation, return the winner.
      // Either the browser, the webhook, or the reconciler may win — all
      // three converge on the same idempotent finalize path below.
      const resolved = await resolveOrCreateLegacyRegistration(
        supabase,
        pending as any,
        razorpay_order_id,
        razorpay_payment_id,
      )
      if (!resolved.reg) {
        await supabase.from('pending_legacy_league_team_registrations')
          .update({ status: 'error', error_message: resolved.error ?? 'resolve failed' })
          .eq('id', pending.id)
        return err(resolved.error ?? 'Could not finalize registration', 500)
      }
      const reg = resolved.reg

      // Record coupon redemption — ONLY when we are the inserter, so we don't
      // double-count a coupon the webhook already booked.
      if (resolved.created && pending.coupon_id && Number(pending.discount_amount) > 0) {
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

      // Always mark pending → completed with the resolved registration id,
      // even when another finalizer beat us to the insert. This stops the
      // captain's browser from re-rendering the Create Team screen.
      await supabase.from('pending_legacy_league_team_registrations')
        .update({ status: 'completed', registration_id: reg.id, error_message: null })
        .eq('id', pending.id)

      // Finalize roster + invites + promote + emails. Fully idempotent —
      // duplicate inserts on (team_registration_id, user_id) and
      // (team_registration_id, email) are swallowed inside the helper.
      const pendingEmails: string[] = Array.isArray(pending.invite_emails) ? pending.invite_emails : []
      const origin = req.headers.get('origin') || req.headers.get('referer') || 'https://golfersedge.golf-collective.com'
      try {
        await finalizeLegacyTeamRegistration({
          admin: supabase,
          supabaseUrl: Deno.env.get('SUPABASE_URL')!,
          serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          origin: origin.replace(/(https?:\/\/[^/]+).*/, '$1'),
          registrationId: reg.id,
          leagueId: pending.league_id,
          captainUserId: pending.captain_user_id,
          teamName: pending.team_name,
          teamSize: pending.team_size,
          locationId: pending.league_location_id ?? null,
          inviteEmails: pendingEmails,
          joinToken: reg.join_token,
        })
      } catch (e) {
        console.error('[league] finalizeLegacyTeamRegistration failed:', (e as Error).message)
      }

      return json({ success: true, registration: reg, join_token: reg.join_token })
    }

    // ── Auto-claim email invites on login ───────────────────────────
    if (route.action === 'legacy-claim-invites' && method === 'POST') {
      if (!user.email) return json({ success: true, claimed: 0 })
      const { data, error } = await supabase.rpc('claim_legacy_league_invites', {
        _user_id: user.id, _email: user.email,
      })
      if (error) return err(error.message, 500)
      // Also auto-link any admin-added managed rows matching this email.
      // NOTE: Supabase query builders are thenables, NOT real Promises — do
      // NOT chain `.catch()` directly on them (it throws synchronously and
      // crashes the whole request). Always await + try/catch, or await + check
      // the returned `error` field. See guardrail test:
      // supabase/functions/league-service/__tests__/no-builder-catch.test.ts
      try {
        const { error: linkErr } = await supabase.rpc('link_managed_member_on_login', {
          _user_id: user.id, _email: user.email,
        })
        if (linkErr) console.error('link_managed_member_on_login failed:', linkErr.message)
      } catch (e: any) {
        console.error('link_managed_member_on_login threw:', e?.message || e)
      }
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

    // ── Claim by per-invite token (bulletproof: email-matched) ──────
    if (route.action === 'legacy-claim-by-invite' && method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const inviteToken = String(body?.invite_token || '').trim()
      if (!inviteToken) return err('invite_token required')
      const { data, error } = await supabase.rpc('claim_legacy_league_invite_by_token', {
        _user_id: user.id, _invite_token: inviteToken,
      })
      if (error) return err(error.message, 500)
      return json({ success: true, result: data })
    }

    // ── Admin: list legacy invites for a league ─────────────────────
    if (route.action === 'legacy-invites-list' && route.leagueId && method === 'GET') {
      const { data, error } = await supabase.rpc('admin_list_legacy_team_invites', {
        _caller: user.id, _league_id: route.leagueId,
      })
      if (error) return err(error.message, 403)
      return json(data || [])
    }

    // ── Admin/captain: revoke or rotate a legacy invite ─────────────
    if (route.action === 'legacy-invite-action' && method === 'POST') {
      const inviteId = route.subId!
      const op = route.bookingId
      if (op === 'revoke') {
        const { data, error } = await supabase.rpc('admin_revoke_legacy_invite', {
          _caller: user.id, _invite_id: inviteId,
        })
        if (error) return err(error.message, 403)
        return json({ success: true, result: data })
      }
      if (op === 'rotate') {
        const { data, error } = await supabase.rpc('admin_rotate_legacy_invite', {
          _caller: user.id, _invite_id: inviteId,
        })
        if (error) return err(error.message, 403)
        return json({ success: true, result: data })
      }
      return err('Unknown invite action', 400)
    }

    // ── My team for a league ────────────────────────────────────────
    if (route.action === 'legacy-my-team' && route.leagueId && method === 'GET') {
      // Path 1: caller is in legacy_league_team_members directly
      let { data: member } = await supabase
        .from('legacy_league_team_members')
        .select('team_registration_id, role')
        .eq('league_id', route.leagueId).eq('user_id', user.id).maybeSingle()

      // Path 2: caller joined via hybrid team code — look up via league_players + league_team_members
      if (!member) {
        const { data: myPlayer } = await supabase
          .from('league_players')
          .select('id, team_id')
          .eq('league_id', route.leagueId).eq('user_id', user.id).maybeSingle()
        if (myPlayer?.team_id) {
          const { data: reg } = await supabase
            .from('legacy_league_team_registrations')
            .select('id, captain_user_id')
            .eq('league_team_id', myPlayer.team_id).maybeSingle()
          if (reg) {
            member = {
              team_registration_id: reg.id,
              role: reg.captain_user_id === user.id ? 'captain' : 'member',
            } as any
          }
        }
      }

      if (!member) return json({ success: true, team: null })
      const { data: team } = await supabase
        .from('legacy_league_team_registrations')
        .select(`
          id, team_name, team_size, currency, total_amount, payment_status,
          join_token, captain_user_id, league_city_id, league_location_id, league_team_id,
          city:league_cities!league_city_id(name),
          location:league_locations!league_location_id(name)
        `)
        .eq('id', member.team_registration_id).single()
      const { data: rawMembers } = await supabase
        .from('legacy_league_team_members')
        .select('user_id, role, joined_at, display_name, email')
        .eq('team_registration_id', member.team_registration_id)
      // Enrich with profiles for claimed members (managed rows already carry
      // display_name/email in-place). Emails are only exposed to the captain.
      const mUserIds = Array.from(new Set((rawMembers || []).map((m: any) => m.user_id).filter(Boolean)))
      let profMap = new Map<string, { display_name: string | null; email: string | null }>()
      if (mUserIds.length) {
        const { data: profs } = await supabase
          .from('profiles').select('user_id, display_name, email').in('user_id', mUserIds)
        for (const p of (profs || []) as any[]) {
          profMap.set(p.user_id, { display_name: p.display_name, email: p.email })
        }
      }
      const isCaptain = member.role === 'captain'
      const members = (rawMembers || []).map((m: any) => {
        const prof = m.user_id ? profMap.get(m.user_id) : undefined
        const name = prof?.display_name || m.display_name || null
        const email = prof?.email || m.email || null
        return {
          user_id: m.user_id,
          role: m.role,
          joined_at: m.joined_at,
          display_name: name,
          email: isCaptain ? email : null,
        }
      })
      const { data: invites } = await supabase
        .from('legacy_league_team_invites')
        .select('email, status')
        .eq('team_registration_id', member.team_registration_id)

      // Roster from league_players (hybrid model) — gives client the
      // league_player_id needed to match scores for shadow (unclaimed) rows
      // whose league_scores.player_id is league_players.id, not a user_id.
      let roster: Array<{ id: string; user_id: string | null; display_name: string | null }> = []
      if ((team as any)?.league_team_id) {
        const { data: lps } = await supabase
          .from('league_players')
          .select('id, user_id, display_name')
          .eq('league_id', route.leagueId)
          .eq('team_id', (team as any).league_team_id)
        roster = (lps || []).map((p: any) => ({
          id: p.id,
          user_id: p.user_id || null,
          display_name: p.display_name || null,
        }))
      }
      return json({ success: true, team, my_role: member.role, members, invites: invites || [], roster })
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
          created_by_admin, created_by_admin_user_id,
          league_city_id, league_location_id,
          city:league_cities!league_city_id(name),
          location:league_locations!league_location_id(name)
        `)
        .eq('league_id', route.leagueId)
        .order('created_at', { ascending: false })
      if (error) return err(error.message, 500)

      // Fetch members for all these teams
      const regIds = (data || []).map((r: any) => r.id)
      let membersByReg: Record<string, any[]> = {}
      if (regIds.length) {
        const { data: memRows } = await supabase
          .from('legacy_league_team_members')
          .select('id, team_registration_id, user_id, role, joined_via, display_name, email, phone, added_by_admin_user_id, joined_at')
          .in('team_registration_id', regIds)
        for (const m of (memRows || []) as any[]) {
          const arr = membersByReg[m.team_registration_id] || []
          arr.push(m); membersByReg[m.team_registration_id] = arr
        }
      }

      // Decorate captain from profiles OR from the captain member row (managed teams)
      const userIds = Array.from(new Set([
        ...((data || []) as any[]).map((r) => r.captain_user_id),
        ...Object.values(membersByReg).flat().map((m: any) => m.user_id).filter(Boolean),
      ])).filter(Boolean)
      let profilesById: Record<string, { display_name: string | null; email: string | null }> = {}
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles').select('user_id, display_name, email').in('user_id', userIds)
        for (const p of profs || []) {
          profilesById[(p as any).user_id] = { display_name: (p as any).display_name, email: (p as any).email }
        }
      }
      const decorated = (data || []).map((r: any) => {
        const teamMembers = (membersByReg[r.id] || []).map((m: any) => ({
          ...m,
          linked_display_name: m.user_id ? profilesById[m.user_id]?.display_name ?? null : null,
          linked_email: m.user_id ? profilesById[m.user_id]?.email ?? null : null,
        }))
        const captainMember = teamMembers.find((m: any) => m.role === 'captain')
        const captainName = r.created_by_admin
          ? (captainMember?.display_name || captainMember?.linked_display_name || null)
          : (profilesById[r.captain_user_id]?.display_name ?? null)
        const captainEmail = r.created_by_admin
          ? (captainMember?.email || captainMember?.linked_email || null)
          : (profilesById[r.captain_user_id]?.email ?? null)
        return {
          ...r,
          captain_name: captainName,
          captain_email: captainEmail,
          city_name: r.city?.name ?? null,
          location_name: r.location?.name ?? null,
          members: teamMembers,
        }
      })
      return json(decorated)
    }


    // ============================================================
    // Admin-managed teams
    // ============================================================
    if (route.action === 'admin-managed-create-team' && route.leagueId && method === 'POST') {
      const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
      if (!isAdmin) return err('Forbidden', 403)
      const body = await req.json().catch(() => ({}))
      const { league_city_id, league_location_id, team_name, members } = body || {}
      if (!league_city_id || !league_location_id || !team_name || !Array.isArray(members) || members.length < 1) {
        return err('league_city_id, league_location_id, team_name and members[] are required')
      }
      const { data, error } = await supabase.rpc('admin_create_managed_team', {
        _caller: user.id,
        _league_id: route.leagueId,
        _league_city_id: league_city_id,
        _league_location_id: league_location_id,
        _team_name: String(team_name).trim(),
        _members: members,
      })
      if (error) return err(error.message, 400)
      const result = data as any
      if (!result?.ok) return err(result?.error || 'create_failed', 400)
      // Best-effort emails
      try {
        const origin = (req.headers.get('origin') || req.headers.get('referer') || 'https://golfersedge.golf-collective.com').replace(/(https?:\/\/[^/]+).*/, '$1')
        await sendManagedTeamEmails({
          supabaseUrl: Deno.env.get('SUPABASE_URL')!,
          serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          origin,
          registrationId: result.registration_id,
        })
      } catch (e) { console.error('[managed emails] failed:', e) }
      return json({ success: true, registration_id: result.registration_id })
    }

    if (route.action === 'admin-managed-add-member' && route.leagueId && route.subId && method === 'POST') {
      const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
      if (!isAdmin) return err('Forbidden', 403)
      const body = await req.json().catch(() => ({}))
      const { data, error } = await supabase.rpc('admin_add_managed_member', {
        _caller: user.id,
        _registration_id: route.subId,
        _name: body?.name || null,
        _email: body?.email || null,
        _phone: body?.phone || null,
      })
      if (error) return err(error.message, 400)
      const result = data as any
      if (!result?.ok) return err(result?.error || 'add_failed', result?.error === 'team_full' ? 409 : 400)
      try {
        const origin = (req.headers.get('origin') || req.headers.get('referer') || 'https://golfersedge.golf-collective.com').replace(/(https?:\/\/[^/]+).*/, '$1')
        await sendManagedMemberWelcome({
          supabaseUrl: Deno.env.get('SUPABASE_URL')!,
          serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          origin,
          memberId: result.member_id,
        })
      } catch (e) { console.error('[managed member email] failed:', e) }
      return json({ success: true, member_id: result.member_id })
    }

    if (route.action === 'admin-managed-member' && route.subId && method === 'PATCH') {
      const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
      if (!isAdmin) return err('Forbidden', 403)
      const body = await req.json().catch(() => ({}))
      const { data, error } = await supabase.rpc('admin_update_managed_member', {
        _caller: user.id,
        _member_id: route.subId,
        _name: body?.name || null,
        _email: body?.email || null,
        _phone: body?.phone || null,
      })
      if (error) return err(error.message, 400)
      const result = data as any
      if (!result?.ok) return err(result?.error || 'update_failed', 400)
      return json({ success: true })
    }

    if (route.action === 'admin-managed-member' && route.subId && method === 'DELETE') {
      const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
      if (!isAdmin) return err('Forbidden', 403)
      const { data, error } = await supabase.rpc('admin_delete_managed_member', {
        _caller: user.id, _member_id: route.subId,
      })
      if (error) return err(error.message, 400)
      const result = data as any
      if (!result?.ok) return err(result?.error || 'delete_failed', 400)
      return json({ success: true })
    }

    if (route.action === 'admin-team-registration' && route.leagueId && route.subId && method === 'PATCH') {
      const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
      if (!isAdmin) return err('Forbidden', 403)
      const body = await req.json().catch(() => ({}))
      const { team_name, league_city_id, league_location_id, team_size } = body || {}
      if (!team_name || !league_city_id || !league_location_id || !team_size) {
        return err('team_name, league_city_id, league_location_id, team_size required')
      }
      const { data, error } = await supabase.rpc('admin_update_team_registration', {
        _caller: user.id,
        _registration_id: route.subId,
        _team_name: String(team_name).trim(),
        _league_city_id: league_city_id,
        _league_location_id: league_location_id,
        _team_size: Number(team_size),
      })
      if (error) return err(error.message, 400)
      const result = data as any
      if (!result?.ok) return err(result?.error || 'update_failed', 400)
      return json({ success: true })
    }

    if (route.action === 'admin-team-registration' && route.leagueId && route.subId && method === 'DELETE') {
      const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
      if (!isAdmin) return err('Forbidden', 403)
      const { data, error } = await supabase.rpc('admin_delete_team_registration', {
        _caller: user.id, _registration_id: route.subId,
      })
      if (error) return err(error.message, 400)
      const result = data as any
      if (!result?.ok) return err(result?.error || 'delete_failed', 400)
      return json({ success: true })
    }

    return err('Not found', 404)
  } catch (e) {
    console.error('League service error:', e)
    return err('Internal server error', 500)
  }
})
