import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CorporateAccount {
  id: string;
  name: string;
  nickname: string | null;
  gstin: string | null;
  billing_email: string | null;
  billing_address: string | null;
  state: string | null;
  state_code: string | null;
  billing_cycle_day: number;
  payment_terms_days: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CorporateAccountInput = Partial<Omit<CorporateAccount, "id" | "created_at" | "updated_at">> & {
  name: string;
};

// ─── List ───────────────────────────────────────────
export function useCorporateAccounts(includeInactive = false) {
  return useQuery({
    queryKey: ["corporate_accounts", { includeInactive }],
    queryFn: async () => {
      let q = supabase.from("corporate_accounts").select("*").order("name");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CorporateAccount[];
    },
  });
}

// ─── Single ─────────────────────────────────────────
export function useCorporateAccount(id?: string | null) {
  return useQuery({
    queryKey: ["corporate_account", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corporate_accounts")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CorporateAccount | null;
    },
  });
}

// ─── Mutations ──────────────────────────────────────
export function useUpsertCorporateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CorporateAccountInput & { id?: string }) => {
      const payload = {
        name: input.name,
        nickname: input.nickname ?? null,
        gstin: input.gstin ?? null,
        billing_email: input.billing_email ?? null,
        billing_address: input.billing_address ?? null,
        state: input.state ?? null,
        state_code: input.state_code ?? null,
        billing_cycle_day: input.billing_cycle_day ?? 1,
        payment_terms_days: input.payment_terms_days ?? 15,
        notes: input.notes ?? null,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("corporate_accounts")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data as CorporateAccount;
      }
      const { data, error } = await supabase
        .from("corporate_accounts")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CorporateAccount;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["corporate_accounts"] });
      qc.invalidateQueries({ queryKey: ["corporate_account"] });
    },
  });
}

export function useDeleteCorporateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("corporate_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["corporate_accounts"] }),
  });
}

// ─── Members of a corporate account ─────────────────
export function useCorporateMembers(corporateAccountId?: string | null) {
  return useQuery({
    queryKey: ["corporate_members", corporateAccountId],
    enabled: !!corporateAccountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email, phone, billing_mode")
        .eq("corporate_account_id", corporateAccountId!)
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAssignProfileToCorporate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      corporateAccountId,
    }: {
      profileId: string;
      corporateAccountId: string | null;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          corporate_account_id: corporateAccountId,
          billing_mode: corporateAccountId ? "monthly_consolidated" : "standard",
        })
        .eq("id", profileId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["corporate_members"] });
      qc.invalidateQueries({ queryKey: ["all_users"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["user-profile-roles"] });
    },
  });
}

// ─── Products linked to a corporate account ──────────
export function useCorporateProducts(corporateAccountId?: string | null) {
  return useQuery({
    queryKey: ["corporate_products", corporateAccountId],
    enabled: !!corporateAccountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("corporate_account_id", corporateAccountId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Profile lookup (for Manual Booking corporate banner) ──
export function useProfileBillingInfo(profileId?: string | null) {
  return useQuery({
    queryKey: ["profile_billing_info", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, billing_mode, corporate_account_id")
        .eq("id", profileId!)
        .maybeSingle();
      if (error) throw error;
      if (!profile?.corporate_account_id) {
        return { billing_mode: profile?.billing_mode ?? "standard", corporate: null };
      }
      const { data: corp } = await supabase
        .from("corporate_accounts")
        .select("*")
        .eq("id", profile.corporate_account_id)
        .maybeSingle();
      return {
        billing_mode: profile.billing_mode,
        corporate: (corp ?? null) as CorporateAccount | null,
      };
    },
  });
}

// ─── Deferred items pending invoicing ───────────────
export interface DeferredBookingRow {
  kind: "booking" | "coaching";
  id: string;
  user_id: string;
  user_name: string | null;
  city: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  bay_name: string | null;
  session_type: string | null;
}

export function useDeferredItemsForCorporate(
  corporateAccountId?: string | null,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: ["deferred_items_corporate", corporateAccountId, startDate, endDate],
    enabled: !!corporateAccountId,
    queryFn: async () => {
      // 1. Get member profile ids/user_ids of this corporate account
      const { data: members, error: memErr } = await supabase
        .from("profiles")
        .select("id, user_id, display_name")
        .eq("corporate_account_id", corporateAccountId!);
      if (memErr) throw memErr;
      const memberIds = new Set<string>();
      const nameByKey = new Map<string, string>();
      for (const m of members ?? []) {
        if (m.id) {
          memberIds.add(m.id);
          nameByKey.set(m.id, m.display_name ?? "");
        }
        if (m.user_id) {
          memberIds.add(m.user_id);
          nameByKey.set(m.user_id, m.display_name ?? "");
        }
      }
      const idList = Array.from(memberIds);
      if (idList.length === 0) return [] as DeferredBookingRow[];

      // 2. Fetch deferred bookings
      let bq = supabase
        .from("bookings")
        .select("id, user_id, city, start_time, end_time, duration_minutes, session_type, bay_id, status")
        .eq("billing_status", "deferred")
        .in("user_id", idList)
        .neq("status", "cancelled")
        .order("start_time");
      if (startDate) bq = bq.gte("start_time", startDate);
      if (endDate) bq = bq.lte("start_time", endDate);
      const { data: bookings, error: bErr } = await bq;
      if (bErr) throw bErr;

      // 3. Fetch deferred coaching sessions
      let cq = supabase
        .from("coaching_sessions")
        .select("id, student_user_id, city, session_date, booking_id")
        .eq("billing_status", "deferred")
        .in("student_user_id", idList)
        .order("session_date");
      if (startDate) cq = cq.gte("session_date", startDate.slice(0, 10));
      if (endDate) cq = cq.lte("session_date", endDate.slice(0, 10));
      const { data: coachings, error: cErr } = await cq;
      if (cErr) throw cErr;

      // 4. Bay name lookup
      const bayIds = Array.from(new Set((bookings ?? []).map((b) => b.bay_id).filter(Boolean))) as string[];
      const bayMap = new Map<string, string>();
      if (bayIds.length) {
        const { data: bays } = await supabase.from("bays").select("id, name").in("id", bayIds);
        for (const b of bays ?? []) bayMap.set(b.id, b.name);
      }

      const rows: DeferredBookingRow[] = [];
      for (const b of bookings ?? []) {
        rows.push({
          kind: "booking",
          id: b.id,
          user_id: b.user_id,
          user_name: nameByKey.get(b.user_id) ?? null,
          city: b.city,
          start_time: b.start_time,
          end_time: b.end_time,
          duration_minutes: b.duration_minutes,
          bay_name: b.bay_id ? bayMap.get(b.bay_id) ?? null : null,
          session_type: b.session_type,
        });
      }
      for (const c of coachings ?? []) {
        rows.push({
          kind: "coaching",
          id: c.id,
          user_id: c.student_user_id,
          user_name: nameByKey.get(c.student_user_id) ?? null,
          city: c.city,
          start_time: c.session_date,
          end_time: null,
          duration_minutes: null,
          bay_name: null,
          session_type: "coaching",
        });
      }
      return rows;
    },
  });
}
