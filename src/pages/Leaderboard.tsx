import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal, Award, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const leaderboardData = [
  { rank: 1, name: "Michael Chen", handicap: 4.2, rounds: 24, trend: "up", avatar: "MC" },
  { rank: 2, name: "Sarah Williams", handicap: 5.8, rounds: 22, trend: "up", avatar: "SW" },
  { rank: 3, name: "James Rodriguez", handicap: 6.1, rounds: 20, trend: "same", avatar: "JR" },
  { rank: 4, name: "Emily Thompson", handicap: 7.4, rounds: 18, trend: "up", avatar: "ET" },
  { rank: 5, name: "David Kim", handicap: 8.2, rounds: 21, trend: "down", avatar: "DK" },
  { rank: 6, name: "Lisa Anderson", handicap: 9.0, rounds: 16, trend: "up", avatar: "LA" },
  { rank: 7, name: "Robert Wilson", handicap: 9.5, rounds: 19, trend: "same", avatar: "RW" },
  { rank: 8, name: "Jennifer Lee", handicap: 10.2, rounds: 15, trend: "down", avatar: "JL" },
  { rank: 9, name: "Christopher Brown", handicap: 11.0, rounds: 17, trend: "up", avatar: "CB" },
  { rank: 10, name: "Amanda Martinez", handicap: 11.8, rounds: 14, trend: "same", avatar: "AM" },
  { rank: 11, name: "Daniel Taylor", handicap: 12.1, rounds: 13, trend: "up", avatar: "DT" },
  { rank: 12, name: "You", handicap: 12.4, rounds: 8, trend: "up", avatar: "YO", isCurrentUser: true },
];

const getRankIcon = (rank: number) => {
  if (rank === 1) return <Trophy className="h-5 w-5 text-accent" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-muted-foreground" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return null;
};

const getTrendIcon = (trend: string) => {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-primary" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
};

export default function Leaderboard() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar isAuthenticated={true} />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">
              Leaderboard
            </h1>
            <p className="mt-1 text-muted-foreground">
              See how you stack up against other members
            </p>
          </div>

          {/* Top 3 Podium */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {leaderboardData.slice(0, 3).map((player, index) => (
              <Card 
                key={player.rank}
                className={cn(
                  "relative overflow-hidden shadow-elegant transition-all hover:shadow-lg",
                  index === 0 && "sm:order-2 ring-2 ring-accent",
                  index === 1 && "sm:order-1",
                  index === 2 && "sm:order-3"
                )}
              >
                {index === 0 && (
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-gold" />
                )}
                <CardContent className="p-6 text-center">
                  <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <span className="font-display text-xl font-bold text-primary">
                      {player.avatar}
                    </span>
                  </div>
                  <div className="mb-2 flex items-center justify-center gap-2">
                    {getRankIcon(player.rank)}
                    <span className="text-sm font-medium text-muted-foreground">
                      #{player.rank}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    {player.name}
                  </h3>
                  <p className="mt-2 text-3xl font-bold text-primary">{player.handicap}</p>
                  <p className="text-sm text-muted-foreground">Handicap</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Full Leaderboard */}
          <Card className="shadow-elegant">
            <CardHeader>
              <CardTitle className="font-display text-xl">Full Rankings</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="handicap">
                <TabsList className="mb-6">
                  <TabsTrigger value="handicap">By Handicap</TabsTrigger>
                  <TabsTrigger value="rounds">By Rounds</TabsTrigger>
                  <TabsTrigger value="monthly">This Month</TabsTrigger>
                </TabsList>

                <TabsContent value="handicap">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-left text-sm text-muted-foreground">
                          <th className="pb-4 font-medium">Rank</th>
                          <th className="pb-4 font-medium">Player</th>
                          <th className="pb-4 font-medium text-center">Handicap</th>
                          <th className="pb-4 font-medium text-center">Rounds</th>
                          <th className="pb-4 font-medium text-center">Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboardData.map((player) => (
                          <tr
                            key={player.rank}
                            className={cn(
                              "border-b border-border transition-colors hover:bg-muted/50",
                              player.isCurrentUser && "bg-primary/5"
                            )}
                          >
                            <td className="py-4">
                              <div className="flex items-center gap-2">
                                {getRankIcon(player.rank)}
                                <span className={cn(
                                  "font-medium",
                                  player.rank <= 3 ? "text-foreground" : "text-muted-foreground"
                                )}>
                                  {player.rank}
                                </span>
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                  <span className="text-sm font-medium text-primary">
                                    {player.avatar}
                                  </span>
                                </div>
                                <span className={cn(
                                  "font-medium",
                                  player.isCurrentUser ? "text-primary" : "text-foreground"
                                )}>
                                  {player.name}
                                  {player.isCurrentUser && (
                                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                                      You
                                    </span>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 text-center">
                              <span className="font-display text-lg font-bold text-foreground">
                                {player.handicap}
                              </span>
                            </td>
                            <td className="py-4 text-center text-muted-foreground">
                              {player.rounds}
                            </td>
                            <td className="py-4">
                              <div className="flex justify-center">
                                {getTrendIcon(player.trend)}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                <TabsContent value="rounds">
                  <div className="flex h-48 items-center justify-center text-muted-foreground">
                    Rounds ranking view coming soon
                  </div>
                </TabsContent>

                <TabsContent value="monthly">
                  <div className="flex h-48 items-center justify-center text-muted-foreground">
                    Monthly ranking view coming soon
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
