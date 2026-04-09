import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExpenseCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories" as any)
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ExpenseCategory[];
    },
  });
}

export function useCreateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; sort_order?: number }) => {
      const { error } = await supabase.from("expense_categories" as any)
        .insert({ name: params.name, sort_order: params.sort_order ?? 0 });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense_categories"] }),
  });
}

export function useUpdateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ExpenseCategory> & { id: string }) => {
      const { error } = await supabase.from("expense_categories" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense_categories"] }),
  });
}

export function useDeleteExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_categories" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense_categories"] }),
  });
}
