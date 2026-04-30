import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface CoachingSession {
  id: string;
  coach_user_id: string;
  student_user_id: string;
  city: string;
  session_date: string;
  notes: string | null;
  drills: string | null;
  progress_summary: string | null;
  onform_url: string | null;
  sportsbox_url: string | null;
  superspeed_url: string | null;
  other_url: string | null;
  other_label: string | null;
  booking_id: string | null;
  created_at: string;
  updated_at: string;
  coach_profile?: { display_name: string | null; email: string | null } | null;
  student_profile?: { display_name: string | null; email: string | null } | null;
}

export interface CoachRow {
  id: string;
  user_id: string;
  city: string;
  bio: string | null;
  is_active: boolean;
  created_at: string;
  profile?: { display_name: string | null; email: string | null } | null;
}

async function attachProfiles(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;
  const userIds = Array.from(
    new Set(rows.flatMap((r) => [r.coach_user_id, r.student_user_id, r.user_id].filter(Boolean)))
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, email")
    .in("user_id", userIds);
  const map = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
  return rows.map((r) => ({
    ...r,
    coach_profile: r.coach_user_id ? map.get(r.coach_user_id) ?? null : undefined,
    student_profile: r.student_user_id ? map.get(r.student_user_id) ?? null : undefined,
    profile: r.user_id ? map.get(r.user_id) ?? null : undefined,
  }));
}

/* ---------- STUDENT: my sessions ---------- */
export function useMyStudentSessions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["coaching", "my-student-sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_sessions")
        .select("*")
        .eq("student_user_id", user!.id)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return (await attachProfiles(data ?? [])) as CoachingSession[];
    },
  });
}

/* ---------- COACH: my coached sessions, grouped by student ---------- */
export function useMyCoachSessions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["coaching", "my-coach-sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_sessions")
        .select("*")
        .eq("coach_user_id", user!.id)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return (await attachProfiles(data ?? [])) as CoachingSession[];
    },
  });
}

/* ---------- ADMIN: all sessions, optionally filtered by city ---------- */
export function useAllSessions(city?: string) {
  return useQuery({
    queryKey: ["coaching", "all-sessions", city ?? "all"],
    queryFn: async () => {
      let q = supabase.from("coaching_sessions").select("*").order("session_date", { ascending: false });
      if (city) q = q.eq("city", city);
      const { data, error } = await q;
      if (error) throw error;
      return (await attachProfiles(data ?? [])) as CoachingSession[];
    },
  });
}

/* ---------- Single session ---------- */
export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: ["coaching", "session", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_sessions")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [enriched] = await attachProfiles([data]);
      return enriched as CoachingSession;
    },
  });
}

/* ---------- Coaches roster ---------- */
export function useCoaches(city?: string) {
  return useQuery({
    queryKey: ["coaching", "coaches", city ?? "all"],
    queryFn: async () => {
      let q = supabase.from("coaches").select("*").order("created_at", { ascending: false });
      if (city) q = q.eq("city", city);
      const { data, error } = await q;
      if (error) throw error;
      return (await attachProfiles(data ?? [])) as CoachRow[];
    },
  });
}

