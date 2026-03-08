import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProducts(type?: string) {
  return useQuery({
    queryKey: ["products", type],
    queryFn: async () => {
      let query = supabase.from("products").select("*").eq("in_stock", true).order("sort_order");
      if (type) query = query.eq("type", type);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
