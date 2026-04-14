import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
  if (resource === 'tenants') return { action: 'tenants' }
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
    // /leagues/:id/players/:playerId
    if (subResource === 'players' && segments[4]) {
      return { action: 'league-player-detail', leagueId, subResource, bookingId: segments[4] }
    }
    // /leagues/:id/rounds/:roundId/competitions
    if (subResource === 'rounds' && segments[4] && segments[5] === 'competitions') {
      return { action: 'league-round-competitions', leagueId, subResource, subId: segments[4] }
    }
    // /leagues/:id/rounds/:roundId
    if (subResource === 'rounds' && segments[4]) {
      return { action: 'league-round-detail', leagueId, subResource, subId: segments[4] }
    }
    return { action: `league-${subResource}`, leagueId, subResource }
  }
  return { action: 'unknown' }
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

  const user = await getUser(req, supabase)
  if (!user) return err('Unauthorized', 401)

  const url = new URL(req.url)
  const route = parseRoute(url)
  const method = req.method

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
        const allowed = ['name', 'format', 'season_start', 'season_end', 'venue_id', 'status', 'score_entry_method']
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

        const code = generateCode()
        const { data, error } = await supabase.from('league_join_codes').insert({
          league_id: route.leagueId,
          code,
          expires_at: expiresAt,
          max_uses: maxUses,
          created_by: user.id,
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
      const { data: player, error: jErr } = await supabase.from('league_players').insert({
        league_id: joinCode.league_id,
        user_id: user.id,
        joined_via_code_id: joinCode.id,
      }).select().single()

      if (jErr) return err(jErr.message, 500)

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

      await audit(supabase, tenantId, joinCode.league_id, user.id, 'player', 'PlayerJoined', 'league_player', player.id, null, player)
      return json({ success: true, league_id: joinCode.league_id }, 201)
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

        // Calculate total from holes if provided
        let totalScore = body.total_score
        if (body.hole_scores && Array.isArray(body.hole_scores)) {
          totalScore = body.hole_scores.reduce((sum: number, s: number) => sum + (s || 0), 0)
        }

        const { data: score, error: sErr } = await supabase.from('league_scores').insert({
          league_id: route.leagueId,
          player_id: user.id,
          tenant_id: tenantId,
          round_number: body.round_number || 1,
          hole_scores: body.hole_scores || [],
          total_score: totalScore,
          method: method_val,
          photo_url: body.photo_url ?? null,
          confirmed_at: method_val === 'manual' ? new Date().toISOString() : null,
          submitted_by: user.id,
        }).select().single()

        if (sErr) return err(sErr.message, 500)

        await audit(supabase, tenantId, route.leagueId, user.id, 'player', 'ScoreSubmitted', 'league_score', score.id, null, score)
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
          .select('id, league_id, user_id, joined_via_code_id, joined_at')
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

        const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]))
        const enriched = (players || []).map((p: any) => ({
          ...p,
          display_name: profileMap.get(p.user_id)?.display_name || null,
          email: profileMap.get(p.user_id)?.email || null,
        }))

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

        const { data, error } = await supabase.from('league_rounds').insert({
          league_id: route.leagueId,
          tenant_id: tenantId,
          round_number: body.round_number || nextRound,
          name: body.name,
          description: body.description ?? null,
          start_date: body.start_date,
          end_date: body.end_date,
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

    return err('Not found', 404)
  } catch (e) {
    console.error('League service error:', e)
    return err('Internal server error', 500)
  }
})
