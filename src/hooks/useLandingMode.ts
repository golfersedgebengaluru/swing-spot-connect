import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LandingMode = "community" | "booking";

export function useLandingMode() {
  return useQuery({
    queryKey: ["landing_page_mode"],
    queryFn: async (): Promise<LandingMode> => {
      const { data } = await supabase
        .from("admin_config")
        .select("value")
        .eq("key", "landing_page_mode")
        .maybeSingle();
      return (data?.value as LandingMode) || "community";
    },
    staleTime: 5 * 60 * 1000,
  });
}
