import { useQuery } from "@tanstack/react-query";
import { leagueServiceInvoke } from "@/hooks/useLeagues";
import { useAuth } from "@/contexts/AuthContext";

export interface MyLegacyTeam {
  team: null | {
    id: string;
    team_name: string;
    team_size: number;
    currency: string;
    join_token: string;
    captain_user_id: string;
    city?: { name: string } | null;
    location?: { name: string } | null;
  };
  my_role?: "captain" | "member";
  members?: { user_id: string; role: string }[];
  invites?: { email: string; status: string }[];
}

export function useMyLegacyTeam(leagueId: string | null) {
  const { user } = useAuth();
  return useQuery<MyLegacyTeam>({
    queryKey: ["legacy-my-team", leagueId, user?.id],
    enabled: !!leagueId && !!user,
    queryFn: () => leagueServiceInvoke(`/leagues/${leagueId}/my-team`, "GET"),
    staleTime: 15_000,
  });
}
