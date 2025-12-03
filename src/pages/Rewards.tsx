import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Gift, Star, Trophy, Users, ShoppingBag, Calendar, Check } from "lucide-react";

const rewards = [
  { id: 1, name: "Free Bay Hour", points: 500, description: "One hour free at any bay", available: true },
  { id: 2, name: "Pro Shop Discount", points: 300, description: "20% off any merchandise", available: true },
  { id: 3, name: "Free Drink", points: 150, description: "Any beverage on us", available: true },
  { id: 4, name: "Guest Pass", points: 400, description: "Bring a friend for free", available: true },
  { id: 5, name: "Private Lesson", points: 1000, description: "30-min with our pro", available: false },
  { id: 6, name: "Tournament Entry", points: 750, description: "Free entry to monthly tournament", available: true },
];

const earnMethods = [
  { icon: Calendar, method: "Visit & Play", points: "50 pts", description: "Per hour of play" },
  { icon: ShoppingBag, method: "Purchases", points: "1 pt/$1", description: "On all purchases" },
  { icon: Users, method: "Refer a Friend", points: "200 pts", description: "When they join" },
  { icon: Trophy, method: "Win Tournament", points: "500 pts", description: "Bonus for winners" },
];

const recentActivity = [
  { action: "Played 2 hours", points: "+100", date: "Nov 28" },
  { action: "Beverage purchase", points: "+12", date: "Nov 28" },
  { action: "Played 1 hour", points: "+50", date: "Nov 25" },
  { action: "Merchandise purchase", points: "+65", date: "Nov 22" },
  { action: "Referral bonus", points: "+200", date: "Nov 20" },
];

export default function Rewards() {
  const currentPoints = 2450;
  const nextTier = 5000;
  const currentTier = "Silver";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar isAuthenticated={true} />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">
              Rewards
            </h1>
            <p className="mt-1 text-muted-foreground">
              Earn points and redeem exclusive perks
            </p>
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
                  <p className="mt-2 font-display text-5xl font-bold text-primary-foreground">
                    {currentPoints.toLocaleString()}
                  </p>
                  <p className="text-primary-foreground/70">Available Points</p>
                </div>
                
                <div className="md:text-right">
                  <p className="text-sm text-primary-foreground/70">
                    {nextTier - currentPoints} points to Gold tier
                  </p>
                  <Progress 
                    value={(currentPoints / nextTier) * 100} 
                    className="mt-2 h-3 w-64 bg-primary-foreground/20"
                  />
                  <p className="mt-1 text-xs text-primary-foreground/60">
                    {currentPoints.toLocaleString()} / {nextTier.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Available Rewards */}
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
                    {rewards.map((reward) => (
                      <div
                        key={reward.id}
                        className={`rounded-xl border p-4 transition-all ${
                          reward.available && currentPoints >= reward.points
                            ? "border-primary/20 bg-primary/5 hover:border-primary/40"
                            : "border-border opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-foreground">{reward.name}</h4>
                            <p className="text-sm text-muted-foreground">{reward.description}</p>
                          </div>
                          <Badge variant={currentPoints >= reward.points ? "default" : "secondary"}>
                            {reward.points} pts
                          </Badge>
                        </div>
                        <Button 
                          className="mt-3 w-full" 
                          size="sm"
                          disabled={!reward.available || currentPoints < reward.points}
                        >
                          {currentPoints >= reward.points ? "Redeem" : "Not enough points"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* How to Earn */}
              <Card className="mt-6 shadow-elegant">
                <CardHeader>
                  <CardTitle className="font-display text-xl">How to Earn Points</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {earnMethods.map((method) => (
                      <div
                        key={method.method}
                        className="flex items-center gap-4 rounded-xl border border-border p-4"
                      >
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                          <method.icon className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{method.method}</p>
                          <p className="text-sm text-muted-foreground">{method.description}</p>
                        </div>
                        <Badge variant="outline" className="ml-auto">
                          {method.points}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div>
              <Card className="shadow-elegant">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentActivity.map((activity, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
                      >
                        <div>
                          <p className="font-medium text-foreground">{activity.action}</p>
                          <p className="text-xs text-muted-foreground">{activity.date}</p>
                        </div>
                        <span className="font-medium text-primary">{activity.points}</span>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" className="mt-4 w-full">
                    View All Activity
                  </Button>
                </CardContent>
              </Card>

              {/* Tier Benefits */}
              <Card className="mt-6 shadow-elegant">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Silver Benefits</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {[
                      "Earn 1 point per $1 spent",
                      "Birthday reward bonus",
                      "Early event registration",
                      "10% off private lessons",
                    ].map((benefit) => (
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
        </div>
      </main>

      <Footer />
    </div>
  );
}
