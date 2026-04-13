import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useBayPeakHours(bayId?: string) {
  return useQuery({
    queryKey: ["bay_peak_hours", bayId],
    enabled: !!bayId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bay_peak_hours")
        .select("*")
        .eq("bay_id", bayId!)
        .order("day_of_week", { ascending: true, nullsFirst: true })
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useAllBayPeakHours() {
  return useQuery({
    queryKey: ["bay_peak_hours_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bay_peak_hours")
        .select("*")
        .order("bay_id")
        .order("day_of_week", { ascending: true, nullsFirst: true })
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useAddBayPeakHour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { bay_id: string; day_of_week: number | null; peak_start: string; peak_end: string; sort_order?: number }) => {
      const { error } = await supabase.from("bay_peak_hours").insert({
        bay_id: params.bay_id,
        day_of_week: params.day_of_week,
        peak_start: params.peak_start,
        peak_end: params.peak_end,
        sort_order: params.sort_order ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bay_peak_hours"] });
      queryClient.invalidateQueries({ queryKey: ["bay_peak_hours_all"] });
    },
  });
}

export function useDeleteBayPeakHour() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bay_peak_hours").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bay_peak_hours"] });
      queryClient.invalidateQueries({ queryKey: ["bay_peak_hours_all"] });
    },
  });
}
