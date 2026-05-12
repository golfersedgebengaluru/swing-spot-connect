import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeagueLiteVenue {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LeagueLite {
  id: string;
  name: string | null;
  is_active: boolean;
  show_on_landing: boolean;
  multi_location: boolean;
  allowed_team_sizes: number[];
  price_per_person: number;
  currency: string;
  created_at: string;
  updated_at: string;
  venues?: LeagueLiteVenue[];
}

const LEAGUES_KEY = ["leagues_lite"] as const;
const VENUES_KEY = ["league_lite_venues"] as const;

// ─── Venues ─────────────────────────────────────────────────────────
export function useLeagueLiteVenues(opts?: { onlyActive?: boolean }) {
  return useQuery({
    queryKey: [...VENUES_KEY, opts?.onlyActive ?? false],
    queryFn: async () => {
      let q = supabase.from("league_lite_venues").select("*").order("sort_order").order("name");
      if (opts?.onlyActive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeagueLiteVenue[];
    },
  });
}

export function useUpsertLeagueLiteVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id?: string; name: string; is_active?: boolean; sort_order?: number }) => {
      if (v.id) {
        const { data, error } = await supabase
          .from("league_lite_venues")
          .update({ name: v.name, is_active: v.is_active ?? true, sort_order: v.sort_order ?? 0 })
          .eq("id", v.id)
          .select()
          .single();
        if (error) throw error;
        return data as LeagueLiteVenue;
      }
      const { data, error } = await supabase
        .from("league_lite_venues")
        .insert({ name: v.name, is_active: v.is_active ?? true, sort_order: v.sort_order ?? 0 })
        .select()
        .single();
      if (error) throw error;
      return data as LeagueLiteVenue;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VENUES_KEY });
    },
  });
}

export function useDeleteLeagueLiteVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("league_lite_venues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VENUES_KEY }),
  });
}

// ─── Leagues ────────────────────────────────────────────────────────
export function useLeaguesLite(opts?: { onlyLanding?: boolean }) {
  return useQuery({
    queryKey: [...LEAGUES_KEY, opts?.onlyLanding ?? false],
    queryFn: async () => {
      let q = supabase
        .from("leagues_lite")
        .select("*, leagues_lite_venues(venue_id, league_lite_venues(*))")
        .order("created_at", { ascending: false });
      if (opts?.onlyLanding) q = q.eq("is_active", true).eq("show_on_landing", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        venues: (row.leagues_lite_venues ?? [])
          .map((lv: any) => lv.league_lite_venues)
          .filter(Boolean) as LeagueLiteVenue[],
      })) as LeagueLite[];
    },
  });
}

export interface LeagueLiteInput {
  id?: string;
  name?: string | null;
  is_active: boolean;
  show_on_landing: boolean;
  multi_location: boolean;
  allowed_team_sizes: number[];
  price_per_person: number;
  currency: string;
  venue_ids: string[];
}

export function useUpsertLeagueLite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeagueLiteInput) => {
      const payload = {
        name: input.multi_location ? null : (input.name?.trim() || null),
        is_active: input.is_active,
        show_on_landing: input.show_on_landing,
        multi_location: input.multi_location,
        allowed_team_sizes: input.allowed_team_sizes,
        price_per_person: input.price_per_person,
        currency: input.currency,
      };

      let leagueId = input.id;
      if (leagueId) {
        const { error } = await supabase.from("leagues_lite").update(payload).eq("id", leagueId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("leagues_lite").insert(payload).select("id").single();
        if (error) throw error;
        leagueId = data.id;
      }

      // Reset venue links
      const { error: delErr } = await supabase
        .from("leagues_lite_venues")
        .delete()
        .eq("league_id", leagueId);
      if (delErr) throw delErr;

      if (input.venue_ids.length > 0) {
        const links = input.venue_ids.map((vid) => ({ league_id: leagueId!, venue_id: vid }));
        const { error: insErr } = await supabase.from("leagues_lite_venues").insert(links);
        if (insErr) throw insErr;
      }
      return leagueId!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEAGUES_KEY });
    },
  });
}

export function useDeleteLeagueLite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leagues_lite").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LEAGUES_KEY }),
  });
}

// Pricing-only update used from the Pricing tab card.
export function useUpdateLeagueLitePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; price_per_person: number; currency?: string }) => {
      const update: { price_per_person: number; currency?: string } = {
        price_per_person: v.price_per_person,
      };
      if (v.currency) update.currency = v.currency;
      const { error } = await supabase.from("leagues_lite").update(update).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LEAGUES_KEY }),
  });
}

// Helper: parse a comma-separated team-sizes string into a unique sorted int array.
export function parseTeamSizes(input: string): number[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 20),
    ),
  ).sort((a, b) => a - b);
}
