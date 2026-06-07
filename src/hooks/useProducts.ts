import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Reads go through products_public (excludes cost_price); writes still use products.
export function useProducts(type?: string) {
  return useQuery({
    queryKey: ["products", type],
    queryFn: async () => {
      let query = (supabase.from as any)("products_public").select("*").eq("in_stock", true).order("sort_order");
      if (type) query = query.eq("type", type);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useAllProducts() {
  return useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("products_public").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

