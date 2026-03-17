import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface EmailPreferences {
  id: string;
  user_id: string;
  booking_confirmed: boolean;
  booking_cancelled: boolean;
  booking_rescheduled: boolean;
  points_earned: boolean;
  points_redeemed: boolean;
  league_updates: boolean;
}

export function useEmailPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["email_preferences", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error && error.code === "PGRST116") {
        // No preferences yet — create defaults
        const { data: newPrefs, error: insertErr } = await supabase
          .from("email_preferences")
          .insert({ user_id: user!.id })
          .select()
          .single();
        if (insertErr) throw insertErr;
        return newPrefs as unknown as EmailPreferences;
      }
      if (error) throw error;
      return data as unknown as EmailPreferences;
    },
  });
}

export function useUpdateEmailPreferences() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (updates: Partial<EmailPreferences>) => {
      const { error } = await supabase
        .from("email_preferences")
        .update(updates)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_preferences", user?.id] });
    },
  });
}

export function useEmailLog(filters?: { status?: string; template?: string }) {
  return useQuery({
    queryKey: ["email_log", filters],
    queryFn: async () => {
      let query = supabase
        .from("email_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.template && filters.template !== "all") {
        query = query.eq("template", filters.template);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useSendTestEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { user_id: string; template: string; subject: string; data: Record<string, any> }) => {
      const res = await supabase.functions.invoke("send-notification-email", {
        body: { ...params, is_test: true },
      });
      if (res.error) throw new Error(res.error.message || "Failed to send test email");
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email_log"] });
    },
  });
}
