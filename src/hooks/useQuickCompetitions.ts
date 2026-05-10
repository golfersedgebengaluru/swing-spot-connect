import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type QuickCompetition = {
  id: string;
  tenant_id: string;
  name: string;
  unit: "m" | "yd";
  max_attempts: number;
  status: "active" | "completed";
  sponsor_enabled: boolean;
  sponsor_logo_url: string | null;
  longest_winner_player_id: string | null;
  longest_winner_value: number | null;
  straightest_winner_player_id: string | null;
  straightest_winner_value: number | null;
  longest_card_url: string | null;
  straightest_card_url: string | null;
  entry_type: "free" | "paid";
  entry_fee: number | null;
  entry_currency: string;
  refunds_allowed: boolean;
  created_at: string;
  completed_at: string | null;
  categories_enabled: boolean;
  category_winners: unknown;
};

export type QCCategoryWinner = {
  category_id: string;
  name: string;
  longest: { player_id: string; player_name: string; value: number; card_url: string | null } | null;
  straightest: { player_id: string; player_name: string; value: number; card_url: string | null } | null;
};
export type QCCategoryWinners = QCCategoryWinner[];

export type QCCategory = {
  id: string;
  competition_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type QCEntry = {
  id: string;
  competition_id: string;
  player_id: string | null;
  player_name: string;
  phone: string;
  amount: number;
  currency: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  status: "pending" | "paid" | "refunded" | "failed";
  refund_id: string | null;
  refunded_at: string | null;
  created_at: string;
};

export type QCPlayer = { id: string; competition_id: string; name: string; created_at: string; category_id: string | null };
export type QCAttempt = {
  id: string;
  competition_id: string;
  player_id: string;
  distance: number;
  offline: number;
  created_at: string;
};

export function useQuickCompetitions(tenantId: string | null) {
  return useQuery({
    queryKey: ["quick-comps", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_competitions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuickCompetition[];
    },
  });
}

export function useQuickCompetition(competitionId: string | null) {
  return useQuery({
    queryKey: ["quick-comp", competitionId],
    enabled: !!competitionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_competitions")
        .select("*")
        .eq("id", competitionId!)
        .maybeSingle();
      if (error) throw error;
      return data as QuickCompetition | null;
    },
  });
}

export function useQCPlayers(competitionId: string | null) {
  return useQuery({
    queryKey: ["qc-players", competitionId],
    enabled: !!competitionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_competition_players")
        .select("*")
        .eq("competition_id", competitionId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QCPlayer[];
    },
  });
}

export function useQCAttempts(competitionId: string | null) {
  return useQuery({
    queryKey: ["qc-attempts", competitionId],
    enabled: !!competitionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_competition_attempts")
        .select("*")
        .eq("competition_id", competitionId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QCAttempt[];
    },
  });
}

/** Live updates for players + attempts. */
export function useQCRealtime(competitionId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!competitionId) return;
    const channel = supabase
      .channel(`qc-${competitionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quick_competition_players", filter: `competition_id=eq.${competitionId}` }, () => {
        qc.invalidateQueries({ queryKey: ["qc-players", competitionId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quick_competition_attempts", filter: `competition_id=eq.${competitionId}` }, () => {
        qc.invalidateQueries({ queryKey: ["qc-attempts", competitionId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quick_competition_categories", filter: `competition_id=eq.${competitionId}` }, () => {
        qc.invalidateQueries({ queryKey: ["qc-categories", competitionId] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quick_competitions", filter: `id=eq.${competitionId}` }, () => {
        qc.invalidateQueries({ queryKey: ["quick-comp", competitionId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [competitionId, qc]);
}

async function audit(competitionId: string, action: string, details?: Record<string, unknown>) {
  const { data: u } = await supabase.auth.getUser();
  await supabase.from("quick_competition_audit").insert([{
    competition_id: competitionId,
    actor_id: u.user?.id ?? null,
    action,
    details: (details ?? {}) as never,
  }]);
}

export function useCreateQuickCompetition() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      tenant_id: string;
      name: string;
      unit: "m" | "yd";
      max_attempts: number;
      sponsor_enabled: boolean;
      sponsor_logo_file?: File | null;
      entry_type: "free" | "paid";
      entry_fee?: number | null;
      entry_currency?: string;
      refunds_allowed?: boolean;
    }) => {
      let sponsor_logo_url: string | null = null;
      if (input.sponsor_enabled && input.sponsor_logo_file) {
        const ext = input.sponsor_logo_file.name.split(".").pop() || "png";
        const path = `logos/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("quick-comp-sponsors")
          .upload(path, input.sponsor_logo_file, { upsert: false });
        if (upErr) throw upErr;
        sponsor_logo_url = supabase.storage.from("quick-comp-sponsors").getPublicUrl(path).data.publicUrl;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("quick_competitions")
        .insert({
          tenant_id: input.tenant_id,
          name: input.name,
          unit: input.unit,
          max_attempts: input.max_attempts,
          sponsor_enabled: input.sponsor_enabled,
          sponsor_logo_url,
          entry_type: input.entry_type,
          entry_fee: input.entry_type === "paid" ? input.entry_fee ?? null : null,
          entry_currency: input.entry_currency || "INR",
          refunds_allowed: input.refunds_allowed ?? false,
          created_by: u.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      await audit(data.id, "create", { name: input.name, unit: input.unit, max_attempts: input.max_attempts, entry_type: input.entry_type, entry_fee: input.entry_fee ?? null });
      return data as QuickCompetition;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["quick-comps", d.tenant_id] });
      toast({ title: "Quick competition started" });
    },
    onError: (e: Error) => toast({ title: "Could not start", description: e.message, variant: "destructive" }),
  });
}

