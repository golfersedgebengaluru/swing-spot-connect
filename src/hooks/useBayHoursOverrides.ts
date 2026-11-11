import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BayHoursOverrideRow {
  id: string;
  bay_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
}

export interface BayHoursOverrideInput {
  bay_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
}

/** Saves one weekday's hours for a bay (replaces any earlier entry for that day). */
export async function saveBayHoursOverride(params: BayHoursOverrideInput): Promise<void> {
  const { data, error } = await supabase
    .from("bay_hours_overrides")
    .upsert(params, { onConflict: "bay_id,day_of_week" })
    .select("id");
  if (error) throw error;
  // A write blocked by permissions returns no row and no error; never report it as saved.
  if (!data || data.length === 0) throw new Error("You don't have permission to change this bay's hours.");
}

export function useBayHoursOverrides(bayId?: string) {
  return useQuery({
    queryKey: ["bay_hours_overrides", bayId],
    enabled: !!bayId,
    queryFn: async (): Promise<BayHoursOverrideRow[]> => {
      const { data, error } = await supabase
        .from("bay_hours_overrides")
        .select("id, bay_id, day_of_week, open_time, close_time")
        .eq("bay_id", bayId!)
        .order("day_of_week");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertBayHoursOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveBayHoursOverride,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bay_hours_overrides"] });
      qc.invalidateQueries({ queryKey: ["bays"] });
    },
  });
}

export function useDeleteBayHoursOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bay_hours_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bay_hours_overrides"] });
      qc.invalidateQueries({ queryKey: ["bays"] });
    },
  });
}
