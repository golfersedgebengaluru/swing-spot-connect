import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AdminRole = "admin" | "site_admin" | null;

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSiteAdmin, setIsSiteAdmin] = useState(false);
  const [role, setRole] = useState<AdminRole>(null);
  const [assignedCities, setAssignedCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setIsAdmin(false);
      setIsSiteAdmin(false);
      setRole(null);
      setAssignedCities([]);
      setLoading(false);
      return;
    }

    const checkAdmin = async () => {
      setLoading(true);

      try {
        const [{ data: adminData }, { data: siteAdminData }] = await Promise.all([
          supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
          supabase.rpc("has_role", { _user_id: user.id, _role: "site_admin" as any }),
        ]);

        if (cancelled) return;

        const hasAdmin = adminData === true;
        const hasSiteAdmin = siteAdminData === true;

        setIsAdmin(hasAdmin);
        setIsSiteAdmin(hasSiteAdmin);
        setRole(hasAdmin ? "admin" : hasSiteAdmin ? "site_admin" : null);

        if (hasSiteAdmin && !hasAdmin) {
          const { data: cities } = await supabase
            .from("site_admin_cities" as any)
            .select("city")
            .eq("user_id", user.id);

          if (cancelled) return;
          setAssignedCities((cities ?? []).map((c: any) => c.city));
        } else {
          setAssignedCities([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void checkAdmin();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Helper: does this user have access to the admin panel at all?
  const hasAdminAccess = isAdmin || isSiteAdmin;

  return { isAdmin, isSiteAdmin, role, assignedCities, hasAdminAccess, loading };
}
