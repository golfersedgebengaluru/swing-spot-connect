import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdvanceTransaction {
  id: string;
  customer_id: string;
  amount: number;
  transaction_type: "credit" | "debit";
  source_type: "credit_note" | "manual_deposit" | "drawdown";
  source_id: string | null;
  description: string | null;
  city: string;
  created_at: string;
  created_by: string | null;
}

export function useAdvanceBalance(customerId?: string | null) {
  return useQuery({
    queryKey: ["advance_balance", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_advance_balance" as any, {
        p_customer_id: customerId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

export function useAdvanceTransactions(customerId?: string | null) {
  return useQuery({
    queryKey: ["advance_transactions", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("advance_transactions" as any)
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdvanceTransaction[];
    },
  });
}

export function useAllAdvanceBalances(city?: string) {
  return useQuery({
    queryKey: ["advance_balances_all", city],
    queryFn: async () => {
      let query = supabase.from("advance_transactions" as any)
        .select("customer_id, amount, transaction_type, created_at, city");
      if (city) query = query.eq("city", city);
      const { data, error } = await query;
      if (error) throw error;

      // Aggregate by customer
      const map = new Map<string, { balance: number; lastDate: string; city: string }>();
      for (const t of (data ?? [])) {
        const existing = map.get(t.customer_id) || { balance: 0, lastDate: t.created_at, city: t.city };
        existing.balance += t.transaction_type === "credit" ? Number(t.amount) : -Number(t.amount);
        if (t.created_at > existing.lastDate) existing.lastDate = t.created_at;
        map.set(t.customer_id, existing);
      }

      // Filter to non-zero balances
      const results: { customer_id: string; balance: number; last_transaction_date: string; city: string }[] = [];
      map.forEach((v, k) => {
        if (Math.abs(v.balance) >= 0.01) {
          results.push({ customer_id: k, balance: v.balance, last_transaction_date: v.lastDate, city: v.city });
        }
      });
      return results;
    },
  });
}

interface AddAdvanceCreditParams {
  customerId: string;
  amount: number;
  sourceType: "credit_note" | "manual_deposit";
  sourceId?: string;
  description: string;
  city: string;
}

export function useAddAdvanceCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: AddAdvanceCreditParams) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("advance_transactions" as any)
        .insert({
          customer_id: params.customerId,
          amount: params.amount,
          transaction_type: "credit",
          source_type: params.sourceType,
          source_id: params.sourceId || null,
          description: params.description,
          city: params.city,
          created_by: userData.user?.id || null,
        });
      if (error) throw error;
    },
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: ["advance_balance", params.customerId] });
      qc.invalidateQueries({ queryKey: ["advance_transactions", params.customerId] });
      qc.invalidateQueries({ queryKey: ["advance_balances_all"] });
    },
  });
}

interface DrawdownAdvanceParams {
  customerId: string;
  amount: number;
  sourceId?: string;
  description: string;
  city: string;
}

export function useDrawdownAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: DrawdownAdvanceParams) => {
      // Verify balance is sufficient
      const { data: balance } = await supabase.rpc("get_advance_balance" as any, {
        p_customer_id: params.customerId,
      });
      if (Number(balance ?? 0) < params.amount) {
        throw new Error(`Insufficient advance balance. Available: ${Number(balance ?? 0)}`);
      }
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("advance_transactions" as any)
        .insert({
          customer_id: params.customerId,
          amount: params.amount,
          transaction_type: "debit",
          source_type: "drawdown",
          source_id: params.sourceId || null,
          description: params.description,
          city: params.city,
          created_by: userData.user?.id || null,
        });
      if (error) throw error;
    },
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: ["advance_balance", params.customerId] });
      qc.invalidateQueries({ queryKey: ["advance_transactions", params.customerId] });
      qc.invalidateQueries({ queryKey: ["advance_balances_all"] });
    },
  });
}
