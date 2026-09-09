import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { recordRevenue } from "@/lib/revenue";

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

      // Record revenue for the shop order through the single ledger entry point.
      // `sourceRef` makes this idempotent (a retried mutation can't double-count),
      // the currency follows the order's city instead of always being rupees, and
      // `productId` is set for single-product orders so the revenue report can
      // categorise them from General Settings. Multi-product orders are
      // categorised from their invoice line items.
      if (params.total_price > 0) {
        const itemsSummary = params.items.map(i => `${i.quantity}× ${i.name}`).join(", ");
        const singleProductId = params.items.length === 1 ? params.items[0].id : null;
        // A failure here must be visible: a sale we didn't book is a hole in the
        // revenue report, so it surfaces instead of being swallowed.
        await recordRevenue({
          sourceRef: `shop_order:${data.id}`,
          transactionType: "product_order",
          amount: params.total_price,
          description: `Shop order: ${itemsSummary}`,
          city: params.city || null,
          userId: user!.id,
          productId: singleProductId,
          metadata: { order_id: data.id, items: params.items },
        });
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
