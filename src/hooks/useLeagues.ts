import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  Tenant,
  League,
  LeagueJoinCode,
  LeagueScore,
  LeagueBranding,
  LeagueAuditLog,
  LeagueBayBooking,
  LeagueBayBlock,
  LeagueRound,
  LeagueCompetition,
  LeagueTeam,
  LeagueRoundHiddenHoles,
  CloseRoundResponse,
  BayAvailabilityResponse,
  CreateLeagueRequest,
  UpdateLeagueRequest,
  SubmitScoreRequest,
  UpdateBrandingRequest,
  CreateBayBookingRequest,
  RescheduleBayBookingRequest,
  CreateRoundRequest,
  UpdateRoundRequest,
  CreateCompetitionRequest,
  UpdateCompetitionRequest,
  LeaderboardResponse,
} from "@/types/league";
import { useToast } from "@/hooks/use-toast";

const FUNCTION_NAME = "league-service";
const LEAGUE_STALE_TIME = 30_000; // 30s – avoids re-fetching on tab switches

async function invoke(path: string, method: string, body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const url = `${supabaseUrl}/functions/v1/${FUNCTION_NAME}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

// ── Tenants ──────────────────────────────────────────────────
export function useTenants() {
  return useQuery<Tenant[]>({
    queryKey: ["league-tenants"],
    queryFn: () => invoke("/tenants", "GET"),
    staleTime: LEAGUE_STALE_TIME,
  });
}

// ── Tenant Bays (bays from the tenant's linked city) ────────
export function useTenantBays(tenantId: string | null) {
  return useQuery<{ id: string; name: string; city: string; is_active: boolean }[]>({
    queryKey: ["league-tenant-bays", tenantId],
    queryFn: () => invoke(`/bays?tenant_id=${tenantId}`, "GET"),
    enabled: !!tenantId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: { name: string; city: string; sponsorship_enabled?: boolean }) =>
      invoke("/tenants", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-tenants"] });
      toast({ title: "Tenant created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Leagues ──────────────────────────────────────────────────
export function useLeagues(tenantId: string | null) {
  return useQuery<League[]>({
    queryKey: ["leagues", tenantId],
    queryFn: () => invoke(`/leagues?tenant_id=${tenantId}`, "GET"),
    enabled: !!tenantId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useLeague(leagueId: string | null) {
  return useQuery<League>({
    queryKey: ["league", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateLeague(tenantId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: CreateLeagueRequest) =>
      invoke(`/leagues?tenant_id=${tenantId}`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leagues", tenantId] });
      toast({ title: "League created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateLeague(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: UpdateLeagueRequest) =>
      invoke(`/leagues/${leagueId}`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leagues"] });
      qc.invalidateQueries({ queryKey: ["league", leagueId] });
      toast({ title: "League updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Join Codes ───────────────────────────────────────────────
export function useJoinCodes(leagueId: string | null) {
  return useQuery<LeagueJoinCode[]>({
    queryKey: ["league-join-codes", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/join-codes`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateJoinCode(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body?: { expires_at?: string; max_uses?: number; team_id?: string }) =>
      invoke(`/leagues/${leagueId}/join-codes`, "POST", body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-join-codes", leagueId] });
      toast({ title: "Join code created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useRevokeJoinCode(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (codeId: string) =>
      invoke(`/leagues/${leagueId}/join-codes?code_id=${codeId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-join-codes", leagueId] });
      toast({ title: "Join code revoked" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useJoinLeague() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (code: string) => invoke("/join", "POST", { code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leagues"] });
      toast({ title: "Joined league successfully!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Players ─────────────────────────────────────────────────
export interface LeaguePlayerWithProfile {
  id: string;
  league_id: string;
  user_id: string;
  joined_via_code_id: string | null;
  joined_at: string;
  display_name: string | null;
  email: string | null;
  league_city_id?: string | null;
  league_location_id?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  team_city_id?: string | null;
  team_location_id?: string | null;
}

export function useLeaguePlayers(leagueId: string | null) {
  return useQuery<LeaguePlayerWithProfile[]>({
    queryKey: ["league-players", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/players`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useAddLeaguePlayer(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (userId: string) =>
      invoke(`/leagues/${leagueId}/players`, "POST", { user_id: userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-players", leagueId] });
      toast({ title: "Player added to league" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useRemoveLeaguePlayer(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (playerId: string) =>
      invoke(`/leagues/${leagueId}/players?player_id=${playerId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-players", leagueId] });
      toast({ title: "Player removed from league" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Teams ───────────────────────────────────────────────────
export function useLeagueTeams(leagueId: string | null) {
  return useQuery<LeagueTeam[]>({
    queryKey: ["league-teams", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/teams`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateTeam(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: { name: string; max_roster_size?: number }) =>
      invoke(`/leagues/${leagueId}/teams`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-teams", leagueId] });
      toast({ title: "Team created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateTeam(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ teamId, body }: { teamId: string; body: { name?: string; max_roster_size?: number } }) =>
      invoke(`/leagues/${leagueId}/teams/${teamId}`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-teams", leagueId] });
      toast({ title: "Team updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteTeam(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (teamId: string) =>
      invoke(`/leagues/${leagueId}/teams/${teamId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-teams", leagueId] });
      toast({ title: "Team deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useAddTeamMember(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ teamId, playerId }: { teamId: string; playerId: string }) =>
      invoke(`/leagues/${leagueId}/teams/${teamId}/members`, "POST", { player_id: playerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-teams", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-players", leagueId] });
      toast({ title: "Player assigned to team" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useRemoveTeamMember(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ teamId, memberId }: { teamId: string; memberId: string }) =>
      invoke(`/leagues/${leagueId}/teams/${teamId}/members/${memberId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-teams", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-players", leagueId] });
      toast({ title: "Player removed from team" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ tenantId, ...body }: { tenantId: string; sponsorship_enabled?: boolean; default_logo_url?: string; name?: string }) =>
      invoke(`/tenants/${tenantId}`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-tenants"] });
      toast({ title: "Tenant updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}


export function useLeagueScores(leagueId: string | null, round?: number) {
  return useQuery<LeagueScore[]>({
    queryKey: ["league-scores", leagueId, round],
    queryFn: () => {
      let path = `/leagues/${leagueId}/scores`;
      if (round) path += `?round=${round}`;
      return invoke(path, "GET");
    },
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useSubmitScore(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: SubmitScoreRequest) =>
      invoke(`/leagues/${leagueId}/scores`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-scores", leagueId] });
      toast({ title: "Score submitted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useConfirmScore(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: { score_id: string; hole_scores?: number[] }) =>
      invoke(`/leagues/${leagueId}/scores`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-scores", leagueId] });
      toast({ title: "Score confirmed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Branding ─────────────────────────────────────────────────
export function useLeagueBranding(leagueId: string | null) {
  return useQuery<LeagueBranding | null>({
    queryKey: ["league-branding", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/branding`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useUpdateBranding(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: UpdateBrandingRequest) =>
      invoke(`/leagues/${leagueId}/branding`, "PUT", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-branding", leagueId] });
      qc.invalidateQueries({ queryKey: ["league", leagueId] });
      toast({ title: "Branding updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Audit Log ────────────────────────────────────────────────
export function useLeagueAuditLog(tenantId: string | null, leagueId?: string) {
  return useQuery<LeagueAuditLog[]>({
    queryKey: ["league-audit-log", tenantId, leagueId],
    queryFn: async () => {
      let query = supabase
        .from("league_audit_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      if (leagueId) query = query.eq("league_id", leagueId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as LeagueAuditLog[];
    },
    enabled: !!tenantId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

// ── Bay Availability ─────────────────────────────────────────
export function useBayAvailability(leagueId: string | null, date: string | null) {
  return useQuery<BayAvailabilityResponse>({
    queryKey: ["league-bay-availability", leagueId, date],
    queryFn: () => invoke(`/leagues/${leagueId}/bay-availability?date=${date}`, "GET"),
    enabled: !!leagueId && !!date,
    staleTime: LEAGUE_STALE_TIME,
  });
}

// ── Bay Bookings ─────────────────────────────────────────────
export function useBayBookings(leagueId: string | null, date?: string) {
  return useQuery<LeagueBayBooking[]>({
    queryKey: ["league-bay-bookings", leagueId, date],
    queryFn: () => {
      let path = `/leagues/${leagueId}/bay-bookings`;
      if (date) path += `?date=${date}`;
      return invoke(path, "GET");
    },
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateBayBooking(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: CreateBayBookingRequest) =>
      invoke(`/leagues/${leagueId}/bay-bookings`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-bay-bookings", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-bay-availability", leagueId] });
      toast({ title: "Bay booked successfully" });
    },
    onError: (e: Error) => toast({ title: "Booking failed", description: e.message, variant: "destructive" }),
  });
}

export function useJoinBayBooking(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (bookingId: string) =>
      invoke(`/leagues/${leagueId}/bay-bookings/${bookingId}?action=join`, "POST", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-bay-bookings", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-bay-availability", leagueId] });
      toast({ title: "Joined bay booking" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useCancelBayBooking(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (bookingId: string) =>
      invoke(`/leagues/${leagueId}/bay-bookings/${bookingId}?action=cancel`, "POST", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-bay-bookings", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-bay-availability", leagueId] });
      toast({ title: "Booking cancelled" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useRescheduleBayBooking(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ bookingId, body }: { bookingId: string; body: RescheduleBayBookingRequest }) =>
      invoke(`/leagues/${leagueId}/bay-bookings/${bookingId}`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-bay-bookings", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-bay-availability", leagueId] });
      toast({ title: "Booking rescheduled" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Bay Blocks ───────────────────────────────────────────────
export function useBayBlocks(leagueId: string | null) {
  return useQuery<LeagueBayBlock[]>({
    queryKey: ["league-bay-blocks", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/bay-blocks`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateBayBlock(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: { bay_id: string; blocked_from: string; blocked_to: string; reason?: string }) =>
      invoke(`/leagues/${leagueId}/bay-blocks`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-bay-blocks", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-bay-availability", leagueId] });
      toast({ title: "Bay blocked" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useRemoveBayBlock(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (blockId: string) =>
      invoke(`/leagues/${leagueId}/bay-blocks?block_id=${blockId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-bay-blocks", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-bay-availability", leagueId] });
      toast({ title: "Block removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Rounds ──────────────────────────────────────────────────
export function useLeagueRounds(leagueId: string | null) {
  return useQuery<LeagueRound[]>({
    queryKey: ["league-rounds", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/rounds`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateRound(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: CreateRoundRequest) =>
      invoke(`/leagues/${leagueId}/rounds`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-rounds", leagueId] });
      toast({ title: "Round created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateRound(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ roundId, body }: { roundId: string; body: UpdateRoundRequest }) =>
      invoke(`/leagues/${leagueId}/rounds/${roundId}`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-rounds", leagueId] });
      toast({ title: "Round updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteRound(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (roundId: string) =>
      invoke(`/leagues/${leagueId}/rounds/${roundId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-rounds", leagueId] });
      toast({ title: "Round deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Competitions ────────────────────────────────────────────
export function useRoundCompetitions(leagueId: string | null, roundId: string | null) {
  return useQuery<LeagueCompetition[]>({
    queryKey: ["league-competitions", leagueId, roundId],
    queryFn: () => invoke(`/leagues/${leagueId}/rounds/${roundId}/competitions`, "GET"),
    enabled: !!leagueId && !!roundId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateCompetition(leagueId: string, roundId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: CreateCompetitionRequest) =>
      invoke(`/leagues/${leagueId}/rounds/${roundId}/competitions`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-competitions", leagueId, roundId] });
      toast({ title: "Competition created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateCompetition(leagueId: string, roundId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ competitionId, body }: { competitionId: string; body: UpdateCompetitionRequest }) =>
      invoke(`/leagues/${leagueId}/rounds/${roundId}/competitions?competition_id=${competitionId}`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-competitions", leagueId, roundId] });
      toast({ title: "Competition updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteCompetition(leagueId: string, roundId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (competitionId: string) =>
      invoke(`/leagues/${leagueId}/rounds/${roundId}/competitions?competition_id=${competitionId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-competitions", leagueId, roundId] });
      toast({ title: "Competition deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Hidden Holes (Peoria) ───────────────────────────────────
export function useHiddenHoles(leagueId: string | null) {
  return useQuery<LeagueRoundHiddenHoles[]>({
    queryKey: ["league-hidden-holes", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/hidden-holes`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

/**
 * Admin-only preview of hidden holes (returns values regardless of revealed_at).
 * Players never see this endpoint — it 403s for non-admins.
 */
export function useHiddenHolesAdmin(leagueId: string | null) {
  return useQuery<LeagueRoundHiddenHoles[]>({
    queryKey: ["league-hidden-holes-admin", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/hidden-holes/admin`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useSetHiddenHoles(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: { round_number: number; hidden_holes?: number[]; randomize?: boolean }) =>
      invoke(`/leagues/${leagueId}/hidden-holes`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-hidden-holes", leagueId] });
      toast({ title: "Hidden holes saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useCloseRound(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation<CloseRoundResponse, Error, number>({
    mutationFn: (roundNumber: number) =>
      invoke(`/leagues/${leagueId}/hidden-holes`, "PATCH", { round_number: roundNumber, action: "close_round" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["league-hidden-holes", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-scores", leagueId] });
      toast({ title: "Round closed", description: `${data.peoria_results.length} scores processed` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Leaderboard ─────────────────────────────────────────────
export function useLeaderboard(
  leagueId: string | null,
  round?: number,
  filter?: 'all' | 'individuals' | 'teams',
  scope: 'national' | 'city' = 'national',
  leagueCityId?: string | null,
) {
  return useQuery<LeaderboardResponse>({
    queryKey: ["league-leaderboard", leagueId, round, filter, scope, leagueCityId],
    queryFn: () => {
      let path = `/leagues/${leagueId}/leaderboard`;
      const params: string[] = [];
      if (round) params.push(`round=${round}`);
      if (filter && filter !== 'all') params.push(`filter=${filter}`);
      if (scope === 'city' && leagueCityId) {
        params.push(`scope=city`);
        params.push(`league_city_id=${leagueCityId}`);
      }
      if (params.length) path += `?${params.join('&')}`;
      return invoke(path, "GET");
    },
    enabled: !!leagueId && (scope !== 'city' || !!leagueCityId),
    staleTime: LEAGUE_STALE_TIME,
  });
}

// ── League Cities ───────────────────────────────────────────
import type { LeagueCity, LeagueLocation, LeagueBayMapping } from "@/types/league";

export function useLeagueCities(leagueId: string | null) {
  return useQuery<LeagueCity[]>({
    queryKey: ["league-cities", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/cities`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateLeagueCity(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: { name: string; display_order?: number }) =>
      invoke(`/leagues/${leagueId}/cities`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-cities", leagueId] });
      toast({ title: "City added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateLeagueCity(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ cityId, body }: { cityId: string; body: { name?: string; display_order?: number } }) =>
      invoke(`/leagues/${leagueId}/cities/${cityId}`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-cities", leagueId] });
      toast({ title: "City updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteLeagueCity(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (cityId: string) => invoke(`/leagues/${leagueId}/cities/${cityId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-cities", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-locations", leagueId] });
      toast({ title: "City deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── League Locations ────────────────────────────────────────
export function useLeagueLocations(leagueId: string | null, cityId: string | null) {
  return useQuery<LeagueLocation[]>({
    queryKey: ["league-locations", leagueId, cityId],
    queryFn: () => invoke(`/leagues/${leagueId}/cities/${cityId}/locations`, "GET"),
    enabled: !!leagueId && !!cityId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateLeagueLocation(leagueId: string, cityId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: { name: string; display_order?: number }) =>
      invoke(`/leagues/${leagueId}/cities/${cityId}/locations`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-locations", leagueId, cityId] });
      toast({ title: "Location added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteLeagueLocation(leagueId: string, cityId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (locationId: string) =>
      invoke(`/leagues/${leagueId}/cities/${cityId}/locations/${locationId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-locations", leagueId, cityId] });
      qc.invalidateQueries({ queryKey: ["league-location-bays", leagueId] });
      toast({ title: "Location deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── League Location Bays ────────────────────────────────────
export function useLocationBays(leagueId: string | null, cityId: string | null, locationId: string | null) {
  return useQuery<LeagueBayMapping[]>({
    queryKey: ["league-location-bays", leagueId, locationId],
    queryFn: () => invoke(`/leagues/${leagueId}/cities/${cityId}/locations/${locationId}/bays`, "GET"),
    enabled: !!leagueId && !!cityId && !!locationId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useImportLocationBays(leagueId: string, cityId: string, locationId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (bayIds: string[]) =>
      invoke(`/leagues/${leagueId}/cities/${cityId}/locations/${locationId}/bays`, "POST", { bay_ids: bayIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-location-bays", leagueId, locationId] });
      toast({ title: "Bays imported" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUnmapLocationBay(leagueId: string, cityId: string, locationId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (mappingId: string) =>
      invoke(`/leagues/${leagueId}/cities/${cityId}/locations/${locationId}/bays/${mappingId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-location-bays", leagueId, locationId] });
      toast({ title: "Bay unmapped" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Player / Team city assignment ───────────────────────────
export function useAssignPlayerLocation(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ playerId, body }: { playerId: string; body: { league_city_id?: string | null; league_location_id?: string | null } }) =>
      invoke(`/leagues/${leagueId}/players/${playerId}/assign`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-players", leagueId] });
      toast({ title: "Player assigned" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useAssignTeamLocation(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ teamId, body }: { teamId: string; body: { league_city_id?: string | null; league_location_id?: string | null } }) =>
      invoke(`/leagues/${leagueId}/teams/${teamId}/assign`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-teams", leagueId] });
      toast({ title: "Team assigned" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

// ── Activity Feed ───────────────────────────────────────────
export function useLeagueFeed(leagueId: string | null) {
  return useQuery<import("@/types/league").LeagueFeedItem[]>({
    queryKey: ["league-feed", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/feed?limit=50`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useReactToFeedItem(leagueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feedItemId, emoji }: { feedItemId: string; emoji: string }) =>
      invoke(`/leagues/${leagueId}/feed/${feedItemId}/reactions`, "POST", { emoji }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["league-feed", leagueId] }),
  });
}

export function useUnreactFeedItem(leagueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feedItemId, emoji }: { feedItemId: string; emoji: string }) =>
      invoke(`/leagues/${leagueId}/feed/${feedItemId}/reactions?emoji=${encodeURIComponent(emoji)}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["league-feed", leagueId] }),
  });
}

// ── Phase 4: Season Wrap-Up ─────────────────────────────────
import type { LeagueAward, SeasonWrapUpResponse, RecapCardResponse } from "@/types/league";

export function useSeasonWrapUp(leagueId: string | null) {
  return useQuery<SeasonWrapUpResponse>({
    queryKey: ["league-wrap-up", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/wrap-up`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCompleteSeason(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => invoke(`/leagues/${leagueId}/complete`, "POST"),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["leagues"] });
      qc.invalidateQueries({ queryKey: ["league-wrap-up", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-awards", leagueId] });
      toast({ title: "Season completed", description: `${data.auto_awards} auto awards calculated` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useReopenSeason(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => invoke(`/leagues/${leagueId}/reopen`, "POST"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leagues"] });
      qc.invalidateQueries({ queryKey: ["league-wrap-up", leagueId] });
      toast({ title: "Season re-opened", description: "Scoring is unlocked" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useLeagueAwards(leagueId: string | null) {
  return useQuery<LeagueAward[]>({
    queryKey: ["league-awards", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/awards`, "GET"),
    enabled: !!leagueId,
    staleTime: LEAGUE_STALE_TIME,
  });
}

export function useCreateAward(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: { name: string; winner_player_id?: string; winner_team_id?: string; detail?: string }) =>
      invoke(`/leagues/${leagueId}/awards`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-awards", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-wrap-up", leagueId] });
      toast({ title: "Award added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteAward(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (awardId: string) => invoke(`/leagues/${leagueId}/awards/${awardId}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league-awards", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-wrap-up", leagueId] });
      toast({ title: "Award removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useRecapCard(leagueId: string | null, playerId?: string) {
  return useQuery<RecapCardResponse>({
    queryKey: ["league-recap-card", leagueId, playerId],
    queryFn: () => {
      const q = playerId ? `?player_id=${playerId}` : "";
      return invoke(`/leagues/${leagueId}/recap-card${q}`, "GET");
    },
    enabled: !!leagueId,
    staleTime: 5 * 60_000,
  });
}
