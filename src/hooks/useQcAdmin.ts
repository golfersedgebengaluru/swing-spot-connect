import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface QcTenant {
  id: string;
  name: string;
  display_name: string | null;
  city: string | null;
  role: "owner" | "staff";
}

export function useQcAdmin() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["qc-admin-tenants", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<QcTenant[]> => {
      const { data, error } = await supabase
        .from("qc_only_admins")
        .select("role, tenant_id, disabled, tenants:tenant_id ( id, name, display_name, city, kind )")
        .eq("user_id", user!.id)
        .eq("disabled", false);
      if (error) throw error;
      return (data ?? [])
        // deno-lint-ignore no-explicit-any
        .map((r: any) => r.tenants && r.tenants.kind === "qc_only" ? {
          id: r.tenants.id,
          name: r.tenants.name,
          display_name: r.tenants.display_name,
          city: r.tenants.city,
          role: r.role,
        } : null)
        .filter(Boolean) as QcTenant[];
    },
  });

  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeTenantId && q.data && q.data.length > 0) setActiveTenantId(q.data[0].id);
  }, [q.data, activeTenantId]);

  return {
    tenants: q.data ?? [],
    loading: q.isLoading,
    isQcOnlyAdmin: (q.data?.length ?? 0) > 0,
    activeTenantId,
    setActiveTenantId,
    activeTenant: q.data?.find((t) => t.id === activeTenantId) ?? null,
  };
}


// Super-admin: provision QC SaaS tenants and assign owners by email.
export function useQcSaasProvisioning() {
  const qc = useQueryClient();

  const tenants = useQuery({
    queryKey: ["qc-saas-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, display_name, city, created_at, kind")
        .eq("kind", "qc_only")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createTenant = useMutation({
    mutationFn: async (vars: { name: string; display_name?: string }) => {
      const { data, error } = await supabase
        .from("tenants")
        .insert({ name: vars.name, display_name: vars.display_name ?? vars.name, kind: "qc_only", city: null as unknown as string })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qc-saas-tenants"] }),
  });

  const assignOwnerByEmail = useMutation({
    mutationFn: async (vars: { tenant_id: string; email: string }) => {
      const email = vars.email.trim().toLowerCase();
      // Use limit(1) instead of maybeSingle to tolerate duplicate profile rows for the same email.
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, created_at")
        .ilike("email", email)
        .order("created_at", { ascending: true })
        .limit(1);
      if (pErr) throw pErr;
      const userId = profs?.[0]?.user_id;
      if (!userId) throw new Error("No user with that email. Ask them to sign up first.");
      const { error } = await supabase
        .from("qc_only_admins")
        .insert({ user_id: userId, tenant_id: vars.tenant_id, role: "owner" });
      if (error && !`${error.message}`.includes("duplicate")) throw error;
      return true;
    },
  });

  return { tenants, createTenant, assignOwnerByEmail };
}
