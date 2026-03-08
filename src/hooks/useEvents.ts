import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
