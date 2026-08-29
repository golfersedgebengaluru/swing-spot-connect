import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Reads go through products_public (excludes cost_price); writes still use products.

/**
 * Storefront products. The Shop is driven by the two fields the admin form
 * actually exposes: `item_type` ("product" vs "service") and `category`.
 * Services (coaching, bay session rates, league registration…) are never
 * sellable in the Shop.
 */
export function useSellableProducts() {
  return useQuery({
    queryKey: ["products", "sellable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products_public")
        .select("*")
        .eq("item_type", "product")
        .eq("in_stock", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Groups storefront products by their catalogue category, preserving sort order. */
export function groupByCategory<T extends { category: string | null }>(products: T[]) {
  const groups = new Map<string, T[]>();
  for (const p of products) {
    const key = (p.category || "Other").trim() || "Other";
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  return Array.from(groups.entries())
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function useAllProducts() {
  return useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products_public").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}
