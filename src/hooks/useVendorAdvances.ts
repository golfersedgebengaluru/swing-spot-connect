import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VendorAdvanceTransaction {
  id: string;
  vendor_id: string;
  amount: number;
  transaction_type: "credit" | "debit";
  source_type: string;
  source_id: string | null;
  description: string | null;
  city: string;
  created_at: string;
  created_by: string | null;
}

export function useVendorAdvanceBalance(vendorId?: string | null) {
  return useQuery({
    queryKey: ["vendor_advance_balance", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vendor_advance_balance", {
        p_vendor_id: vendorId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

export function useVendorAdvanceTransactions(vendorId?: string | null) {
  return useQuery({
    queryKey: ["vendor_advance_transactions", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advance_transactions")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VendorAdvanceTransaction[];
    },
  });
}

export function useAllVendorAdvanceBalances(city?: string) {
  return useQuery({
    queryKey: ["vendor_advance_balances_all", city],
    enabled: !!city,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advance_transactions")
        .select("vendor_id, amount, transaction_type, created_at, city")
        .eq("entity_type", "vendor")
        .eq("city", city);
      if (error) throw error;

      const map = new Map<string, { balance: number; lastDate: string }>();
      for (const t of (data ?? []) as Array<{ vendor_id: string | null; amount: number; transaction_type: string; created_at: string }>) {
        if (!t.vendor_id) continue;
        const existing = map.get(t.vendor_id) || { balance: 0, lastDate: t.created_at };
        existing.balance += t.transaction_type === "credit" ? Number(t.amount) : -Number(t.amount);
        if (t.created_at > existing.lastDate) existing.lastDate = t.created_at;
        map.set(t.vendor_id, existing);
      }
      const out: { vendor_id: string; balance: number; last_transaction_date: string }[] = [];
      map.forEach((v, k) => out.push({ vendor_id: k, balance: v.balance, last_transaction_date: v.lastDate }));
      return out;
    },
  });
}

interface AddVendorAdvanceParams {
  vendorId: string;
  amount: number;
  description: string;
  city: string;
}

export function useAddVendorAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: AddVendorAdvanceParams) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("advance_transactions").insert({
        vendor_id: params.vendorId,
        entity_type: "vendor",
        customer_id: null,
        amount: params.amount,
        transaction_type: "credit",
        source_type: "vendor_payment",
        description: params.description,
        city: params.city,
        created_by: userData.user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: (_, p) => {
      qc.invalidateQueries({ queryKey: ["vendor_advance_balance", p.vendorId] });
      qc.invalidateQueries({ queryKey: ["vendor_advance_transactions", p.vendorId] });
      qc.invalidateQueries({ queryKey: ["vendor_advance_balances_all"] });
    },
  });
}

interface SettleVendorAdvanceParams {
  vendorId: string;
  amount: number;
  expenseId?: string;
  description: string;
  city: string;
}

export function useSettleVendorAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: SettleVendorAdvanceParams) => {
      const { data: balance } = await supabase.rpc("get_vendor_advance_balance", {
        p_vendor_id: params.vendorId,
      });
      if (Number(balance ?? 0) < params.amount) {
        throw new Error(`Insufficient vendor advance. Available: ${Number(balance ?? 0)}`);
      }
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("advance_transactions").insert({
        vendor_id: params.vendorId,
        entity_type: "vendor",
        customer_id: null,
        amount: params.amount,
        transaction_type: "debit",
        source_type: "expense_settlement",
        source_id: params.expenseId || null,
        description: params.description,
        city: params.city,
        created_by: userData.user?.id || null,
      });
      if (error) throw error;

      // Mark linked expense as (partly) settled
      if (params.expenseId) {
        const { data: exp } = await supabase
          .from("expenses")
          .select("total, settled_amount")
          .eq("id", params.expenseId)
          .single();
        if (exp) {
          const newSettled = Number(exp.settled_amount || 0) + params.amount;
          await supabase
            .from("expenses")
            .update({
              settled_amount: newSettled,
              is_settled: newSettled >= Number(exp.total) - 0.01,
            })
            .eq("id", params.expenseId);
        }
      }
    },
    onSuccess: (_, p) => {
      qc.invalidateQueries({ queryKey: ["vendor_advance_balance", p.vendorId] });
      qc.invalidateQueries({ queryKey: ["vendor_advance_transactions", p.vendorId] });
      qc.invalidateQueries({ queryKey: ["vendor_advance_balances_all"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}
