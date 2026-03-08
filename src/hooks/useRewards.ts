import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRewards() {
  return useQuery({
    queryKey: ["rewards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rewards")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useEarnMethods() {
  return useQuery({
    queryKey: ["earn_methods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("earn_methods")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}
