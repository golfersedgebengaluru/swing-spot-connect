import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

export type AdminRole = "admin" | "site_admin" | null;

interface AdminState {
  isAdmin: boolean;
  isSiteAdmin: boolean;
  isCoach: boolean;
  role: AdminRole;
  assignedCities: string[];
}

async function fetchAdminState(userId: string): Promise<AdminState> {
  const [{ data: adminData }, { data: siteAdminData }, { data: coachData }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "site_admin" as any }),
    supabase.rpc("is_coach", { _user_id: userId }),
  ]);

  const hasAdmin = adminData === true;
  const hasSiteAdmin = siteAdminData === true;
  const hasCoach = coachData === true;
  const role: AdminRole = hasAdmin ? "admin" : hasSiteAdmin ? "site_admin" : null;

  let assignedCities: string[] = [];
  if (hasSiteAdmin && !hasAdmin) {
    const { data: cities } = await supabase
      .from("site_admin_cities" as any)
      .select("city")
      .eq("user_id", userId);
    assignedCities = (cities ?? []).map((c: any) => c.city);
  }

  return { isAdmin: hasAdmin, isSiteAdmin: hasSiteAdmin, isCoach: hasCoach, role, assignedCities };
}

export function useAdmin() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-role", user?.id ?? "anon"],
    queryFn: () => fetchAdminState(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const isAdmin = data?.isAdmin ?? false;
  const isSiteAdmin = data?.isSiteAdmin ?? false;
  const isCoach = data?.isCoach ?? false;
  const role = data?.role ?? null;
  const assignedCities = data?.assignedCities ?? [];
  const loading = !!user && isLoading;

  // Admins, site-admins, AND coaches can access the admin panel.
  // Sidebar items themselves are gated below.
  const hasAdminAccess = isAdmin || isSiteAdmin || isCoach;

  return { isAdmin, isSiteAdmin, isCoach, role, assignedCities, hasAdminAccess, loading };
}
