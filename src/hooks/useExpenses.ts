import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Expense {
  id: string;
  vendor_id: string | null;
  expense_date: string;
  category_id: string | null;
  subtotal: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  total: number;
  payment_method: string | null;
  payment_reference: string | null;
  bill_url: string | null;
  city: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  vendors?: { name: string; gstin: string | null } | null;
  expense_categories?: { name: string } | null;
}

export interface ExpenseLineItem {
  id?: string;
  expense_id?: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  hsn_code: string | null;
  sac_code: string | null;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  line_total: number;
  product_id: string | null;
  sort_order: number;
}

export interface ExpenseFilters {
  city?: string;
  vendorId?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
  page?: number;
  pageSize?: number;
}

export function useExpenses(filters?: ExpenseFilters) {
  const page = filters?.page ?? 0;
  const pageSize = filters?.pageSize ?? 25;

  return useQuery({
    queryKey: ["expenses", filters],
    enabled: !!filters?.city,
    queryFn: async () => {
      let query = (supabase as any)
        .from("expenses")
        .select("*, vendors(name, gstin), expense_categories(name)", { count: "exact" })
        .order("expense_date", { ascending: false });

      if (filters?.city) query = query.eq("city", filters.city);
      if (filters?.vendorId) query = query.eq("vendor_id", filters.vendorId);
      if (filters?.categoryId) query = query.eq("category_id", filters.categoryId);
      if (filters?.startDate) query = query.gte("expense_date", filters.startDate);
      if (filters?.endDate) query = query.lte("expense_date", filters.endDate);
      if (filters?.paymentMethod) query = query.eq("payment_method", filters.paymentMethod);
      query = query.range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: (data ?? []) as Expense[], count: count ?? 0 };
    },
  });
}

export function useExpenseWithItems(expenseId: string | null) {
  return useQuery({
    queryKey: ["expense", expenseId],
    enabled: !!expenseId,
    queryFn: async () => {
      const { data: expense, error } = await (supabase as any)
        .from("expenses")
        .select("*, vendors(name, gstin), expense_categories(name)")
        .eq("id", expenseId)
        .single();
      if (error) throw error;

      const { data: items, error: itemsErr } = await (supabase as any)
        .from("expense_line_items")
        .select("*")
        .eq("expense_id", expenseId)
        .order("sort_order");
      if (itemsErr) throw itemsErr;

      return { ...expense, line_items: (items ?? []) as ExpenseLineItem[] };
    },
  });
}

export interface CreateExpenseParams {
  vendor_id?: string | null;
  expense_date: string;
  category_id?: string | null;
  subtotal: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  total: number;
  payment_method?: string;
  payment_reference?: string;
  bill_url?: string;
  city: string;
  notes?: string;
  line_items?: ExpenseLineItem[];
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: CreateExpenseParams) => {
      const { line_items, ...expenseData } = params;

      // Ensure empty strings become null for FK columns
      if (!expenseData.vendor_id) expenseData.vendor_id = null;
      if (!expenseData.category_id) expenseData.category_id = null;

      const { data: user } = await supabase.auth.getUser();
      const { data: expense, error } = await (supabase as any)
        .from("expenses")
        .insert({ ...expenseData, created_by: user?.user?.id || null })
        .select()
        .single();
      if (error) throw error;

      if (line_items?.length) {
        const payload = line_items.map((item, idx) => ({
          expense_id: expense.id,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          hsn_code: item.hsn_code || null,
          sac_code: item.sac_code || null,
          gst_rate: item.gst_rate,
          cgst_amount: item.cgst_amount,
          sgst_amount: item.sgst_amount,
          igst_amount: item.igst_amount,
          line_total: item.line_total,
          product_id: item.product_id || null,
          sort_order: idx,
        }));
        const { error: liErr } = await (supabase as any)
          .from("expense_line_items")
          .insert(payload);
        if (liErr) throw liErr;
      }

      return expense;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, line_items, ...updates }: Partial<CreateExpenseParams> & { id: string; line_items?: ExpenseLineItem[] }) => {
      // Ensure empty strings become null for FK columns
      if ('vendor_id' in updates && !updates.vendor_id) updates.vendor_id = null;
      if ('category_id' in updates && !updates.category_id) updates.category_id = null;

      const { error } = await (supabase as any)
        .from("expenses")
        .update(updates)
        .eq("id", id);
      if (error) throw error;

      if (line_items) {
        await (supabase as any).from("expense_line_items").delete().eq("expense_id", id);
        if (line_items.length) {
          const payload = line_items.map((item, idx) => ({
            expense_id: id,
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            hsn_code: item.hsn_code || null,
            sac_code: item.sac_code || null,
            gst_rate: item.gst_rate,
            cgst_amount: item.cgst_amount,
            sgst_amount: item.sgst_amount,
            igst_amount: item.igst_amount,
            line_total: item.line_total,
            product_id: item.product_id || null,
            sort_order: idx,
          }));
          const { error: liErr } = await (supabase as any)
            .from("expense_line_items")
            .insert(payload);
          if (liErr) throw liErr;
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("expenses")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}