/* ---------- Search students (by email or name) ----------
   Returns BOTH registered (user_id set) and pre-registered (user_id null,
   profile.id used as fallback) so admin-created members like walk-ins are findable.
*/
export function useStudentSearch(query: string) {
  return useQuery({
    queryKey: ["coaching", "student-search", query],
    enabled: query.trim().length >= 2,
    queryFn: async () => {
      const term = query.trim();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email")
        .or(`display_name.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(15);
      if (error) throw error;
      // Surface a single id for downstream use; prefer auth user_id, fall back to profile id.
      return (data ?? []).map((p: any) => ({
        ...p,
        resolved_id: p.user_id ?? p.id,
        is_registered: !!p.user_id,
      }));
    },
  });
}

/* ---------- Bookings for a given student (for linking to a session) ---------- */
export function useStudentBookings(studentId: string | undefined, city?: string) {
  return useQuery({
    queryKey: ["coaching", "student-bookings", studentId ?? "none", city ?? "all"],
    enabled: !!studentId,
    queryFn: async () => {
      // Window: last 30 days → next 14 days
      const from = new Date(Date.now() - 30 * 86400000).toISOString();
      const to = new Date(Date.now() + 14 * 86400000).toISOString();
      let q = supabase
        .from("bookings")
        .select("id, city, bay_id, start_time, end_time, session_type, status, coach_name")
        .eq("user_id", studentId!)
        .gte("start_time", from)
        .lte("start_time", to)
        .neq("status", "cancelled")
        .order("start_time", { ascending: false })
        .limit(50);
      if (city) q = q.eq("city", city);
      const { data, error } = await q;
      if (error) throw error;
      // Bay names
      const bayIds = Array.from(new Set((data ?? []).map((b) => b.bay_id).filter(Boolean)));
      let bayMap = new Map<string, string>();
      if (bayIds.length) {
        const { data: bays } = await supabase.from("bays").select("id, name").in("id", bayIds);
        bayMap = new Map((bays ?? []).map((b: any) => [b.id, b.name]));
      }
      return (data ?? []).map((b: any) => ({ ...b, bay_name: bayMap.get(b.bay_id) || "Bay" }));
    },
  });
}

/* ---------- Mutations ---------- */
type SessionInput = {
  id?: string;
  coach_user_id: string;
  student_user_id: string;
  city: string;
  session_date: string;
  notes?: string | null;
  drills?: string | null;
  progress_summary?: string | null;
  onform_url?: string | null;
  sportsbox_url?: string | null;
  superspeed_url?: string | null;
  other_url?: string | null;
  other_label?: string | null;
  booking_id?: string | null;
};

export function useSaveSession() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: SessionInput) => {
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase.from("coaching_sessions").update(patch).eq("id", id);
        if (error) throw error;
        return id;
      } else {
        const { data, error } = await supabase
          .from("coaching_sessions")
          .insert(input)
          .select("id")
          .single();
        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching"] });
      toast({ title: "Session saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coaching_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching"] });
      toast({ title: "Session deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });
}

export function useSaveCoach() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { id?: string; user_id: string; city: string; bio?: string | null; is_active?: boolean }) => {
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase.from("coaches").update(patch).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coaches").insert(input);
        if (error) throw error;
      }
      // Auto-grant the `coach` role so this user can create sessions immediately.
      let roleGranted = true;
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("manage-roles", {
          body: { action: "grant", user_id: input.user_id, role: "coach" },
        });
        if (fnErr || (data && (data as any).error)) {
          roleGranted = false;
          console.warn("Auto-grant coach role failed", fnErr || (data as any).error);
        }
      } catch (e) {
        roleGranted = false;
        console.warn("Auto-grant coach role threw", e);
      }
      return { roleGranted };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["coaching", "coaches"] });
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      toast({
        title: "Coach saved",
        description: res.roleGranted
          ? "Coach role granted automatically."
          : "Saved, but the coach role could not be granted automatically. Assign it under Settings → Roles.",
        variant: res.roleGranted ? "default" : "destructive",
      });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteCoach() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from("coaches").select("user_id").eq("id", id).maybeSingle();
      const { error } = await supabase.from("coaches").delete().eq("id", id);
      if (error) throw error;
      if (row?.user_id) {
        try {
          await supabase.functions.invoke("manage-roles", {
            body: { action: "revoke", user_id: row.user_id, role: "coach" },
          });
        } catch (e) {
          console.warn("Auto-revoke coach role failed (non-fatal)", e);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching", "coaches"] });
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      toast({ title: "Coach removed" });
    },
    onError: (e: any) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });
}

/* ---------- Am I a coach? ---------- */
export function useIsCoach() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["coaching", "is-coach", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_coach", { _user_id: user!.id });
      if (error) throw error;
      return data === true;
    },
  });
}
