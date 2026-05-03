import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { sendNotificationEmail } from "@/hooks/useNotificationEmail";

export interface ToolLink {
  url: string;
  label?: string;
}

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
  onform_links: ToolLink[];
  sportsbox_links: ToolLink[];
  superspeed_links: ToolLink[];
  other_links: ToolLink[];
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
  onform_links?: ToolLink[];
  sportsbox_links?: ToolLink[];
  superspeed_links?: ToolLink[];
  other_links?: ToolLink[];
  booking_id?: string | null;
};

function linksChanged(a: ToolLink[] = [], b: ToolLink[] = []) {
  if (a.length !== b.length) return true;
  return JSON.stringify(a) !== JSON.stringify(b);
}

async function notifyStudentOfSession(opts: {
  sessionId: string;
  studentUserId: string;
  coachName: string;
  sessionDate: string;
  isNew: boolean;
}) {
  const { sessionId, studentUserId, coachName, sessionDate, isNew } = opts;
  // Resolve auth user_id (student_user_id may be a profile.id for pre-registered)
  const { data: prof } = await supabase
    .from("profiles")
    .select("user_id, display_name, email")
    .or(`user_id.eq.${studentUserId},id.eq.${studentUserId}`)
    .maybeSingle();
  const targetUserId = prof?.user_id ?? null;

  // In-app notification (only if a real auth user exists)
  if (targetUserId) {
    await supabase.from("notifications").insert({
      user_id: targetUserId,
      title: isNew ? "New coaching session added" : "Your coaching session was updated",
      message: `${coachName} ${isNew ? "added" : "updated"} a session for ${sessionDate}.`,
      type: "coaching_session",
      action_url: `/coaching/${sessionId}`,
    });
  }

  // Email
  if (targetUserId || prof?.email) {
    await sendNotificationEmail({
      user_id: targetUserId ?? studentUserId,
      template: "coaching_session_added",
      subject: isNew ? "New coaching session notes from your coach" : "Your coaching session was updated",
      data: {
        display_name: prof?.display_name || undefined,
        coach_name: coachName,
        session_date: sessionDate,
        is_new: isNew,
        session_url: `${window.location.origin}/coaching/${sessionId}`,
      },
    });
  }
}

