import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Vendor {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  category: string | null;
  notes: string | null;
  city: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useVendors(city?: string) {
  return useQuery({
    queryKey: ["vendors", city],
    enabled: !!city,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendors")
        .select("*")
        .eq("city", city)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vendor: Omit<Vendor, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await (supabase as any)
        .from("vendors")
        .insert(vendor)
        .select()
        .single();
      if (error) throw error;
      return data as Vendor;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Vendor> & { id: string }) => {
      const { error } = await (supabase as any)
        .from("vendors")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("vendors")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  });
}
