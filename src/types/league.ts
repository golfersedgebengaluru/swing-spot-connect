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
  scoring_holes: number;
  fairness_factor_pct: number;
  team_aggregation_method: 'best_ball' | 'average';
  peoria_multiplier: number;
  allowed_team_sizes: number[];
  show_on_landing: boolean;
  price_per_person: number;
  currency: string;
  payment_city: string | null;
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
  team_id: string | null;
}

// ── Team ─────────────────────────────────────────────────────
export interface LeagueTeam {
  id: string;
  league_id: string;
  tenant_id: string;
  name: string;
  max_roster_size: number;
  league_city_id: string | null;
  league_location_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  members?: LeagueTeamMember[];
}

export interface LeagueTeamMember {
  id: string;
  player_id: string;
  user_id: string;
  display_name: string | null;
  assigned_at: string;
}

// ── Player ───────────────────────────────────────────────────
export interface LeaguePlayer {
  id: string;
  league_id: string;
  user_id: string;
  joined_via_code_id: string | null;
  joined_at: string;
  team_id: string | null;
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
  allowed_team_sizes?: number[];
  show_on_landing?: boolean;
  price_per_person?: number;
  currency?: string;
  payment_city?: string | null;
}

export interface UpdateLeagueRequest {
  name?: string;
  format?: LeagueFormat;
  season_start?: string;
  season_end?: string;
  venue_id?: string;
  status?: LeagueStatus;
  score_entry_method?: ScoreEntryMethod;
  scoring_holes?: number;
  fairness_factor_pct?: number;
  team_aggregation_method?: 'best_ball' | 'average';
  peoria_multiplier?: number;
  allowed_team_sizes?: number[];
  show_on_landing?: boolean;
  price_per_person?: number;
  currency?: string;
  payment_city?: string | null;
}

// ── Hidden Holes ─────────────────────────────────────────────
export interface LeagueRoundHiddenHoles {
  id: string;
  league_id: string;
  round_number: number;
  hidden_holes: number[] | null;
  revealed_at: string | null;
  selected_by: string;
  tenant_id: string;
  created_at: string;
}

export interface PeoriaResult {
  score_id: string;
  player_id: string;
  gross_score: number;
  hidden_hole_sum: number;
  peoria_handicap: number;
  net_score: number;
}

export interface CloseRoundResponse {
  revealed: LeagueRoundHiddenHoles;
  peoria_results: PeoriaResult[];
}

export interface SubmitScoreRequest {
  round_number?: number;
  hole_scores?: number[];
  total_score?: number;
  method?: 'photo_ocr' | 'manual' | 'api';
  photo_url?: string;
  player_id?: string; // admin-only: submit on behalf of another player
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

// ── Leaderboard ──────────────────────────────────────────────
export interface LeaderboardEntry {
  rank: number;
  type: 'individual' | 'team';
  id: string;
  name: string;
  team_name?: string;
  total_gross: number;
  total_net: number;
  final_score: number;
  /** Sum of round par across all rounds the entrant has played. */
  total_par?: number;
  /** total_net − total_par. Negative is under par. */
  net_vs_par?: number;
  /** final_score − total_par (after fairness factor for teams). */
  final_vs_par?: number;
  rounds_played: number;
  breakdown: { round: number; gross: number; net: number; handicap: number; par?: number; net_vs_par?: number }[];
  members?: { player_id: string; name: string; net_score: number; gross_score?: number; total_par?: number; vs_par?: number }[];
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  round: number | null;
  filter: 'all' | 'individuals' | 'teams';
  /** When true the leaderboard is operating in handicap mode — UI should hide gross. */
  handicap_active?: boolean;
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
  /** Par per hole. Empty array if not yet configured. Length matches league.scoring_holes when set. */
  par_per_hole: number[];
  created_at: string;
  updated_at: string;
}

export interface CreateRoundRequest {
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  round_number?: number;
  par_per_hole?: number[];
}

export interface UpdateRoundRequest {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  round_number?: number;
  par_per_hole?: number[];
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

// ── Activity Feed ────────────────────────────────────────────
export interface LeagueFeedItem {
  id: string;
  league_id: string;
  tenant_id: string;
  actor_id: string;
  actor_name: string;
  event_type: string;
  payload: Record<string, unknown>;
  reactions: FeedReaction[];
  created_at: string;
}

export interface FeedReaction {
  emoji: string;
  count: number;
  user_reacted: boolean;
}

// ── League Cities & Locations ────────────────────────────────
export interface LeagueCity {
  id: string;
  league_id: string;
  tenant_id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface LeagueLocation {
  id: string;
  league_city_id: string;
  league_id: string;
  tenant_id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface LeagueBayMapping {
  id: string;
  league_location_id: string;
  league_id: string;
  tenant_id: string;
  bay_id: string;
  created_at: string;
  bay_name?: string;
  bay_city?: string;
}

export type LeaderboardScope = 'national' | 'city';
export type LeaderboardVisibility = 'public' | 'admin_only';

// ── Phase 4: Season Wrap-Up ──────────────────────────────────
export type AwardType = 'most_birdies' | 'best_round' | 'most_improved' | 'lowest_avg' | 'manual';

export interface LeagueAward {
  id: string;
  league_id: string;
  tenant_id: string;
  award_type: AwardType;
  name: string;
  winner_player_id: string | null;
  winner_team_id: string | null;
  value: number | null;
  detail: string | null;
  is_manual: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SeasonStandingEntry {
  rank: number;
  player_id: string;
  name: string;
  total_gross: number;
  total_net: number;
  total_par: number;
  rounds_played: number;
  score: number;
  vs_par: number;
}

export interface LeagueSeasonSnapshot {
  id: string;
  league_id: string;
  tenant_id: string;
  net_standings: SeasonStandingEntry[];
  gross_standings: SeasonStandingEntry[];
  stats: Record<string, { birdies: number; best_round: number | null; net_avg_vs_par: number; rounds: number }>;
  completed_at: string;
  completed_by: string;
}

export interface SeasonWrapUpResponse {
  league: { id: string; name: string; status: LeagueStatus; resolved_logo_url: string | null };
  snapshot: LeagueSeasonSnapshot | null;
  awards: LeagueAward[];
  branding: LeagueBranding | null;
  sponsorship_enabled: boolean;
}

export interface RecapCardResponse {
  url: string | null;
  path: string;
  player: {
    id: string;
    name: string;
    rank: number;
    vs_par: number;
    best_round: number | string;
    birdies: number;
    awards: LeagueAward[];
  };
  sponsor: string | null;
}


