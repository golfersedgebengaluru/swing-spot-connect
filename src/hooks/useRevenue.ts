import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Financial Years
export function useFinancialYears() {
  return useQuery({
    queryKey: ["financial_years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_years")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useActiveFinancialYear() {
  return useQuery({
    queryKey: ["financial_years", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_years")
        .select("*")
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateFinancialYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fy: { label: string; start_date: string; end_date: string; is_active: boolean }) => {
      // If setting as active, deactivate others first
      if (fy.is_active) {
        await supabase.from("financial_years").update({ is_active: false } as any).eq("is_active", true);
      }
      const { data, error } = await supabase.from("financial_years").insert(fy as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_years"] }),
  });
}

export function useUpdateFinancialYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; label?: string; start_date?: string; end_date?: string; is_active?: boolean }) => {
      if (updates.is_active) {
        await supabase.from("financial_years").update({ is_active: false } as any).eq("is_active", true);
      }
      const { error } = await supabase.from("financial_years").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_years"] }),
  });
}

export function useDeleteFinancialYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_years").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_years"] }),
  });
}

// Revenue Transactions
export function useRevenueTransactions(filters?: {
  startDate?: string;
  endDate?: string;
  type?: string;
  search?: string;
  city?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = filters?.page ?? 0;
  const pageSize = filters?.pageSize ?? 25;

  return useQuery({
    queryKey: ["revenue_transactions", filters],
    queryFn: async () => {
      let query = supabase
        .from("revenue_transactions")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (filters?.startDate) query = query.gte("created_at", filters.startDate);
      if (filters?.endDate) query = query.lte("created_at", filters.endDate + "T23:59:59.999Z");
      if (filters?.type) query = query.eq("transaction_type", filters.type);
      if (filters?.city) query = query.eq("city", filters.city);
      if (filters?.search) {
        query = query.or(`description.ilike.%${filters.search}%,guest_name.ilike.%${filters.search}%,guest_email.ilike.%${filters.search}%,gateway_payment_ref.ilike.%${filters.search}%`);
      }

      query = query.range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
  });
}

export function useRevenueSummary(startDate?: string, endDate?: string, city?: string) {
  return useQuery({
    queryKey: ["revenue_summary", startDate, endDate, city],
    queryFn: async () => {
      let query = supabase
        .from("revenue_transactions")
        .select("transaction_type, amount, status, user_id, guest_name, guest_email, created_at");

      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate + "T23:59:59.999Z");
      if (city) query = query.eq("city", city);

      const { data, error } = await query;
      if (error) throw error;

      const transactions = data ?? [];
      const confirmed = transactions.filter((t) => t.status === "confirmed");

      const totalRevenue = confirmed
        .filter((t) => t.transaction_type !== "refund")
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const totalRefunds = confirmed
        .filter((t) => t.transaction_type === "refund")
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const byType: Record<string, number> = {};
      for (const t of confirmed) {
        byType[t.transaction_type] = (byType[t.transaction_type] || 0) + Number(t.amount);
      }

      // Breakdown by user
      const byUser: Record<string, { name: string; amount: number; count: number }> = {};
      const byGuest: Record<string, { name: string; email: string; amount: number; count: number }> = {};

      for (const t of confirmed.filter((t) => t.transaction_type !== "refund")) {
        if (t.user_id) {
          if (!byUser[t.user_id]) byUser[t.user_id] = { name: "", amount: 0, count: 0 };
          byUser[t.user_id].amount += Number(t.amount);
          byUser[t.user_id].count += 1;
        } else if (t.guest_name) {
          const key = t.guest_email || t.guest_name;
          if (!byGuest[key]) byGuest[key] = { name: t.guest_name, email: t.guest_email || "", amount: 0, count: 0 };
          byGuest[key].amount += Number(t.amount);
          byGuest[key].count += 1;
        }
      }

      // Fetch display names for registered users
      const userIds = Object.keys(byUser);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, email, user_type")
          .in("user_id", userIds);
        for (const p of profiles ?? []) {
          if (p.user_id && byUser[p.user_id]) {
            byUser[p.user_id].name = p.display_name || p.email || p.user_id;
          }
        }
      }

      return { totalRevenue, totalRefunds, netRevenue: totalRevenue - totalRefunds, byType, byUser, byGuest, totalCount: transactions.length };
    },
    enabled: !!startDate && !!endDate,
  });
}
