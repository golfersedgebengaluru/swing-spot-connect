import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Award, TrendingUp, TrendingDown, Minus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { EmptyState } from "@/components/ui/PageSkeleton";

function useLeaderboard() {
  return useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, handicap, total_rounds")
        .not("handicap", "is", null)
        .not("user_id", "is", null)
        .order("handicap", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((p, i) => ({
        rank: i + 1,
        user_id: p.user_id,
        name: p.display_name || "Member",
        handicap: p.handicap as number,
        rounds: p.total_rounds ?? 0,
        avatar: (p.display_name || "M").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2),
      }));
    },
  });
}

const getRankIcon = (rank: number) => {
  if (rank === 1) return <Trophy className="h-5 w-5 text-accent" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-muted-foreground" />;
  if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
  return null;
};

function PodiumSkeleton() {
  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="shadow-elegant">
          <CardContent className="p-6 text-center space-y-3">
            <Skeleton className="mx-auto h-16 w-16 rounded-full" />
            <Skeleton className="mx-auto h-4 w-24" />
            <Skeleton className="mx-auto h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border py-3">
          <Skeleton className="h-5 w-8" />
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </div>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();
  const { data: players, isLoading } = useLeaderboard();
  const top3 = (players ?? []).slice(0, 3);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">Leaderboard</h1>
            <p className="mt-1 text-muted-foreground">See how you stack up against other members</p>
          </div>

          {isLoading ? (
            <>
              <PodiumSkeleton />
              <Card className="shadow-elegant">
                <CardHeader>
                  <CardTitle className="font-display text-xl">Full Rankings</CardTitle>
                </CardHeader>
                <CardContent><TableSkeleton /></CardContent>
              </Card>
            </>
          ) : (players ?? []).length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No rankings yet"
              description="Member handicaps will appear here once they've been recorded."
            />
          ) : (
            <>
              {/* Top 3 Podium */}
              <div className="mb-8 grid gap-4 sm:grid-cols-3">
                {top3.map((player, index) => (
                  <Card
                    key={player.rank}
                    className={cn(
                      "relative overflow-hidden shadow-elegant transition-all hover:shadow-lg",
                      index === 0 && "sm:order-2 ring-2 ring-accent",
                      index === 1 && "sm:order-1",
                      index === 2 && "sm:order-3"
                    )}
                  >
                    {index === 0 && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-gold" />}
                    <CardContent className="p-6 text-center">
                      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                        <span className="font-display text-xl font-bold text-primary">{player.avatar}</span>
                      </div>
                      <div className="mb-2 flex items-center justify-center gap-2">
                        {getRankIcon(player.rank)}
                        <span className="text-sm font-medium text-muted-foreground">#{player.rank}</span>
                      </div>
                      <h3 className="font-display text-lg font-semibold text-foreground">{player.name}</h3>
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
                            </tr>
                          </thead>
                          <tbody>
                            {(players ?? []).map((player) => {
                              const isCurrentUser = player.user_id === user?.id;
                              return (
                                <tr
                                  key={player.rank}
                                  className={cn(
                                    "border-b border-border transition-colors hover:bg-muted/50",
                                    isCurrentUser && "bg-primary/5"
                                  )}
                                >
                                  <td className="py-4">
                                    <div className="flex items-center gap-2">
                                      {getRankIcon(player.rank)}
                                      <span className={cn("font-medium", player.rank <= 3 ? "text-foreground" : "text-muted-foreground")}>
                                        {player.rank}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                        <span className="text-sm font-medium text-primary">{player.avatar}</span>
                                      </div>
                                      <span className={cn("font-medium", isCurrentUser ? "text-primary" : "text-foreground")}>
                                        {player.name}
                                        {isCurrentUser && (
                                          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">You</span>
                                        )}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-4 text-center">
                                    <span className="font-display text-lg font-bold text-foreground">{player.handicap}</span>
                                  </td>
                                  <td className="py-4 text-center text-muted-foreground">{player.rounds}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>

                    <TabsContent value="rounds">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border text-left text-sm text-muted-foreground">
                              <th className="pb-4 font-medium">Rank</th>
                              <th className="pb-4 font-medium">Player</th>
                              <th className="pb-4 font-medium text-center">Rounds</th>
                              <th className="pb-4 font-medium text-center">Handicap</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...(players ?? [])].sort((a, b) => b.rounds - a.rounds).map((player, i) => {
                              const isCurrentUser = player.user_id === user?.id;
                              return (
                                <tr
                                  key={player.user_id}
                                  className={cn("border-b border-border transition-colors hover:bg-muted/50", isCurrentUser && "bg-primary/5")}
                                >
                                  <td className="py-4 text-muted-foreground font-medium">{i + 1}</td>
                                  <td className="py-4">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                                        <span className="text-sm font-medium text-primary">{player.avatar}</span>
                                      </div>
                                      <span className={cn("font-medium", isCurrentUser ? "text-primary" : "text-foreground")}>
                                        {player.name}
                                        {isCurrentUser && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">You</span>}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-4 text-center font-bold text-foreground">{player.rounds}</td>
                                  <td className="py-4 text-center text-muted-foreground">{player.handicap}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
