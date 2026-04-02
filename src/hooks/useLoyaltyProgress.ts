import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useUserLoyaltyProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["loyalty_user_progress", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("loyalty_user_progress")
        .select("*")
        .eq("user_id", user!.id)
        .eq("period_type", "monthly")
        .gte("period_start", periodStart)
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? { hours_logged: 0, visit_count: 0, milestones_achieved: [] };
    },
    staleTime: 30_000,
  });
}
