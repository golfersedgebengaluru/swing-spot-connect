import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useLoyaltyEarningRules() {
  return useQuery({
    queryKey: ["loyalty_earning_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_earning_rules")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useLoyaltyMultipliers() {
  return useQuery({
    queryKey: ["loyalty_multipliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_multipliers")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useLoyaltyMilestones() {
  return useQuery({
    queryKey: ["loyalty_milestones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_milestones")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useLoyaltyBonuses() {
  return useQuery({
    queryKey: ["loyalty_bonuses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_bonuses")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useLoyaltyConfig() {
  return useQuery({
    queryKey: ["loyalty_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_config")
        .select("*")
        .order("key");
      if (error) throw error;
      return data;
    },
  });
}

export function useLoyaltyTransactions(limit = 50) {
  return useQuery({
    queryKey: ["loyalty_transactions", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("points_transactions")
        .select("*, profiles!points_transactions_user_id_fkey(display_name, email)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveLoyaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = id
        ? await supabase.from("loyalty_earning_rules").update(data).eq("id", id)
        : await supabase.from("loyalty_earning_rules").insert(data);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty_earning_rules"] }),
  });
}

export function useDeleteLoyaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loyalty_earning_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty_earning_rules"] }),
  });
}

export function useSaveLoyaltyMultiplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = id
        ? await supabase.from("loyalty_multipliers").update(data).eq("id", id)
        : await supabase.from("loyalty_multipliers").insert(data);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty_multipliers"] }),
  });
}

export function useDeleteLoyaltyMultiplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loyalty_multipliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty_multipliers"] }),
  });
}

export function useSaveLoyaltyMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = id
        ? await supabase.from("loyalty_milestones").update(data).eq("id", id)
        : await supabase.from("loyalty_milestones").insert(data);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty_milestones"] }),
  });
}

export function useDeleteLoyaltyMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loyalty_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty_milestones"] }),
  });
}

export function useSaveLoyaltyBonus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = id
        ? await supabase.from("loyalty_bonuses").update(data).eq("id", id)
        : await supabase.from("loyalty_bonuses").insert(data);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty_bonuses"] }),
  });
}

export function useDeleteLoyaltyBonus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loyalty_bonuses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty_bonuses"] }),
  });
}

export function useSaveLoyaltyConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value, description }: { key: string; value: string; description?: string }) => {
      const { error } = await supabase
        .from("loyalty_config")
        .upsert({ key, value, description, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty_config"] }),
  });
}
