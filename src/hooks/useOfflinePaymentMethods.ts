import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useOfflinePaymentMethods() {
  return useQuery({
    queryKey: ["offline_payment_methods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offline_payment_methods" as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as { id: string; label: string; is_active: boolean; sort_order: number }[];
    },
  });
}

export function useAllOfflinePaymentMethods() {
  return useQuery({
    queryKey: ["offline_payment_methods", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offline_payment_methods" as any)
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as { id: string; label: string; is_active: boolean; sort_order: number; created_at: string }[];
    },
  });
}

export function useCreateOfflinePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { label: string; sort_order?: number }) => {
      const { error } = await supabase
        .from("offline_payment_methods" as any)
        .insert({ label: params.label, sort_order: params.sort_order ?? 0 });
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
