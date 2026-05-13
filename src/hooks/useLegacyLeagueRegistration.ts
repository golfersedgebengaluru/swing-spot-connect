import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { leagueServiceInvoke } from "@/hooks/useLeagues";

export interface LegacyLeagueCity { id: string; name: string }
export interface LegacyLeagueLocation { id: string; league_city_id: string; name: string }

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
