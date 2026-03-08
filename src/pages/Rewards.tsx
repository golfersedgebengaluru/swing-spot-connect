import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Gift, Star, Trophy, Users, ShoppingBag, Calendar, Check, Loader2 } from "lucide-react";
import { useRewards, useEarnMethods } from "@/hooks/useRewards";

const iconMap: Record<string, any> = {
  calendar: Calendar,
  "shopping-bag": ShoppingBag,
  users: Users,
  trophy: Trophy,
  star: Star,
};

export default function Rewards() {
  const { data: rewards, isLoading: loadingRewards } = useRewards();
  const { data: earnMethods, isLoading: loadingEarn } = useEarnMethods();

  const currentPoints = 2450;
  const nextTier = 5000;
  const currentTier = "Silver";
  const isLoading = loadingRewards || loadingEarn;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar isAuthenticated={true} />
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
                    <span className="font-medium text-primary-foreground/80">{currentTier} Member</span>
                  </div>
                  <p className="mt-2 font-display text-5xl font-bold text-primary-foreground">{currentPoints.toLocaleString()}</p>
                  <p className="text-primary-foreground/70">Available Points</p>
                </div>
                <div className="md:text-right">
                  <p className="text-sm text-primary-foreground/70">{nextTier - currentPoints} points to Gold tier</p>
                  <Progress value={(currentPoints / nextTier) * 100} className="mt-2 h-3 w-64 bg-primary-foreground/20" />
                  <p className="mt-1 text-xs text-primary-foreground/60">{currentPoints.toLocaleString()} / {nextTier.toLocaleString()}</p>
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
                              <p className="text-sm text-muted-foreground">{reward.description}</p>
                            </div>
                            <Badge variant={currentPoints >= reward.points_cost ? "default" : "secondary"}>
                              {reward.points_cost} pts
                            </Badge>
                          </div>
                          <Button className="mt-3 w-full" size="sm" disabled={!reward.is_available || currentPoints < reward.points_cost}>
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
                    <CardTitle className="font-display text-xl">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Activity tracking coming soon</p>
                  </CardContent>
                </Card>

                <Card className="mt-6 shadow-elegant">
                  <CardHeader>
                    <CardTitle className="font-display text-xl">Silver Benefits</CardTitle>
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
