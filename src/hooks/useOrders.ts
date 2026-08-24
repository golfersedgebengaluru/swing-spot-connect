import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export function useMyOrders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      items: OrderItem[];
      total_price: number;
      city?: string;
      note?: string;
    }) => {
      const { data, error } = await supabase
        .from("orders")
        .insert({
          user_id: user!.id,
          items: params.items as any,
          total_price: params.total_price,
          city: params.city || null,
          note: params.note || null,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;

      // Record revenue for the shop order.
      // `source_ref` makes this idempotent (a retried mutation can't double-count)
      // and `product_id` is set when the order is a single catalogue product so
      // the revenue report can categorise it from General Settings. Multi-product
      // orders are categorised from their invoice line items.
      if (params.total_price > 0) {
        const itemsSummary = params.items.map(i => `${i.quantity}× ${i.name}`).join(", ");
        const singleProductId = params.items.length === 1 ? params.items[0].id : null;
        await supabase.from("revenue_transactions").insert({
          user_id: user!.id,
          transaction_type: "product_order",
          amount: params.total_price,
          currency: "INR",
          city: params.city || null,
          description: `Shop order: ${itemsSummary}`,
          status: "confirmed",
          source_ref: `shop_order:${data.id}`,
          product_id: singleProductId,
          metadata: { order_id: data.id, items: params.items },
        } as any);
      }


      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin_orders"] });
      queryClient.invalidateQueries({ queryKey: ["revenue_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["revenue_summary"] });
    },
  });
}