export function useAddPlayer(competitionId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { name: string; category_id?: string | null }) => {
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error("Name required");
      const { data, error } = await supabase
        .from("quick_competition_players")
        .insert({ competition_id: competitionId, name: trimmed, category_id: input.category_id ?? null })
        .select()
        .single();
      if (error) throw error;
      await audit(competitionId, "add_player", { player_id: data.id, name: trimmed, category_id: input.category_id ?? null });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qc-players", competitionId] }),
    onError: (e: Error) => toast({ title: "Could not add player", description: e.message, variant: "destructive" }),
  });
}

export function useUpdatePlayerCategory(competitionId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { player_id: string; category_id: string | null }) => {
      const { error } = await supabase
        .from("quick_competition_players")
        .update({ category_id: input.category_id })
        .eq("id", input.player_id);
      if (error) throw error;
      await audit(competitionId, "set_player_category", input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qc-players", competitionId] }),
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
}

export function useQCCategories(competitionId: string | null) {
  return useQuery({
    queryKey: ["qc-categories", competitionId],
    enabled: !!competitionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_competition_categories")
        .select("*")
        .eq("competition_id", competitionId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QCCategory[];
    },
  });
}

export function useAddCategory(competitionId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { name: string; sort_order?: number }) => {
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error("Name required");
      const { data, error } = await supabase
        .from("quick_competition_categories")
        .insert({ competition_id: competitionId, name: trimmed, sort_order: input.sort_order ?? 0 })
        .select()
        .single();
      if (error) throw error;
      await audit(competitionId, "add_category", { category_id: data.id, name: trimmed });
      return data as QCCategory;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qc-categories", competitionId] }),
    onError: (e: Error) => toast({ title: "Could not add category", description: e.message, variant: "destructive" }),
  });
}

export function useRenameCategory(competitionId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { category_id: string; name: string }) => {
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error("Name required");
      const { error } = await supabase
        .from("quick_competition_categories")
        .update({ name: trimmed })
        .eq("id", input.category_id);
      if (error) throw error;
      await audit(competitionId, "rename_category", input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qc-categories", competitionId] }),
    onError: (e: Error) => toast({ title: "Rename failed", description: e.message, variant: "destructive" }),
  });
}

export function useRemoveCategory(competitionId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase
        .from("quick_competition_categories")
        .delete()
        .eq("id", categoryId);
      if (error) throw error;
      await audit(competitionId, "remove_category", { category_id: categoryId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qc-categories", competitionId] });
      qc.invalidateQueries({ queryKey: ["qc-players", competitionId] });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });
}

export function useToggleCategoriesEnabled(competitionId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("quick_competitions")
        .update({ categories_enabled: enabled })
        .eq("id", competitionId);
      if (error) throw error;
      await audit(competitionId, "toggle_categories", { enabled });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick-comp", competitionId] }),
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
}

export function useRemovePlayer(competitionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (playerId: string) => {
      const { error } = await supabase.from("quick_competition_players").delete().eq("id", playerId);
      if (error) throw error;
      await audit(competitionId, "remove_player", { player_id: playerId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qc-players", competitionId] });
      qc.invalidateQueries({ queryKey: ["qc-attempts", competitionId] });
    },
  });
}

