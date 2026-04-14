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
} from "@/types/league";
import { useToast } from "@/hooks/use-toast";

const FUNCTION_NAME = "league-service";

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
  });
}

// ── Tenant Bays (bays from the tenant's linked city) ────────
export function useTenantBays(tenantId: string | null) {
  return useQuery<{ id: string; name: string; city: string; is_active: boolean }[]>({
    queryKey: ["league-tenant-bays", tenantId],
    queryFn: () => invoke(`/bays?tenant_id=${tenantId}`, "GET"),
    enabled: !!tenantId,
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
  });
}

export function useLeague(leagueId: string | null) {
  return useQuery<League>({
    queryKey: ["league", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}`, "GET"),
    enabled: !!leagueId,
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
  });
}

export function useCreateJoinCode(leagueId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body?: { expires_at?: string; max_uses?: number }) =>
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
}

export function useLeaguePlayers(leagueId: string | null) {
  return useQuery<LeaguePlayerWithProfile[]>({
    queryKey: ["league-players", leagueId],
    queryFn: () => invoke(`/leagues/${leagueId}/players`, "GET"),
    enabled: !!leagueId,
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

// ── Scores ───────────────────────────────────────────────────
export function useLeagueScores(leagueId: string | null, round?: number) {
  return useQuery<LeagueScore[]>({
    queryKey: ["league-scores", leagueId, round],
    queryFn: () => {
      let path = `/leagues/${leagueId}/scores`;
      if (round) path += `?round=${round}`;
      return invoke(path, "GET");
    },
    enabled: !!leagueId,
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
  });
}

// ── Bay Availability ─────────────────────────────────────────
export function useBayAvailability(leagueId: string | null, date: string | null) {
  return useQuery<BayAvailabilityResponse>({
    queryKey: ["league-bay-availability", leagueId, date],
    queryFn: () => invoke(`/leagues/${leagueId}/bay-availability?date=${date}`, "GET"),
    enabled: !!leagueId && !!date,
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
