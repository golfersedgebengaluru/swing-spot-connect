import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OfflinePaymentMethod {
  id: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  city?: string | null;
}

// ─── Global methods (city IS NULL) ──────────────────────
export function useOfflinePaymentMethods() {
  return useQuery({
    queryKey: ["offline_payment_methods", "global_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offline_payment_methods" as any)
        .select("*")
        .is("city", null)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as OfflinePaymentMethod[];
    },
  });
}

export function useAllOfflinePaymentMethods() {
  return useQuery({
    queryKey: ["offline_payment_methods", "all_global"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offline_payment_methods" as any)
        .select("*")
        .is("city", null)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as OfflinePaymentMethod[];
    },
  });
}

// ─── City-specific methods ──────────────────────────────
export function useCityOfflinePaymentMethods(city?: string) {
  return useQuery({
    queryKey: ["offline_payment_methods", "city", city],
    enabled: !!city,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offline_payment_methods" as any)
        .select("*")
        .eq("city", city!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as OfflinePaymentMethod[];
    },
  });
}

// ─── Effective methods (city override or global fallback) ─
export function useEffectiveOfflinePaymentMethods(city?: string) {
  const { data: globalMethods, isLoading: loadingGlobal } = useAllOfflinePaymentMethods();
  const { data: cityMethods, isLoading: loadingCity } = useCityOfflinePaymentMethods(city);

  const isOverridden = (cityMethods?.length ?? 0) > 0;
  const effective = isOverridden
    ? cityMethods!.filter((m) => m.is_active)
    : (globalMethods ?? []).filter((m) => m.is_active);

  return {
    data: effective,
    isOverridden,
    isLoading: loadingGlobal || loadingCity,
  };
}

// ─── Mutations ──────────────────────────────────────────
export function useCreateOfflinePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { label: string; sort_order?: number; city?: string | null }) => {
      const { error } = await supabase
        .from("offline_payment_methods" as any)
        .insert({
          label: params.label,
          sort_order: params.sort_order ?? 0,
          city: params.city ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offline_payment_methods"] }),
  });
}

export function useUpdateOfflinePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; label?: string; is_active?: boolean; sort_order?: number }) => {
      const { error } = await supabase
        .from("offline_payment_methods" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offline_payment_methods"] }),
  });
}

export function useDeleteOfflinePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("offline_payment_methods" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offline_payment_methods"] }),
  });
}

// Delete all city-specific methods (used when toggling off override)
export function useDeleteCityOfflinePaymentMethods() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (city: string) => {
      const { error } = await supabase
        .from("offline_payment_methods" as any)
        .delete()
        .eq("city", city);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["offline_payment_methods"] }),
  });
}