export function useSaveAttempt(competitionId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { player_id: string; distance: number; offline: number }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("quick_competition_attempts")
        .insert({
          competition_id: competitionId,
          player_id: input.player_id,
          distance: input.distance,
          offline: input.offline,
          created_by: u.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      await audit(competitionId, "save_attempt", { player_id: input.player_id, distance: input.distance, offline: input.offline });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qc-attempts", competitionId] }),
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteAttempt(competitionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attemptId: string) => {
      const { error } = await supabase.from("quick_competition_attempts").delete().eq("id", attemptId);
      if (error) throw error;
      await audit(competitionId, "delete_attempt", { attempt_id: attemptId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qc-attempts", competitionId] }),
  });
}

export function useUpdateQuickCompetition() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      competition_id: string;
      name?: string;
      sponsor_enabled?: boolean;
      sponsor_logo_file?: File | null;
      remove_sponsor_logo?: boolean;
    }) => {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.sponsor_enabled !== undefined) patch.sponsor_enabled = input.sponsor_enabled;
      if (input.remove_sponsor_logo) patch.sponsor_logo_url = null;
      if (input.sponsor_logo_file) {
        const ext = input.sponsor_logo_file.name.split(".").pop() || "png";
        const path = `logos/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("quick-comp-sponsors")
          .upload(path, input.sponsor_logo_file, { upsert: false });
        if (upErr) throw upErr;
        patch.sponsor_logo_url = supabase.storage.from("quick-comp-sponsors").getPublicUrl(path).data.publicUrl;
        patch.sponsor_enabled = true;
      }
      const { data, error } = await supabase
        .from("quick_competitions")
        .update(patch)
        .eq("id", input.competition_id)
        .select()
        .single();
      if (error) throw error;
      await audit(input.competition_id, "update", patch);
      return data as QuickCompetition;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["quick-comp", d.id] });
      qc.invalidateQueries({ queryKey: ["quick-comps", d.tenant_id] });
      toast({ title: "Competition updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteQuickCompetition() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { competition_id: string; tenant_id: string }) => {
      const { error } = await supabase.from("quick_competitions").delete().eq("id", input.competition_id);
      if (error) throw error;
      return input;
    },
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ["quick-comps", i.tenant_id] });
      toast({ title: "Competition deleted" });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });
}

export function useEndQuickCompetition() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (competitionId: string) => {
      const { data, error } = await supabase.functions.invoke("quick-competition-end", {
        body: { competition_id: competitionId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to end competition");
      return data.competition as QuickCompetition;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["quick-comp", d.id] });
      qc.invalidateQueries({ queryKey: ["quick-comps", d.tenant_id] });
      toast({ title: "Competition ended", description: "Winner cards generated." });
    },
    onError: (e: Error) => toast({ title: "Could not end", description: e.message, variant: "destructive" }),
  });
}

export function useQCEntries(competitionId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!competitionId) return;
    const ch = supabase
      .channel(`qc-entries-${competitionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "qc_entries", filter: `competition_id=eq.${competitionId}` }, () => {
        qc.invalidateQueries({ queryKey: ["qc-entries", competitionId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [competitionId, qc]);
  return useQuery({
    queryKey: ["qc-entries", competitionId],
    enabled: !!competitionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qc_entries").select("*")
        .eq("competition_id", competitionId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QCEntry[];
    },
  });
}

export function useRefundQCEntry(competitionId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await supabase.functions.invoke("qc-refund-entry", {
        body: { entry_id: entryId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Refund failed");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qc-entries", competitionId] });
      qc.invalidateQueries({ queryKey: ["qc-players", competitionId] });
      toast({ title: "Refund issued" });
    },
    onError: (e: Error) => toast({ title: "Refund failed", description: e.message, variant: "destructive" }),
  });
}

/** Compute leaderboards from attempts. Tie-break: earliest qualifying attempt. */
export function buildLeaderboards(players: QCPlayer[], attempts: QCAttempt[]) {
  type Row = { player_id: string; name: string; value: number; ts: string; attempts: number };
  const longest = new Map<string, Row>();
  const straight = new Map<string, Row>();
  const playerName = new Map(players.map((p) => [p.id, p.name]));
  const counts = new Map<string, number>();
  for (const a of attempts) {
    counts.set(a.player_id, (counts.get(a.player_id) ?? 0) + 1);
    const name = playerName.get(a.player_id) ?? "—";
    const dist = Number(a.distance);
    const off = Number(a.offline);
    const lc = longest.get(a.player_id);
    if (!lc || dist > lc.value) {
      longest.set(a.player_id, { player_id: a.player_id, name, value: dist, ts: a.created_at, attempts: 0 });
    }
    const sc = straight.get(a.player_id);
    if (!sc || off < sc.value) {
      straight.set(a.player_id, { player_id: a.player_id, name, value: off, ts: a.created_at, attempts: 0 });
    }
  }
  const longestArr = [...longest.values()]
    .map((r) => ({ ...r, attempts: counts.get(r.player_id) ?? 0 }))
    .sort((a, b) => b.value - a.value || a.ts.localeCompare(b.ts));
  const straightArr = [...straight.values()]
    .map((r) => ({ ...r, attempts: counts.get(r.player_id) ?? 0 }))
    .sort((a, b) => a.value - b.value || a.ts.localeCompare(b.ts));
  return { longest: longestArr, straightest: straightArr };
}
