import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Gift, Star, Trophy, Users, ShoppingBag, Calendar, Check, Loader2, MinusCircle, PlusCircle } from "lucide-react";
import { useRewards, useEarnMethods } from "@/hooks/useRewards";
import { useUserPoints, usePointsTransactions, useRedeemPoints } from "@/hooks/usePoints";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const iconMap: Record<string, any> = {
  calendar: Calendar,
  "shopping-bag": ShoppingBag,
  users: Users,
  trophy: Trophy,
  star: Star,
};

const tierThresholds = [
  { name: "Bronze", min: 0, next: 1000 },
  { name: "Silver", min: 1000, next: 5000 },
  { name: "Gold", min: 5000, next: 10000 },
  { name: "Platinum", min: 10000, next: 25000 },
];

function getTier(points: number) {
  for (let i = tierThresholds.length - 1; i >= 0; i--) {
    if (points >= tierThresholds[i].min) return tierThresholds[i];
  }
  return tierThresholds[0];
}

export default function Rewards() {
  const { user } = useAuth();
  const { data: rewards, isLoading: loadingRewards } = useRewards();
  const { data: earnMethods, isLoading: loadingEarn } = useEarnMethods();
  const { data: currentPoints = 0, isLoading: loadingPoints } = useUserPoints();
  const { data: transactions, isLoading: loadingTx } = usePointsTransactions();
  const redeemPoints = useRedeemPoints();
  const { toast } = useToast();

  const tier = getTier(currentPoints);
  const nextTierName = tierThresholds[tierThresholds.indexOf(tier) + 1]?.name ?? "Max";
  const progressToNext = tier.next > tier.min ? ((currentPoints - tier.min) / (tier.next - tier.min)) * 100 : 100;
  const isLoading = loadingRewards || loadingEarn || loadingPoints;

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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">Rewards</h1>
            <p className="mt-1 text-muted-foreground">Earn points and redeem exclusive perks</p>
          </div>

          {/* Points Card */}
          <Card className="mb-8 overflow-hidden bg-gradient-hero shadow-lg">
            <CardContent className="p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-accent" />
                    <span className="font-medium text-primary-foreground/80">{tier.name} Member</span>
                  </div>
                  <p className="mt-2 font-display text-5xl font-bold text-primary-foreground">
                    {loadingPoints ? "..." : currentPoints.toLocaleString()}
                  </p>
                  <p className="text-primary-foreground/70">Available Points</p>
                </div>
                <div className="md:text-right">
                  <p className="text-sm text-primary-foreground/70">{tier.next - currentPoints > 0 ? `${tier.next - currentPoints} points to ${nextTierName} tier` : "Max tier reached!"}</p>
                  <Progress value={Math.min(progressToNext, 100)} className="mt-2 h-3 w-64 bg-primary-foreground/20" />
                  <p className="mt-1 text-xs text-primary-foreground/60">{currentPoints.toLocaleString()} / {tier.next.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Card className="shadow-elegant">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-display text-xl">
                      <Gift className="h-5 w-5 text-primary" />
                      Available Rewards
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {(rewards ?? []).map((reward) => (
                        <div
                          key={reward.id}
                          className={`rounded-xl border p-4 transition-all ${
                            reward.is_available && currentPoints >= reward.points_cost
                              ? "border-primary/20 bg-primary/5 hover:border-primary/40"
                              : "border-border opacity-60"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium text-foreground">{reward.name}</h4>
                              {reward.description && <div className="text-sm text-muted-foreground prose prose-sm prose-neutral dark:prose-invert max-w-none prose-p:my-0" dangerouslySetInnerHTML={{ __html: reward.description }} />}
                            </div>
                            <Badge variant={currentPoints >= reward.points_cost ? "default" : "secondary"}>
                              {reward.points_cost} pts
                            </Badge>
                          </div>
                          <Button
                            className="mt-3 w-full"
                            size="sm"
                            disabled={!reward.is_available || currentPoints < reward.points_cost || redeemPoints.isPending}
                            onClick={() => handleRedeem(reward)}
                          >
                            {redeemPoints.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {currentPoints >= reward.points_cost ? "Redeem" : "Not enough points"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="mt-6 shadow-elegant">
                  <CardHeader>
                    <CardTitle className="font-display text-xl">How to Earn Points</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {(earnMethods ?? []).map((method) => {
                        const IconComp = iconMap[method.icon] || Star;
                        return (
                          <div key={method.id} className="flex items-center gap-4 rounded-xl border border-border p-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                              <IconComp className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{method.method}</p>
                              <p className="text-sm text-muted-foreground">{method.description}</p>
                            </div>
                            <Badge variant="outline" className="ml-auto">{method.points_label}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Card className="shadow-elegant">
                  <CardHeader>
                    <CardTitle className="font-display text-xl">Points History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingTx ? (
                      <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                    ) : !transactions?.length ? (
                      <p className="text-sm text-muted-foreground">No activity yet</p>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {transactions.map((t: any) => (
                          <div key={t.id} className="flex items-start justify-between rounded-lg border border-border p-3">
                            <div className="flex items-start gap-2">
                              {t.type === "redemption" ? (
                                <MinusCircle className="mt-0.5 h-4 w-4 text-destructive" />
                              ) : (
                                <PlusCircle className="mt-0.5 h-4 w-4 text-primary" />
                              )}
                              <div>
                                <p className="text-sm font-medium capitalize">{t.type}</p>
                                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                                <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <span className={`text-sm font-medium ${t.type === "redemption" ? "text-destructive" : "text-primary"}`}>
                              {t.type === "redemption" ? "-" : "+"}{t.points}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="mt-6 shadow-elegant">
                  <CardHeader>
                    <CardTitle className="font-display text-xl">{tier.name} Benefits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {["Earn 1 point per $1 spent", "Birthday reward bonus", "Early event registration", "10% off private lessons"].map((benefit) => (
                        <li key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Check className="h-4 w-4 text-primary" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
