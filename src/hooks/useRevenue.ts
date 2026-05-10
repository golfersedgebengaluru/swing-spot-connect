import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Admin config toggle ────────────────────────────────
export function usePerCityFyToggle() {
  return useQuery({
    queryKey: ["admin_config", "allow_per_city_fy"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("value")
        .eq("key", "allow_per_city_fy")
        .maybeSingle();
      return data?.value === "true";
    },
  });
}

export function useUpdatePerCityFyToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("admin_config")
        .update({ value: enabled ? "true" : "false" } as any)
        .eq("key", "allow_per_city_fy");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_config", "allow_per_city_fy"] }),
  });
}

// ─── Financial Years ────────────────────────────────────
// Global FYs (city IS NULL)
export function useFinancialYears() {
  return useQuery({
    queryKey: ["financial_years", "global"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_years")
        .select("*")
        .is("city", null)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// City-specific FYs
export function useCityFinancialYears(city?: string) {
  return useQuery({
    queryKey: ["financial_years", "city", city],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_years")
        .select("*")
        .eq("city", city!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!city,
  });
}

export function useActiveFinancialYear() {
  return useQuery({
    queryKey: ["financial_years", "active", "global"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_years")
        .select("*")
        .eq("is_active", true)
        .is("city", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

// Effective FY: city override if exists, else global fallback
export function useEffectiveFinancialYear(city?: string) {
  const { data: globalFY } = useActiveFinancialYear();
  const { data: cityFYs } = useCityFinancialYears(city);
  const { data: overrideEnabled } = usePerCityFyToggle();

  const cityActiveFY = overrideEnabled && city
    ? (cityFYs ?? []).find((fy: any) => fy.is_active)
    : null;

  return cityActiveFY || globalFY || null;
}

export function useCreateFinancialYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fy: { label: string; start_date: string; end_date: string; is_active: boolean; city?: string | null }) => {
      const cityVal = fy.city ?? null;
      // If setting as active, deactivate others in same scope
      if (fy.is_active) {
        let q = supabase.from("financial_years").update({ is_active: false } as any).eq("is_active", true);
        if (cityVal) {
          q = q.eq("city", cityVal);
        } else {
          q = q.is("city", null);
        }
        await q;
      }
      const { data, error } = await supabase.from("financial_years").insert({ ...fy, city: cityVal } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial_years"] }),
  });
}

export function useUpdateFinancialYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, city, ...updates }: { id: string; city?: string | null; label?: string; start_date?: string; end_date?: string; is_active?: boolean }) => {
      if (updates.is_active) {
        const cityVal = city ?? null;
        let q = supabase.from("financial_years").update({ is_active: false } as any).eq("is_active", true);
        if (cityVal) {
          q = q.eq("city", cityVal);
        } else {
          q = q.is("city", null);
        }
        await q;
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

// ─── Revenue Transactions ───────────────────────────────
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
        .neq("transaction_type", "hours_deduction")
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
        .select("id, transaction_type, amount, status, user_id, guest_name, guest_email, created_at")
        .neq("transaction_type", "hours_deduction");

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

      const userIds = Object.keys(byUser);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, user_id, display_name, email, user_type");
        const dualMap = new Map<string, string>();
        for (const p of profiles ?? []) {
          const name = p.display_name || p.email || "";
          if (p.user_id) dualMap.set(p.user_id, name);
          dualMap.set(p.id, name);
        }
        for (const uid of userIds) {
          if (byUser[uid]) {
            byUser[uid].name = dualMap.get(uid) || "";
          }
        }
      }

      // --- Revenue by product category ---
      // All booking & guest_booking transactions are Bay Usage.
      // Other transaction types use invoice line-item product categories.
      const BAY_USAGE_TYPES = new Set(["booking", "guest_booking"]);
      const nonRefundConfirmed = confirmed.filter((t) => t.transaction_type !== "refund");

      const byCategory: Record<string, number> = {};

      const bayUsageTxns: typeof nonRefundConfirmed = [];
      const otherTxns: typeof nonRefundConfirmed = [];
      for (const t of nonRefundConfirmed) {
        if (BAY_USAGE_TYPES.has(t.transaction_type)) {
          bayUsageTxns.push(t);
        } else {
          otherTxns.push(t);
        }
      }

      // Bay Usage = sum of all booking/guest_booking amounts
      const bayUsageTotal = bayUsageTxns.reduce((s, t) => s + Number(t.amount), 0);
      if (bayUsageTotal > 0) {
        byCategory["Bay Usage"] = bayUsageTotal;
      }

      // For non-bay transactions, break down by invoice line-item product categories.
      // Any non-bay transaction without invoice line items (e.g. hour/membership package
      // purchases) is attributed to "Membership" so totals reconcile with Total Revenue.
      if (otherTxns.length > 0) {
        const otherIds = otherTxns.map((t: any) => t.id).filter(Boolean);
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, revenue_transaction_id")
          .in("revenue_transaction_id", otherIds);

        const invoiceByTxn = new Map<string, string>();
        for (const inv of invoices ?? []) {
          if (inv.revenue_transaction_id) invoiceByTxn.set(inv.revenue_transaction_id, inv.id);
        }

        const invoiceIds = (invoices ?? []).map((inv) => inv.id);
        const lineTotalsByInvoice = new Map<string, number>();
        if (invoiceIds.length > 0) {
          const { data: lineItems } = await supabase
            .from("invoice_line_items")
            .select("invoice_id, line_total, product_id")
            .in("invoice_id", invoiceIds);

          const productIds = [...new Set((lineItems ?? []).map((li) => li.product_id).filter(Boolean))] as string[];
          let productCategoryMap: Record<string, string> = {};
          if (productIds.length > 0) {
            const { data: products } = await supabase
              .from("products")
              .select("id, category")
              .in("id", productIds);
            productCategoryMap = Object.fromEntries((products ?? []).map((p) => [p.id, p.category]));
          }

          for (const li of lineItems ?? []) {
            const cat = li.product_id ? (productCategoryMap[li.product_id] || "Membership") : "Membership";
            byCategory[cat] = (byCategory[cat] || 0) + Number(li.line_total);
            lineTotalsByInvoice.set(li.invoice_id, (lineTotalsByInvoice.get(li.invoice_id) ?? 0) + Number(li.line_total));
          }
        }

        // Residual: transactions without an invoice OR whose invoice has no line items
        // → attribute to Membership (covers hour packages, prepaid membership, etc.)
        for (const t of otherTxns) {
          const invId = invoiceByTxn.get((t as any).id);
          const lineSum = invId ? (lineTotalsByInvoice.get(invId) ?? 0) : 0;
          const residual = Number(t.amount) - lineSum;
          if (residual > 0) {
            byCategory["Membership"] = (byCategory["Membership"] || 0) + residual;
          }
        }
      }

      return { totalRevenue, totalRefunds, netRevenue: totalRevenue - totalRefunds, byType, byCategory, byUser, byGuest, totalCount: transactions.length };
    },
    enabled: !!startDate && !!endDate,
  });
}
