import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PAGE_KEYS = [
  "page_leaderboard_visible",
  "page_community_visible",
  "page_shop_visible",
  "page_rewards_visible",
  "page_events_visible",
] as const;

export type PageVisibility = Record<string, boolean>;

export function usePageVisibility() {
  return useQuery({
    queryKey: ["page_visibility"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("key, value")
        .in("key", [...PAGE_KEYS]);
      const result: PageVisibility = {};
      for (const key of PAGE_KEYS) {
        const row = data?.find((r) => r.key === key);
        result[key] = row?.value === "true";
      }
      return result;
    },
    staleTime: 30_000,
  });
}

export function useUpdatePageVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, visible }: { key: string; visible: boolean }) => {
      const { error } = await supabase
        .from("admin_config")
        .update({ value: visible ? "true" : "false" })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page_visibility"] });
    },
  });
}
