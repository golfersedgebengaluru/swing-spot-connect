import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useBayHolidays(city?: string) {
  return useQuery({
    queryKey: ["bay_holidays", city],
    enabled: !!city,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bay_holidays")
        .select("*")
        .eq("city", city!)
        .order("holiday_date");
      if (error) throw error;
      return data;
    },
  });
}

export function useAllBayHolidays() {
  return useQuery({
    queryKey: ["bay_holidays_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bay_holidays")
        .select("*")
        .order("holiday_date");
      if (error) throw error;
      return data;
    },
  });
}

export function useAddBayHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { bay_id?: string | null; city: string; holiday_date: string; label: string }) => {
      const { error } = await supabase.from("bay_holidays").insert({
        bay_id: params.bay_id || null,
        city: params.city,
        holiday_date: params.holiday_date,
        label: params.label,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bay_holidays"] });
      queryClient.invalidateQueries({ queryKey: ["bay_holidays_all"] });
    },
  });
}

export function useDeleteBayHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bay_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bay_holidays"] });
      queryClient.invalidateQueries({ queryKey: ["bay_holidays_all"] });
    },
  });
}
