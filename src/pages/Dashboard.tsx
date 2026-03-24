import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, Trophy, Calendar, Gift, Target, Clock, ArrowRight, HelpCircle, Package, Loader2, Timer, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserPoints } from "@/hooks/usePoints";
import { useUserHoursBalance } from "@/hooks/useBookings";
import { useHourPackages } from "@/hooks/usePricing";
import { useAuth } from "@/contexts/AuthContext";
import { EmailPreferencesCard } from "@/components/EmailPreferencesCard";

const recentRounds = [
  { date: "Nov 28", course: "Bay 3", score: 78, par: 72 },
  { date: "Nov 25", course: "Bay 1", score: 82, par: 72 },
  { date: "Nov 22", course: "Bay 5", score: 76, par: 72 },
];

const upcomingEvents = [
  { name: "Weekend Tournament", date: "Dec 7", spots: "4 spots left" },
  { name: "Beginners Clinic", date: "Dec 10", spots: "Open" },
  { name: "Holiday Cup", date: "Dec 21", spots: "Registration open" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: currentPoints = 0 } = useUserPoints();
  const { data: balance } = useUserHoursBalance();
  const { data: hourPackages, isLoading: loadingPackages } = useHourPackages();
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || "Golfer";
  const activePackages = (hourPackages ?? []).filter((p: any) => p.is_active && p.price > 0);

  const stats = [
    { label: "Current Handicap", value: "12.4", change: "-0.8", icon: Target, positive: true, tooltip: "" },
    { label: "Hours Balance", value: `${balance?.remaining ?? 0}`, change: "", icon: Clock, positive: true, tooltip: "Used to book practice sessions. 1 hour = 1 booking slot." },
    { label: "Leaderboard Rank", value: "#12", change: "+3", icon: Trophy, positive: true, tooltip: "" },
    { label: "Reward Points", value: currentPoints.toLocaleString(), change: "", icon: Gift, positive: true, tooltip: "Earned through activity. Redeem for perks in the Rewards section." },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          {/* Welcome Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">
              Welcome back, <span className="text-primary">{displayName}</span>
            </h1>
            <p className="mt-1 text-muted-foreground">
              Here's an overview of your golf journey
            </p>
          </div>

          {/* Quick Actions */}
          <div className="mb-8 flex flex-wrap gap-3">
            <Link to="/bookings">
              <Button variant="default">
                <Timer className="mr-2 h-4 w-4" />
                Book w/ Hours
              </Button>
            </Link>
            <Link to="/book">
              <Button variant="outline">
                <CreditCard className="mr-2 h-4 w-4" />
                Pay-Per-Use
              </Button>
            </Link>
            <Link to="/shop">
              <Button variant="outline">Order Beverages</Button>
            </Link>
            <Link to="/events">
              <Button variant="outline">View Events</Button>
            </Link>
          </div>

          {/* Stats Grid */}
          <TooltipProvider>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.label} className="bg-gradient-card shadow-elegant">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-sm text-muted-foreground">{stat.label}</p>
                          {stat.tooltip && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-48 text-xs">
                                {stat.tooltip}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <p className="mt-1 font-display text-3xl font-bold text-foreground">
                          {stat.value}
                        </p>
                        {stat.change && (
                          <p className={`mt-1 text-sm ${stat.positive ? "text-primary" : "text-destructive"}`}>
                            {stat.change} this month
                          </p>
                        )}
                      </div>
                      <div className="rounded-xl bg-primary/10 p-3">
                        <stat.icon className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TooltipProvider>

          {/* Your Wallet */}
          <Card className="mb-8 shadow-elegant">
            <CardHeader>
              <CardTitle className="font-display text-xl">Your Wallet</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-start gap-4 rounded-lg border border-border p-4">
                  <div className="rounded-xl bg-primary/10 p-3">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Bay Hours</p>
                    <p className="font-display text-3xl font-bold text-primary">{balance?.remaining ?? 0}h</p>
                    <p className="mt-1 text-xs text-muted-foreground">Used to book practice sessions. 1 hour = 1 booking slot.</p>
                    <Link to="/bookings">
                      <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs">Book a bay <ArrowRight className="ml-1 h-3 w-3" /></Button>
                    </Link>
                  </div>
                </div>
                <div className="flex items-start gap-4 rounded-lg border border-border p-4">
                  <div className="rounded-xl bg-accent/10 p-3">
                    <Gift className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Reward Points</p>
                    <p className="font-display text-3xl font-bold text-accent">{currentPoints.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Earned through activity. Redeem for perks in the Rewards section.</p>
                    <Link to="/rewards">
                      <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs">View rewards <ArrowRight className="ml-1 h-3 w-3" /></Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Content Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Recent Rounds */}
            <Card className="shadow-elegant">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display text-xl">Recent Rounds</CardTitle>
                <Link to="/history">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentRounds.map((round, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
                    >
                      <div>
                        <p className="font-medium text-foreground">{round.course}</p>
                        <p className="text-sm text-muted-foreground">{round.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-2xl font-bold text-foreground">
                          {round.score}
                        </p>
                        <p className={`text-sm ${round.score <= round.par ? "text-primary" : "text-muted-foreground"}`}>
                          {round.score - round.par > 0 ? "+" : ""}{round.score - round.par} par
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Events */}
            <Card className="shadow-elegant">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display text-xl">Upcoming Events</CardTitle>
                <Link to="/events">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {upcomingEvents.map((event, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                          <Calendar className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{event.name}</p>
                          <p className="text-sm text-muted-foreground">{event.date}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                        {event.spots}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Buy Hours */}
          {activePackages.length > 0 && (
            <Card className="mt-6 shadow-elegant">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display text-xl flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Buy Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activePackages.map((pkg: any) => (
                    <div
                      key={pkg.id}
                      className="relative rounded-lg border border-border p-5 transition-colors hover:border-primary/40 hover:bg-muted/30"
                    >
                      {pkg.hours === 25 && (
                        <Badge className="absolute -top-2.5 right-3 bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs">
                          Birdie Member
                        </Badge>
                      )}
                      <p className="font-display text-3xl font-bold text-foreground">{pkg.hours}h</p>
                      <p className="text-sm text-muted-foreground mt-1">{pkg.label}</p>
                      <p className="font-display text-xl font-bold text-primary mt-3">₹{pkg.price.toLocaleString()}</p>
                      <Button className="w-full mt-4" variant={pkg.hours === 25 ? "default" : "outline"}>
                        Buy Now
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}


          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card className="shadow-elegant">
              <CardHeader>
                <CardTitle className="font-display text-xl flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Your Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-border">
                  <p className="text-muted-foreground">
                    Score progression chart coming soon
                  </p>
                </div>
              </CardContent>
            </Card>

            <EmailPreferencesCard />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
