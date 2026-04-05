import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PERMISSION_KEYS = [
  "site_admin_expense_reports_visible",
  "site_admin_pnl_visible",
  "site_admin_product_profitability_visible",
  "site_admin_cost_price_visible",
] as const;

export type SiteAdminPermissions = Record<string, boolean>;

export function useSiteAdminPermissions() {
  return useQuery({
    queryKey: ["site_admin_permissions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("key, value")
        .in("key", [...PERMISSION_KEYS]);
      const result: SiteAdminPermissions = {};
      for (const key of PERMISSION_KEYS) {
        const row = data?.find((r) => r.key === key);
        result[key] = row?.value === "true";
      }
      return result;
    },
    staleTime: 30_000,
  });
}

export function useUpdateSiteAdminPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("admin_config")
        .update({ value: enabled ? "true" : "false" })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site_admin_permissions"] });
    },
  });
}
