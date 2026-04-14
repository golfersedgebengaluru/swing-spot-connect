// ── Enums ────────────────────────────────────────────────────
export type LeagueFormat = 'stroke_play' | 'match_play' | 'stableford' | 'scramble' | 'best_ball' | 'skins';
export type LeagueStatus = 'draft' | 'active' | 'completed' | 'archived';
export type ScoreEntryMethod = 'photo_ocr' | 'manual' | 'api' | 'not_set';
export type LeagueRoleType = 'franchise_admin' | 'league_admin' | 'player';

// ── Tenant ───────────────────────────────────────────────────
export interface Tenant {
  id: string;
  name: string;
  city: string;
  sponsorship_enabled: boolean;
  default_logo_url: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── League ───────────────────────────────────────────────────
export interface League {
  id: string;
  tenant_id: string;
  name: string;
  format: LeagueFormat;
  season_start: string | null;
  season_end: string | null;
  venue_id: string | null;
  status: LeagueStatus;
  score_entry_method: ScoreEntryMethod;
  created_by: string;
  created_at: string;
  updated_at: string;
  league_branding: LeagueBranding | null;
  resolved_logo_url?: string | null;
}

// ── Branding ─────────────────────────────────────────────────
export interface LeagueBranding {
  id: string;
  league_id: string;
  logo_url: string | null;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  sponsor_url: string | null;
  placement_slots: string[];
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
}

// ── Join Code ────────────────────────────────────────────────
export interface LeagueJoinCode {
  id: string;
  league_id: string;
  code: string;
  expires_at: string | null;
  revoked_at: string | null;
  max_uses: number;
  use_count: number;
  created_by: string;
  created_at: string;
}

// ── Player ───────────────────────────────────────────────────
export interface LeaguePlayer {
  id: string;
  league_id: string;
  user_id: string;
  joined_via_code_id: string | null;
  joined_at: string;
}

// ── Score ─────────────────────────────────────────────────────
export interface LeagueScore {
  id: string;
  league_id: string;
  player_id: string;
  tenant_id: string;
  round_number: number;
  hole_scores: number[];
  total_score: number | null;
  method: ScoreEntryMethod;
  photo_url: string | null;
  confirmed_at: string | null;
  submitted_by: string;
  created_at: string;
  updated_at: string;
}

// ── Audit Log ────────────────────────────────────────────────
export interface LeagueAuditLog {
  id: string;
  tenant_id: string;
  league_id: string | null;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

// ── League Role ──────────────────────────────────────────────
export interface LeagueRole {
  id: string;
  user_id: string;
  tenant_id: string;
  league_id: string | null;
  role: LeagueRoleType;
  created_at: string;
}

// ── Bay Booking ──────────────────────────────────────────────
export interface LeagueBayBooking {
  id: string;
  league_id: string;
  bay_id: string;
  tenant_id: string;
  scheduled_at: string;
  scheduled_end: string;
  duration_minutes: number;
  booked_by: string;
  booking_method: 'player_self' | 'admin_assigned';
  status: 'confirmed' | 'cancelled';
  players: string[];
  max_players: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Bay Block ────────────────────────────────────────────────
export interface LeagueBayBlock {
  id: string;
  bay_id: string;
  tenant_id: string;
  blocked_from: string;
  blocked_to: string;
  reason: string | null;
  blocked_by: string;
  created_at: string;
}

// ── Bay Availability Response ────────────────────────────────
export interface BayAvailabilityResponse {
  bays: { id: string; name: string; city: string; is_active: boolean; open_time: string; close_time: string }[];
  bookings: { bay_id: string; scheduled_at: string; scheduled_end: string; players: string[]; max_players: number }[];
  blocks: { bay_id: string; blocked_from: string; blocked_to: string }[];
}

// ── API request/response helpers ─────────────────────────────
export interface CreateLeagueRequest {
  name: string;
  format?: LeagueFormat;
  season_start?: string;
  season_end?: string;
  venue_id?: string;
  score_entry_method?: ScoreEntryMethod;
}

export interface UpdateLeagueRequest {
  name?: string;
  format?: LeagueFormat;
  season_start?: string;
  season_end?: string;
  venue_id?: string;
  status?: LeagueStatus;
  score_entry_method?: ScoreEntryMethod;
}

export interface SubmitScoreRequest {
  round_number?: number;
  hole_scores?: number[];
  total_score?: number;
  method?: 'photo_ocr' | 'manual' | 'api';
  photo_url?: string;
}

export interface UpdateBrandingRequest {
  logo_url?: string;
  sponsor_name?: string;
  sponsor_logo_url?: string;
  sponsor_url?: string;
  placement_slots?: string[];
  valid_from?: string;
  valid_to?: string;
}

export interface CreateBayBookingRequest {
  bay_id: string;
  scheduled_at: string;
  duration_minutes?: number;
  booking_method?: 'player_self' | 'admin_assigned';
  players?: string[];
  max_players?: number;
  notes?: string;
}

export interface RescheduleBayBookingRequest {
  scheduled_at: string;
  duration_minutes?: number;
  bay_id?: string;
  notes?: string;
}

// ── League Round ─────────────────────────────────────────────
export interface LeagueRound {
  id: string;
  league_id: string;
  tenant_id: string;
  round_number: number;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRoundRequest {
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  round_number?: number;
}

export interface UpdateRoundRequest {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  round_number?: number;
}

// ── League Competition ───────────────────────────────────────
export interface LeagueCompetition {
  id: string;
  round_id: string;
  league_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  points_config: { position: number; points: number }[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCompetitionRequest {
  name: string;
  description?: string;
  points_config?: { position: number; points: number }[];
  sort_order?: number;
}

export interface UpdateCompetitionRequest {
  name?: string;
  description?: string;
  points_config?: { position: number; points: number }[];
  sort_order?: number;
}
