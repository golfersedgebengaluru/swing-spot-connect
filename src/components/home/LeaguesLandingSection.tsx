import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { useLeaguesLite } from "@/hooks/useLeaguesLite";

export function LeaguesLandingSection() {
  const { data: leagues } = useLeaguesLite({ onlyLanding: true });
  if (!leagues || leagues.length === 0) return null;

  return (
    <section className="container py-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Trophy className="h-7 w-7 text-accent" /> Join a League
        </h2>
        <p className="text-muted-foreground mt-2">Form your team and compete.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {leagues.map((l) => {
          const title = l.multi_location
            ? `Join the ${(l.venues ?? []).map((v) => v.name).join(" / ") || "League"}`
            : l.name;
          return (
            <Card key={l.id}>
              <CardContent className="p-6 space-y-3">
                <h3 className="font-semibold text-lg">{title}</h3>
                <div className="text-sm text-muted-foreground">
                  Team sizes: {l.allowed_team_sizes.join(", ")} · {l.currency} {l.price_per_person}/person
                </div>
                <Button asChild className="w-full" size="lg">
                  <Link to={`/leagues-lite/join/${l.id}`}>Join League</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