export function useSaveSession() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: SessionInput) => {
      // Snapshot prior session for change detection
      let prior: any = null;
      if (input.id) {
        const { data } = await supabase
          .from("coaching_sessions")
          .select("*")
          .eq("id", input.id)
          .maybeSingle();
        prior = data;
      }

      let resultId: string;
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase.from("coaching_sessions").update(patch as any).eq("id", id);
        if (error) throw error;
        resultId = id;
      } else {
        const { data, error } = await supabase
          .from("coaching_sessions")
          .insert(input as any)
          .select("id")
          .single();
        if (error) throw error;
        resultId = data.id;
      }

      // Detect meaningful change
      const isNew = !input.id;
      let meaningful = isNew;
      if (!isNew && prior) {
        meaningful =
          (input.progress_summary ?? null) !== (prior.progress_summary ?? null) ||
          (input.notes ?? null) !== (prior.notes ?? null) ||
          (input.drills ?? null) !== (prior.drills ?? null) ||
          linksChanged(input.onform_links ?? [], prior.onform_links ?? []) ||
          linksChanged(input.sportsbox_links ?? [], prior.sportsbox_links ?? []) ||
          linksChanged(input.superspeed_links ?? [], prior.superspeed_links ?? []) ||
          linksChanged(input.other_links ?? [], prior.other_links ?? []);
      }

      if (meaningful) {
        // Fetch coach name
        const { data: coachProf } = await supabase
          .from("profiles")
          .select("display_name, email")
          .eq("user_id", input.coach_user_id)
          .maybeSingle();
        const coachName = coachProf?.display_name || coachProf?.email || "Your coach";
        notifyStudentOfSession({
          sessionId: resultId,
          studentUserId: input.student_user_id,
          coachName,
          sessionDate: input.session_date,
          isNew,
        }).catch((e) => console.warn("[Coaching] notify failed", e));
      }

      return resultId;
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
      // The `trg_coaches_sync_role` trigger automatically grants the `coach` role.
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching", "coaches"] });
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      toast({
        title: "Coach saved",
        description: "Coach role granted automatically.",
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

/* ---------- Coach <-> Student assignment ---------- */
export interface CoachStudentLink {
  id: string;
  coach_id: string;
  student_profile_id: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  student?: { id: string; user_id: string | null; display_name: string | null; email: string | null } | null;
}

async function attachStudentProfilesToLinks(rows: any[]): Promise<CoachStudentLink[]> {
  if (!rows.length) return rows as CoachStudentLink[];
  const ids = Array.from(new Set(rows.map((r) => r.student_profile_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, user_id, display_name, email")
    .in("id", ids);
  const map = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, student: map.get(r.student_profile_id) ?? null })) as CoachStudentLink[];
}

/** All students assigned to a given coach (by coaches.id). */
export function useCoachStudents(coachId: string | undefined) {
  return useQuery({
    queryKey: ["coaching", "coach-students", coachId ?? "none"],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_students")
        .select("*")
        .eq("coach_id", coachId!)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return await attachStudentProfilesToLinks(data ?? []);
    },
  });
}

/** Lookup the active coach assignment for a student (by profile.id). */
export function useStudentCoach(studentProfileId: string | undefined) {
  return useQuery({
    queryKey: ["coaching", "student-coach", studentProfileId ?? "none"],
    enabled: !!studentProfileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_students")
        .select("id, coach_id, notes")
        .eq("student_profile_id", studentProfileId!)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: coach } = await supabase
        .from("coaches")
        .select("id, user_id, city")
        .eq("id", data.coach_id)
        .maybeSingle();
      let coachProfile = null;
      if (coach?.user_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("display_name, email")
          .eq("user_id", coach.user_id)
          .maybeSingle();
        coachProfile = prof;
      }
      return { ...data, coach, coach_profile: coachProfile };
    },
  });
}

export function useAssignStudentToCoach() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { coach_id: string; student_profile_id: string; notes?: string | null }) => {
      // Upsert pattern: deactivate any existing active link for this student, then insert.
      await supabase
        .from("coach_students")
        .update({ is_active: false })
        .eq("student_profile_id", input.student_profile_id)
        .eq("is_active", true);
      const { error } = await supabase.from("coach_students").insert({
        coach_id: input.coach_id,
        student_profile_id: input.student_profile_id,
        notes: input.notes ?? null,
        assigned_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching", "coach-students"] });
      qc.invalidateQueries({ queryKey: ["coaching", "student-coach"] });
      toast({ title: "Student assigned" });
    },
    onError: (e: any) => toast({ title: "Assign failed", description: e.message, variant: "destructive" }),
  });
}

export function useUnassignStudentFromCoach() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from("coach_students").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching", "coach-students"] });
      qc.invalidateQueries({ queryKey: ["coaching", "student-coach"] });
      toast({ title: "Student removed from coach" });
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

/** The coaches row for the currently signed-in user (if any). */
export function useMyCoachRow() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["coaching", "my-coach-row", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaches")
        .select("id, user_id, city, is_active")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Students currently assigned to me (the signed-in coach). */
export function useMyAssignedStudents() {
  const { data: coachRow } = useMyCoachRow();
  return useQuery({
    queryKey: ["coaching", "my-assigned-students", coachRow?.id],
    enabled: !!coachRow?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_students")
        .select("id, student_profile_id")
        .eq("coach_id", coachRow!.id)
        .eq("is_active", true);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.student_profile_id);
      if (!ids.length) return [];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email")
        .in("id", ids);
      if (pErr) throw pErr;
      return (profiles ?? []).map((p: any) => ({
        ...p,
        resolved_id: p.user_id ?? p.id,
        is_registered: !!p.user_id,
      }));
    },
  });
}
