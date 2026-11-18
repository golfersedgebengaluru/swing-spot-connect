import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabase-paging";
import type { MembershipTerm } from "@/lib/membership-recognition";
import type { Database } from "@/integrations/supabase/types";

export type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];

const TERM_COLUMNS =
  "id, user_id, city, label, product_id, revenue_transaction_id, refund_transaction_id, invoice_line_item_id, sold_on, amount, starts_on, ends_on, status, cancelled_on, refund_amount";

/**
 * Every membership that can affect a report ending on `toDay`: sold by then and not voided.
 * Used by the revenue report, dashboard and P&L so they spread memberships the same way.
 */
export async function fetchMembershipTerms(toDay: string, city?: string): Promise<MembershipTerm[]> {
  return fetchAllPaged<MembershipTerm>((from, to) => {
    let q = supabase
      .from("memberships")
      .select(TERM_COLUMNS)
      .neq("status", "void")
      .lte("sold_on", toDay)
      .order("sold_on", { ascending: true })
      .order("id", { ascending: true });
    if (city) q = q.eq("city", city);
    return q.range(from, to);
  });
}

/** A customer's memberships, newest first. `keys` are the customer's sign-in id and/or profile id. */
export function useCustomerMemberships(keys: (string | null | undefined)[]) {
  const ids = [...new Set(keys.filter(Boolean) as string[])];
  return useQuery({
    queryKey: ["memberships", "customer", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("*")
        .in("user_id", ids)
        .order("sold_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface CancelMembershipInput {
  membershipId: string;
  cancelledOn: string;
  refundAmount: number;
  refundMethod?: string;
  note?: string;
}

export function useCancelMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CancelMembershipInput) => {
      const { data, error } = await supabase.rpc("cancel_membership", {
        p_membership_id: input.membershipId,
        p_cancelled_on: input.cancelledOn,
        p_refund_amount: input.refundAmount,
        p_refund_method: input.refundMethod ?? "",
        p_note: input.note ?? "",
      });
      if (error) throw error;
      return data as { success: boolean; already_cancelled: boolean; refund_amount: number; credit_note_number?: string | null; hours_removed?: number };
    },
    onSuccess: () => {
      for (const key of ["memberships", "invoices", "revenue_transactions", "revenue_summary", "member_hours", "hours_transactions", "admin-dashboard-stats", "revenue_for_pl", "admin_all_users"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
