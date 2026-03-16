import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Trophy, Calendar, Gift, Target, Clock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserPoints } from "@/hooks/usePoints";
import { useAuth } from "@/contexts/AuthContext";

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
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || "Golfer";

  const stats = [
    { label: "Current Handicap", value: "12.4", change: "-0.8", icon: Target, positive: true },
    { label: "Rounds This Month", value: "8", change: "+2", icon: Clock, positive: true },
    { label: "Leaderboard Rank", value: "#12", change: "+3", icon: Trophy, positive: true },
    { label: "Reward Points", value: currentPoints.toLocaleString(), change: "", icon: Gift, positive: true },
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
            <Link to="/book">
              <Button variant="default">
                Book a Bay
                <ArrowRight className="ml-2 h-4 w-4" />
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
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="bg-gradient-card shadow-elegant">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
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

          {/* Progress Chart Placeholder */}
          <Card className="mt-6 shadow-elegant">
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
        </div>
      </main>

      <Footer />
    </div>
  );
}
