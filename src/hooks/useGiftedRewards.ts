import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useGiftedRewards(userId?: string) {
  return useQuery({
    queryKey: ["gifted_rewards", userId],
    queryFn: async () => {
      let q = supabase.from("gifted_rewards").select("*").order("created_at", { ascending: false });
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useMyGiftedRewards(userId?: string) {
  return useQuery({
    queryKey: ["my_gifted_rewards", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gifted_rewards")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAutoGiftRules() {
  return useQuery({
    queryKey: ["auto_gift_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_gift_rules")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useGrantGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { user_id: string; reward_name: string; reward_description?: string; gift_type?: string; trigger_event?: string; gifted_by?: string; notes?: string }) => {
      const { error } = await supabase.from("gifted_rewards").insert({
        ...data,
        gift_type: data.gift_type ?? "manual",
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gifted_rewards"] });
      qc.invalidateQueries({ queryKey: ["my_gifted_rewards"] });
    },
  });
}

export function useClaimGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (giftId: string) => {
      const { error } = await supabase
        .from("gifted_rewards")
        .update({ status: "claimed", redeemed_at: new Date().toISOString() })
        .eq("id", giftId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gifted_rewards"] });
      qc.invalidateQueries({ queryKey: ["my_gifted_rewards"] });
    },
  });
}

export function useSaveAutoGiftRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const { error } = id
        ? await supabase.from("auto_gift_rules").update(data).eq("id", id)
        : await supabase.from("auto_gift_rules").insert(data);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto_gift_rules"] }),
  });
}

export function useDeleteAutoGiftRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("auto_gift_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto_gift_rules"] }),
  });
}
