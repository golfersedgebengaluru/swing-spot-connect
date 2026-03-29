import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useBayPricing() {
  return useQuery({
    queryKey: ["bay_pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bay_pricing")
        .select("*")
        .order("city")
        .order("day_type")
        .order("session_type");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useUpsertBayPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      id?: string;
      city: string;
      day_type: string;
      session_type: string;
      label: string;
      price_per_hour: number;
      currency: string;
      service_product_id?: string | null;
    }) => {
      const { error } = await supabase
        .from("bay_pricing")
        .upsert(row, { onConflict: "city,day_type,session_type" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bay_pricing"] }),
  });
}

export function useHourPackages() {
  return useQuery({
    queryKey: ["hour_packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hour_packages")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useUpdateHourPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      id: string;
      label?: string;
      price?: number;
      currency?: string;
      is_active?: boolean;
    }) => {
      const { id, ...updates } = row;
      const { error } = await supabase
        .from("hour_packages")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hour_packages"] }),
  });
}
