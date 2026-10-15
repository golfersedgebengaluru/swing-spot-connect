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
export function useCorporateAccounts(includeInactive = false, cityFilter?: string | null) {
  return useQuery({
    queryKey: ["corporate_accounts", { includeInactive, cityFilter: cityFilter || null }],
    queryFn: async () => {
      let q = supabase.from("corporate_accounts").select("*").order("name");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      let accounts = (data ?? []) as CorporateAccount[];

      // If a city is selected, restrict to accounts that have activity in that
      // city. The dual-key identity rule lives in the corporate_account_cities
      // view (SQL), so this stays a single small indexed query.
      if (cityFilter) {
        const { data: mapping, error: mapErr } = await supabase
          .from("corporate_account_cities")
          .select("corporate_account_id")
          .eq("city", cityFilter);
        if (mapErr) throw mapErr;
        const corpIds = new Set((mapping ?? []).map((m) => m.corporate_account_id));
        accounts = accounts.filter((a) => corpIds.has(a.id));
      }

      return accounts;
    },
  });
}

// ─── Single ─────────────────────────────────────────
export function useCorporateAccount(id?: string | null) {
  return useQuery({
    queryKey: ["corporate_account", id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("corporate_accounts")
        .select("*")
        .eq("id", id)
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

// Memberships are independent of historical session attribution.
export function useCorporateMembers(corporateAccountId?: string | null) {
  return useQuery({
    queryKey: ["corporate_members", corporateAccountId], enabled: !!corporateAccountId,
    queryFn: async () => {
      if (!corporateAccountId) return [];
      const { data, error } = await supabase.from("corporate_account_members")
        .select("profile:profiles(id,user_id,display_name,email,phone)").eq("corporate_account_id", corporateAccountId);
      if (error) throw error;
      return (data ?? []).flatMap(row => row.profile ? [row.profile] : []);
    },
  });
}

export function useAssignProfileToCorporate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, corporateAccountId, remove = false, accountIds }: {
      profileId: string; corporateAccountId?: string | null; remove?: boolean; accountIds?: string[];
    }) => {
      const { error } = accountIds
        ? await supabase.rpc("set_corporate_memberships", { _profile_id: profileId, _account_ids: accountIds })
        : corporateAccountId
          ? await supabase.rpc("change_corporate_membership", { _profile_id: profileId, _account_id: corporateAccountId, _remove: remove })
          : await supabase.rpc("set_corporate_memberships", { _profile_id: profileId, _account_ids: [] });
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of ["corporate_members", "profile_billing_info", "corporate_accounts", "admin_all_users", "all_users", "profiles", "user-profile-roles"]) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

// ─── Products linked to a corporate account ──────────
// When a city is selected, only that city's rate items (plus global items)
// are offered, so one franchisee never bills using another city's rates.
export function useCorporateProducts(corporateAccountId?: string | null, city?: string | null) {
  return useQuery({
    queryKey: ["corporate_products", corporateAccountId, city || null],
    enabled: !!corporateAccountId,
    queryFn: async () => {
      if (!corporateAccountId) return [];
      let q = supabase
        .from("products_public")
        .select("*")
        .eq("corporate_account_id", corporateAccountId)
        .order("name");
      if (city) q = q.or(`city.eq.${city},city.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}


// ─── Profile lookup (for Manual Booking corporate banner) ──
export function useProfileBillingInfo(profileId?: string | null) {
  return useQuery({
    queryKey: ["profile_billing_info", profileId], enabled: !!profileId,
    queryFn: async () => {
      if (!profileId) return { accounts: [], accountIds: [] };
      const { data, error } = await supabase.from("corporate_account_members")
        .select("corporate_account_id,account:corporate_accounts(*)").eq("profile_id", profileId);
      if (error) throw error;
      return { accountIds: (data ?? []).map(m => m.corporate_account_id), accounts: (data ?? []).flatMap(m => m.account?.is_active ? [m.account as CorporateAccount] : []) };
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
  status: string | null;
  cancelled: boolean;
  billing_status: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
}

/**
 * Returns corporate sessions in the date range across BOTH 'deferred' and
 * 'invoiced' billing statuses. The caller decides which subset to bill
 * (only 'deferred' rows are eligible). This preserves history so that
 * previous months remain visible after an invoice is generated.
 */
export function useDeferredItemsForCorporate(
  corporateAccountId?: string | null,
  startDate?: string,
  endDate?: string,
  city?: string | null
) {
  return useQuery({
    queryKey: ["deferred_items_corporate", corporateAccountId, startDate, endDate, city || null],
    enabled: !!corporateAccountId,
    queryFn: async () => {
      if (!corporateAccountId) return [] as DeferredBookingRow[];
      const { data: members, error: memErr } = await supabase.from("profiles").select("id,user_id,display_name");
      if (memErr) throw memErr;
      const nameByKey = new Map<string, string>();
      for (const m of members ?? []) {
        nameByKey.set(m.id, m.display_name ?? "");
        if (m.user_id) nameByKey.set(m.user_id, m.display_name ?? "");
      }

      const STATUSES = ["deferred", "invoiced"];

      let bq = supabase
        .from("bookings")
        .select("id, user_id, city, start_time, end_time, duration_minutes, session_type, bay_id, status, billing_status, invoice_id")
        .in("billing_status", STATUSES)
        .eq("corporate_account_id", corporateAccountId)
        .order("start_time");
      if (startDate) bq = bq.gte("start_time", startDate);
      if (endDate) bq = bq.lte("start_time", endDate);
      if (city) bq = bq.eq("city", city);
      const { data: bookings, error: bErr } = await bq;
      if (bErr) throw bErr;

      let cq = supabase
        .from("coaching_sessions")
        .select("id, student_user_id, city, session_date, booking_id, billing_status, invoice_id")
        .in("billing_status", STATUSES)
        .eq("corporate_account_id", corporateAccountId)
        .is("booking_id", null)
        .neq("session_type", "self_directed")
        .order("session_date");
      if (startDate) cq = cq.gte("session_date", startDate.slice(0, 10));
      if (endDate) cq = cq.lte("session_date", endDate.slice(0, 10));
      if (city) cq = cq.eq("city", city);
      const { data: coachings, error: cErr } = await cq;
      if (cErr) throw cErr;

      // Bay names
      const bayIds = Array.from(new Set((bookings ?? []).map((b) => b.bay_id).filter(Boolean))) as string[];
      const bayMap = new Map<string, string>();
      if (bayIds.length) {
        const { data: bays } = await supabase.from("bays").select("id, name").in("id", bayIds);
        for (const b of bays ?? []) bayMap.set(b.id, b.name);
      }

      // Invoice numbers
      const invoiceIds = Array.from(new Set([
        ...(bookings ?? []).map((b) => b.invoice_id).filter(Boolean),
        ...(coachings ?? []).map((c) => c.invoice_id).filter(Boolean),
      ])) as string[];
      const invMap = new Map<string, string>();
      if (invoiceIds.length) {
        const { data: invs } = await supabase
          .from("invoices").select("id, invoice_number").in("id", invoiceIds);
        for (const i of invs ?? []) invMap.set(i.id, i.invoice_number);
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
          status: b.status,
          cancelled: b.status === "cancelled",
          billing_status: (b).billing_status ?? null,
          invoice_id: (b).invoice_id ?? null,
          invoice_number: (b).invoice_id ? invMap.get((b).invoice_id) ?? null : null,
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
          status: null,
          cancelled: false,
          billing_status: (c).billing_status ?? null,
          invoice_id: (c).invoice_id ?? null,
          invoice_number: (c).invoice_id ? invMap.get((c).invoice_id) ?? null : null,
        });
      }
      return rows;
    },
  });
}
