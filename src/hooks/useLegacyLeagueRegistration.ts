import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { leagueServiceInvoke } from "@/hooks/useLeagues";

export interface LegacyLeagueCity { id: string; name: string }
export interface LegacyLeagueLocation { id: string; league_city_id: string; name: string }

/** Pure helper: checks that a team_size is allowed by the league config. */
export function isAllowedTeamSize(size: unknown, allowed: number[] | null | undefined): boolean {
  const n = typeof size === "number" ? size : Number(size);
  if (!Number.isInteger(n) || n < 1) return false;
  if (!allowed || allowed.length === 0) return false;
  return allowed.includes(n);
}

/** Pure helper: validates the registration form before calling the edge function. */
export function validateRegistrationForm(input: {
  league_city_id?: string | null;
  league_location_id?: string | null;
  team_name?: string | null;
  team_size?: number | null;
  allowed_team_sizes?: number[] | null;
}): { ok: true } | { ok: false; error: string } {
  if (!input.league_city_id) return { ok: false, error: "Please select a city" };
  if (!input.league_location_id) return { ok: false, error: "Please select a location" };
  const name = (input.team_name || "").trim();
  if (name.length < 2) return { ok: false, error: "Team name must be at least 2 characters" };
  if (name.length > 80) return { ok: false, error: "Team name is too long" };
  if (!isAllowedTeamSize(input.team_size, input.allowed_team_sizes ?? null)) {
    return { ok: false, error: "Please pick a valid team size" };
  }
  return { ok: true };
}

export function useLegacyLeagueCities(leagueId: string | null) {
  return useQuery<LegacyLeagueCity[]>({
    queryKey: ["legacy-league-cities", leagueId],
    enabled: !!leagueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_cities")
        .select("id, name")
        .eq("league_id", leagueId!)
        .order("display_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as LegacyLeagueCity[];
    },
  });
}

export function useLegacyLeagueLocations(leagueId: string | null, cityId: string | null) {
  return useQuery<LegacyLeagueLocation[]>({
    queryKey: ["legacy-league-locations", leagueId, cityId],
    enabled: !!leagueId && !!cityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_locations")
        .select("id, league_city_id, name")
        .eq("league_id", leagueId!)
        .eq("league_city_id", cityId!)
        .order("display_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as LegacyLeagueLocation[];
    },
  });
}

export interface RegisterTeamIntentBody {
  league_city_id: string;
  league_location_id: string;
  team_name: string;
  team_size: number;
  invite_emails?: string[];
  coupon_code?: string;
}
export interface IntentResponse {
  success: true;
  free?: boolean;
  registration?: { id: string };
  order_id?: string;
  amount?: number;
  currency?: string;
  key_id?: string;
  league_name?: string;
  join_token?: string;
  original_amount?: number;
  discount_amount?: number;
  coupon_code?: string;
}

export function useRegisterTeamIntent(leagueId: string) {
  return useMutation<IntentResponse, Error, RegisterTeamIntentBody>({
    mutationFn: (body) => leagueServiceInvoke(`/leagues/${leagueId}/register-team-intent`, "POST", body),
  });
}

export interface VerifyPaymentBody {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export function useVerifyTeamPayment(leagueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VerifyPaymentBody) =>
      leagueServiceInvoke(`/leagues/${leagueId}/verify-team-payment`, "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["legacy-registered-teams", leagueId] });
    },
  });
}

export function useRegisteredLegacyTeams(leagueId: string | null) {
  return useQuery({
    queryKey: ["legacy-registered-teams", leagueId],
    enabled: !!leagueId,
    queryFn: () => leagueServiceInvoke(`/leagues/${leagueId}/registered-teams`, "GET"),
  });
}
