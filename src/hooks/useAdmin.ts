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
    if (!user) {
      setIsAdmin(false);
      setIsSiteAdmin(false);
      setRole(null);
      setAssignedCities([]);
      setLoading(false);
      return;
    }

    const checkAdmin = async () => {
      // Check admin role
      const { data: adminData } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      const hasAdmin = adminData === true;

      // Check site_admin role
      const { data: siteAdminData } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "site_admin" as any,
      });
      const hasSiteAdmin = siteAdminData === true;

      setIsAdmin(hasAdmin);
      setIsSiteAdmin(hasSiteAdmin);
      setRole(hasAdmin ? "admin" : hasSiteAdmin ? "site_admin" : null);

      // If site_admin, fetch assigned cities
      if (hasSiteAdmin && !hasAdmin) {
        const { data: cities } = await (supabase as any)
          .from("site_admin_cities")
          .select("city")
          .eq("user_id", user.id);
        setAssignedCities((cities ?? []).map((c: any) => c.city));
      } else if (hasAdmin) {
        // Admin has access to all cities - leave empty to signify "all"
        setAssignedCities([]);
      }

      setLoading(false);
    };

    checkAdmin();
  }, [user]);

  // Helper: does this user have access to the admin panel at all?
  const hasAdminAccess = isAdmin || isSiteAdmin;

  return { isAdmin, isSiteAdmin, role, assignedCities, hasAdminAccess, loading };
}
