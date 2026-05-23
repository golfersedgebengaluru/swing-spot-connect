import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const DEFAULTS = {
  name: "Grievance Officer, Teetime Ventures Pvt Ltd",
  email: "grievance@golfers-edge.in",
};

export type GrievanceOfficer = { name: string; email: string };

export function useGrievanceOfficer() {
  return useQuery({
    queryKey: ["grievance_officer"],
    queryFn: async (): Promise<GrievanceOfficer> => {
      const { data, error } = await supabase
        .from("admin_config")
        .select("key, value")
        .in("key", ["grievance_officer_name", "grievance_officer_email"]);
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as string]));
      return {
        name: map.get("grievance_officer_name") || DEFAULTS.name,
        email: map.get("grievance_officer_email") || DEFAULTS.email,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateGrievanceOfficer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: GrievanceOfficer) => {
      const rows = [
        { key: "grievance_officer_name", value: next.name },
        { key: "grievance_officer_email", value: next.email },
      ];
      const { error } = await supabase
        .from("admin_config")
        .upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grievance_officer"] }),
  });
}
