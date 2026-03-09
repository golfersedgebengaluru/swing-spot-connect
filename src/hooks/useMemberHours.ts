import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MemberHoursRow {
  id: string;
  user_id: string;
  hours_purchased: number;
  hours_used: number;
  created_at: string;
  updated_at: string;
  display_name: string | null;
  email: string | null;
}

export interface HoursTransaction {
  id: string;
  user_id: string;
  type: string;
  hours: number;
  note: string | null;
  created_at: string;
}

export function useMemberHours() {
  return useQuery({
    queryKey: ["member_hours"],
    queryFn: async () => {
      // Get member hours with profile info
      const { data: hours, error } = await supabase
        .from("member_hours")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;

      // Get profiles to map display names
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name");

      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.user_id, p.display_name])
      );

      return (hours ?? []).map((h: any) => ({
        ...h,
        display_name: profileMap.get(h.user_id) || "Unknown",
        email: null,
      })) as MemberHoursRow[];
    },
  });
}

export function useHoursTransactions(userId?: string) {
  return useQuery({
    queryKey: ["hours_transactions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hours_transactions")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as HoursTransaction[];
    },
  });
}
