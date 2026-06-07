import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Returns Map<productId, costPrice> for products the current user is allowed to see. */
export function useProductCostPrices(productIds?: string[]) {
  const key = productIds ? [...productIds].sort().join(",") : "all";
  return useQuery({
    queryKey: ["product_cost_prices", key],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_cost_prices", {
        p_ids: productIds && productIds.length ? productIds : null,
      });
      if (error) throw error;
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => map.set(r.id, Number(r.cost_price) || 0));
      return map;
    },
    staleTime: 30_000,
  });
}

export function useSetProductCostPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cost }: { id: string; cost: number }) => {
      const { error } = await supabase.rpc("admin_set_product_cost_price", {
        p_id: id,
        p_cost: cost,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_cost_prices"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/** City-level cost-price visibility toggles (admin manages, site admin reads own). */
export function useCityCostPriceAccess() {
  return useQuery({
    queryKey: ["city_cost_price_access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("city_cost_price_access")
        .select("city, enabled");
      if (error) throw error;
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((r: any) => { map[r.city] = !!r.enabled; });
      return map;
    },
    staleTime: 30_000,
  });
}

export function useSetCityCostPriceAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ city, enabled }: { city: string; enabled: boolean }) => {
      const { data: userResp } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("city_cost_price_access")
        .upsert({ city, enabled, updated_by: userResp.user?.id, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["city_cost_price_access"] });
      qc.invalidateQueries({ queryKey: ["product_cost_prices"] });
    },
  });
}
