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

/**
 * Award or redeem points through the single authorized database action.
 * The balance change and its history entry commit together; staff may award
 * and redeem for any member, members may only redeem available rewards for
 * themselves at the reward's listed cost. `memberRef` is the member's sign-in
 * id, or the profile id for members registered by staff without a sign-in.
 */
export async function adjustMemberPoints(args: {
  memberRef: string;
  kind: "allocation" | "redemption";
  points: number;
  description?: string;
  rewardId?: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("adjust_member_points", {
    p_member_ref: args.memberRef,
    p_kind: args.kind,
    p_points: args.points,
    p_description: args.description,
    p_reward_id: args.rewardId,
  });
  if (error) throw new Error(error.message);
  const total = (data as { total_points?: number } | null)?.total_points;
  return typeof total === "number" ? total : 0;
}

export function useAllocatePoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      points,
      description,
    }: {
      userId: string;
      points: number;
      description: string;
      adminId?: string;
      isProfileId?: boolean;
    }) => {
      const newTotal = await adjustMemberPoints({ memberRef: userId, kind: "allocation", points, description });

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
          total_points: newTotal,
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
    }: {
      userId: string;
      points: number;
      rewardId?: string;
      rewardName: string;
      adminId?: string;
      isProfileId?: boolean;
    }) => {
      const newTotal = await adjustMemberPoints({
        memberRef: userId,
        kind: "redemption",
        points,
        description: rewardName,
        rewardId,
      });

      // Send notification (non-critical)
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
          total_points: newTotal,
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
