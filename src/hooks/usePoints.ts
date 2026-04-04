import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sendNotificationEmail } from "@/hooks/useNotificationEmail";

export function useUserPoints() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_points", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("points")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data?.points ?? 0;
    },
  });
}

export function usePointsTransactions(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  return useQuery({
    queryKey: ["points_transactions", targetUserId],
    enabled: !!targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("points_transactions")
        .select("*, rewards(name)")
        .eq("user_id", targetUserId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAllocatePoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      points,
      description,
      adminId,
      isProfileId,
    }: {
      userId: string;
      points: number;
      description: string;
      adminId: string;
      isProfileId?: boolean;
    }) => {
      let newTotal: number | null = null;

      if (isProfileId) {
        // Admin-registered user (no auth user_id) — update by profile id directly
        const { data: profile, error: fetchErr } = await supabase
          .from("profiles")
          .select("points")
          .eq("id", userId)
          .single();
        if (fetchErr) throw fetchErr;
        const currentPoints = profile?.points ?? 0;
        newTotal = currentPoints + points;
        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ points: newTotal })
          .eq("id", userId);
        if (updateErr) throw updateErr;
      } else {
        // Normal user — use atomic RPC
        const { data, error: updateErr } = await (supabase as any)
          .rpc("increment_user_points", { p_user_id: userId, p_delta: points });
        if (updateErr) throw updateErr;
        newTotal = data;
      }

      // Log transaction
      const { error: txErr } = await supabase
        .from("points_transactions")
        .insert({
          user_id: userId,
          type: "allocation",
          points,
          description,
          created_by: adminId,
        });
      if (txErr) throw txErr;

      // Send notification (non-critical)
      supabase.from("notifications").insert({
        user_id: userId,
        title: "🎉 Points Awarded",
        message: `You've been awarded ${points} reward points! ${description ? `Reason: ${description}` : ""}`,
        type: "reward",
      }).then(({ error }) => { if (error) console.error("Notification insert failed:", error.message); });

      // Send email notification (non-critical)
      sendNotificationEmail({
        user_id: userId,
        template: "points_earned",
        subject: "🎉 Points Awarded!",
        data: {
          points,
          description,
          total_points: newTotal ?? points,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
      queryClient.invalidateQueries({ queryKey: ["points_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["user_points"] });
    },
  });
}

export function useRedeemPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      points,
      rewardId,
      rewardName,
      adminId,
    }: {
      userId: string;
      points: number;
      rewardId?: string;
      rewardName: string;
      adminId?: string;
    }) => {
      // Atomically decrement points with balance check — DB raises exception if insufficient
      const { data: newTotal, error: updateErr } = await (supabase as any)
        .rpc("decrement_user_points_safe", { p_user_id: userId, p_delta: points });
      if (updateErr) throw new Error(updateErr.message);

      // Log transaction
      const { error: txErr } = await supabase
        .from("points_transactions")
        .insert({
          user_id: userId,
          type: "redemption",
          points,
          description: `Redeemed: ${rewardName}`,
          reward_id: rewardId || null,
          created_by: adminId || userId,
        });
      if (txErr) throw txErr;

      // Send notification (non-critical — errors are logged but don't fail the mutation)
      supabase.from("notifications").insert({
        user_id: userId,
        title: "🎁 Reward Redeemed",
        message: `You redeemed ${points} points for: ${rewardName}`,
        type: "reward",
      }).then(({ error }) => { if (error) console.error("Notification insert failed:", error.message); });

      // Send email notification (non-critical)
      sendNotificationEmail({
        user_id: userId,
        template: "points_redeemed",
        subject: "🎁 Reward Redeemed",
        data: {
          points,
          reward_name: rewardName,
          total_points: newTotal ?? 0,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_all_users"] });
      queryClient.invalidateQueries({ queryKey: ["points_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["user_points"] });
      queryClient.invalidateQueries({ queryKey: ["rewards"] });
    },
  });
}
