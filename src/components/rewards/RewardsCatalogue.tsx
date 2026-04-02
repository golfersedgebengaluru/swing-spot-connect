import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, Loader2, Lock } from "lucide-react";
import { useRewards } from "@/hooks/useRewards";
import { useRedeemPoints } from "@/hooks/usePoints";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface RewardsCatalogueProps {
  currentPoints: number;
  usagePercentage?: number;
}

export function RewardsCatalogue({ currentPoints, usagePercentage = 100 }: RewardsCatalogueProps) {
  const { user } = useAuth();
  const { data: rewards, isLoading } = useRewards();
  const redeemPoints = useRedeemPoints();
  const { toast } = useToast();

  const handleRedeem = async (reward: any) => {
    if (!user) return;
    try {
      await redeemPoints.mutateAsync({
        userId: user.id,
        points: reward.points_cost,
        rewardId: reward.id,
        rewardName: reward.name,
      });
      toast({ title: "🎁 Reward Redeemed!", description: `You redeemed "${reward.name}" for ${reward.points_cost} points.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-elegant">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-xl">
          <Gift className="h-5 w-5 text-primary" />
          Redeem Rewards
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {(rewards ?? []).map((reward) => {
            const gatePercent = reward.usage_gate_percentage ?? 0;
            const isGated = gatePercent > 0 && usagePercentage < gatePercent;
            const canAfford = currentPoints >= reward.points_cost;
            const canRedeem = reward.is_available && canAfford && !isGated;

            return (
              <div
                key={reward.id}
                className={`rounded-xl border p-4 transition-all ${
                  canRedeem
                    ? "border-primary/20 bg-primary/5 hover:border-primary/40"
                    : "border-border opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground">{reward.name}</h4>
                    {reward.description && (
                      <div
                        className="text-sm text-muted-foreground prose prose-sm prose-neutral dark:prose-invert max-w-none prose-p:my-0 mt-1"
                        dangerouslySetInnerHTML={{ __html: reward.description }}
                      />
                    )}
                  </div>
                  <Badge variant={canAfford ? "default" : "secondary"} className="ml-2 shrink-0">
                    {reward.points_cost} pts
                  </Badge>
                </div>
                {isGated && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    Use {gatePercent}% of plan hours to unlock
                  </div>
                )}
                {reward.redemption_cap_per_day && (
                  <p className="mt-1 text-xs text-muted-foreground">Limit: {reward.redemption_cap_per_day}/day</p>
                )}
                <Button
                  className="mt-3 w-full"
                  size="sm"
                  disabled={!canRedeem || redeemPoints.isPending}
                  onClick={() => handleRedeem(reward)}
                >
                  {redeemPoints.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isGated ? "Locked" : canAfford ? "Redeem" : "Not enough points"}
                </Button>
              </div>
            );
          })}
          {(rewards ?? []).length === 0 && (
            <p className="col-span-2 py-8 text-center text-sm text-muted-foreground">No rewards available yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
