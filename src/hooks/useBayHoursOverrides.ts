import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useBayHoursOverrides(bayId?: string) {
  return useQuery({
    queryKey: ["bay_hours_overrides", bayId],
    enabled: !!bayId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bay_hours_overrides" as any)
        .select("*")
        .eq("bay_id", bayId!)
        .order("day_of_week");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        bay_id: string;
        day_of_week: number;
        open_time: string | null;
        close_time: string | null;
      }>;
    },
  });
}

export function useUpsertBayHoursOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      bay_id: string;
      day_of_week: number;
      open_time: string | null;
      close_time: string | null;
    }) => {
      const { error } = await supabase
        .from("bay_hours_overrides" as any)
        .upsert(params as any, { onConflict: "bay_id,day_of_week" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bay_hours_overrides"] });
      qc.invalidateQueries({ queryKey: ["bays"] });
    },
  });
}

export function useDeleteBayHoursOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bay_hours_overrides" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bay_hours_overrides"] });
      qc.invalidateQueries({ queryKey: ["bays"] });
    },
  });
}
