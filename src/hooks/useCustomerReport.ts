import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { parseCustomerReport } from "@/lib/customer-report";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";

export type CustomerReportArgs = Database["public"]["Functions"]["customer_report"]["Args"];
export async function fetchCustomerReport(args: CustomerReportArgs) {
  const { data, error } = await supabase.rpc("customer_report", args);
  if (error) throw error;
  return parseCustomerReport(data);
}
export function useCustomerReport(args: CustomerReportArgs, enabled = true) {
  const { hasAdminAccess, loading } = useAdmin();
  const { user } = useAuth();
  return useQuery({ queryKey: ["admin_all_users", "customer-report", user?.id, args], queryFn: () => fetchCustomerReport(args), enabled: enabled && hasAdminAccess && !loading, staleTime: 30_000 });
}