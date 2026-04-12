import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Coupon {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  expires_at: string | null;
  max_total_uses: number | null;
  max_uses_per_user: number | null;
  total_used: number;
  is_active: boolean;
  city: string | null;
  created_at: string;
  updated_at: string;
}

export interface CouponRedemption {
  id: string;
  coupon_id: string;
  user_id: string | null;
  session_id: string | null;
  order_id: string | null;
  discount_applied: number;
  created_at: string;
}

export interface ValidateCouponResult {
  valid: boolean;
  coupon_id?: string;
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  code?: string;
  error?: string;
}

// Generate or retrieve a session ID for guest users
let _sessionId: string | null = null;
export function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = localStorage.getItem("coupon_session_id");
    if (!_sessionId) {
      _sessionId = crypto.randomUUID();
      localStorage.setItem("coupon_session_id", _sessionId);
    }
  }
  return _sessionId;
}

// Calculate discount amount given coupon result and order total
export function calculateDiscount(
  result: ValidateCouponResult,
  orderTotal: number
): number {
  if (!result.valid || !result.discount_type || !result.discount_value) return 0;
  if (result.discount_type === "percentage") {
    return Math.round((orderTotal * result.discount_value) / 100 * 100) / 100;
  }
  // Fixed: clamp to order total
  return Math.min(result.discount_value, orderTotal);
}

// Admin hooks
export function useAdminCoupons() {
  return useQuery({
    queryKey: ["admin_coupons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
  });
}

export function useAdminCouponRedemptions(couponId?: string) {
  return useQuery({
    queryKey: ["coupon_redemptions", couponId],
    enabled: !!couponId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupon_redemptions")
        .select("*")
        .eq("coupon_id", couponId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CouponRedemption[];
    },
  });
}

export function useAllCouponRedemptions() {
  return useQuery({
    queryKey: ["all_coupon_redemptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupon_redemptions")
        .select("*, coupons(code, discount_type, discount_value)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Omit<Coupon, "id" | "total_used" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("coupons")
        .insert({
          code: params.code.toUpperCase().trim(),
          discount_type: params.discount_type,
          discount_value: params.discount_value,
          expires_at: params.expires_at || null,
          max_total_uses: params.max_total_uses || null,
          max_uses_per_user: params.max_uses_per_user || null,
          is_active: params.is_active,
          city: params.city || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_coupons"] }),
  });
}

export function useUpdateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...params }: Partial<Coupon> & { id: string }) => {
      const update: any = { ...params };
      if (update.code) update.code = update.code.toUpperCase().trim();
      const { error } = await supabase.from("coupons").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_coupons"] }),
  });
}

export function useDeleteCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_coupons"] }),
  });
}

// Checkout hooks
export function useValidateCoupon() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (code: string): Promise<ValidateCouponResult> => {
      const { data, error } = await supabase.rpc("validate_coupon", {
        p_code: code.trim(),
        p_user_id: user?.id ?? null,
        p_session_id: user ? null : getSessionId(),
      });
      if (error) throw error;
      return data as unknown as ValidateCouponResult;
    },
  });
}

export function useRedeemCoupon() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      coupon_id: string;
      order_id?: string;
      discount_applied: number;
    }) => {
      // Insert redemption record
      const { error: redemptionError } = await supabase
        .from("coupon_redemptions")
        .insert({
          coupon_id: params.coupon_id,
          user_id: user?.id ?? null,
          session_id: user ? null : getSessionId(),
          order_id: params.order_id ?? null,
          discount_applied: params.discount_applied,
        });
      if (redemptionError) throw redemptionError;

      // Increment total_used on coupon
      // Use a raw RPC or just re-fetch; simplest: read + update
      const { data: coupon } = await supabase
        .from("coupons")
        .select("total_used")
        .eq("id", params.coupon_id)
        .single();
      if (coupon) {
        await supabase
          .from("coupons")
          .update({ total_used: coupon.total_used + 1 })
          .eq("id", params.coupon_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_coupons"] });
      qc.invalidateQueries({ queryKey: ["coupon_redemptions"] });
      qc.invalidateQueries({ queryKey: ["all_coupon_redemptions"] });
    },
  });
}
