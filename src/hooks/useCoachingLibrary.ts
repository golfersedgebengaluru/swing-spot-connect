import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  buildSessionRows,
  mapLibraryFocus,
  type LibraryFocus,
  type SessionSelection,
} from "@/lib/coaching-library";

const LIB_KEY = ["coaching-library"];

export interface CategoryRow {
  id: string;
  name: string;
  active: boolean;
}

export interface FocusRow {
  id: string;
  name: string;
  category_id: string | null;
  active: boolean;
  drill_ids: string[];
}

export interface DrillRow {
  id: string;
  name: string;
  category_id: string | null;
  objective: string | null;
  instructions: string | null;
  recommended_reps: string | null;
  video_url: string | null;
  active: boolean;
}

/* ---------- Reads ---------- */

export function useCoachingCategories(activeOnly = false) {
  return useQuery({
    queryKey: [...LIB_KEY, "categories", activeOnly],
    queryFn: async () => {
      let q = supabase.from("coaching_categories").select("id, name, active").order("name");
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });
}

export function useCoachingDrills(activeOnly = false) {
  return useQuery({
    queryKey: [...LIB_KEY, "drills", activeOnly],
    queryFn: async () => {
      let q = supabase
        .from("coaching_drills")
        .select("id, name, category_id, objective, instructions, recommended_reps, video_url, active")
        .order("name");
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DrillRow[];
    },
  });
}

/** Admin view: focuses with their mapped drill ids. */
export function useCoachingFocuses(activeOnly = false) {
  return useQuery({
    queryKey: [...LIB_KEY, "focuses", activeOnly],
    queryFn: async () => {
      let q = supabase
        .from("coaching_focuses")
        .select("id, name, category_id, active, focus_drills(drill_id)")
        .order("name");
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        category_id: r.category_id ?? null,
        active: r.active,
        drill_ids: (r.focus_drills ?? []).map((fd: any) => fd.drill_id),
      })) as FocusRow[];
    },
  });
}

/** Picker view: active focuses with their active drills fully hydrated. */
export function useFocusLibrary() {
  return useQuery({
    queryKey: [...LIB_KEY, "focus-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_focuses")
        .select(
          `id, name, active,
           coaching_categories(name),
           focus_drills(coaching_drills(id, name, objective, instructions, recommended_reps, video_url, active, coaching_categories(name)))`
        )
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map(mapLibraryFocus) as LibraryFocus[];
    },
  });
}

/** Frozen focuses + drills recorded on a session (renders from snapshots). */
export function useSessionLibraryEntries(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["coaching", "session-library", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const [focusRes, drillRes] = await Promise.all([
        supabase
          .from("session_focuses")
          .select("id, focus_id, snapshot")
          .eq("session_id", sessionId!)
          .order("created_at"),
        supabase
          .from("session_drills")
          .select("id, drill_id, focus_id, coach_note, snapshot")
          .eq("session_id", sessionId!)
          .order("created_at"),
      ]);
      if (focusRes.error) throw focusRes.error;
      if (drillRes.error) throw drillRes.error;
      return { focuses: focusRes.data ?? [], drills: drillRes.data ?? [] };
    },
  });
}

/* ---------- Session writes (insert-only) ---------- */

/**
 * Write a session's focus/drill selection once, with frozen snapshots.
 * Never updates or deletes: session history is read-only by design.
 */
export async function persistSessionSelection(
  sessionId: string,
  selection: SessionSelection,
  library: LibraryFocus[]
) {
  const { focusRows, drillRows } = buildSessionRows(sessionId, selection, library);
  if (focusRows.length) {
    const { error } = await supabase.from("session_focuses").insert(focusRows as any);
    if (error) throw error;
  }
  if (drillRows.length) {
    const { error } = await supabase.from("session_drills").insert(drillRows as any);
    if (error) throw error;
  }
  return { focusCount: focusRows.length, drillCount: drillRows.length };
}

/* ---------- Admin mutations ---------- */

function useLibraryMutation<T>(fn: (input: T) => Promise<void>, successTitle: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIB_KEY });
      toast({ title: successTitle });
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
}

export function useSaveCoachingCategory() {
  return useLibraryMutation<{ id?: string; name: string; active?: boolean }>(async (input) => {
    if (input.id) {
      const { id, ...patch } = input;
      const { error } = await supabase.from("coaching_categories").update(patch).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("coaching_categories").insert({ name: input.name });
      if (error) throw error;
    }
  }, "Category saved");
}

export function useSaveCoachingFocus() {
  return useLibraryMutation<{
    id?: string;
    name: string;
    category_id?: string | null;
    active?: boolean;
    drill_ids?: string[];
  }>(async (input) => {
    let focusId = input.id;
    const payload = {
      name: input.name,
      category_id: input.category_id ?? null,
      ...(input.active === undefined ? {} : { active: input.active }),
    };
    if (focusId) {
      const { error } = await supabase.from("coaching_focuses").update(payload).eq("id", focusId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("coaching_focuses")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      focusId = data.id;
    }
    if (input.drill_ids) {
      // Mapping is configuration (not history) so it is fully replaceable.
      const { error: delErr } = await supabase
        .from("focus_drills")
        .delete()
        .eq("focus_id", focusId!);
      if (delErr) throw delErr;
      if (input.drill_ids.length) {
        const { error: insErr } = await supabase
          .from("focus_drills")
          .insert(input.drill_ids.map((drill_id) => ({ focus_id: focusId!, drill_id })));
        if (insErr) throw insErr;
      }
    }
  }, "Focus saved");
}

export function useSaveCoachingDrill() {
  return useLibraryMutation<Partial<DrillRow> & { name: string }>(async (input) => {
    const payload = {
      name: input.name,
      category_id: input.category_id ?? null,
      objective: input.objective ?? null,
      instructions: input.instructions ?? null,
      recommended_reps: input.recommended_reps ?? null,
      video_url: input.video_url ?? null,
      ...(input.active === undefined ? {} : { active: input.active }),
    };
    if (input.id) {
      const { error } = await supabase.from("coaching_drills").update(payload).eq("id", input.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("coaching_drills").insert(payload);
      if (error) throw error;
    }
  }, "Drill saved");
}
