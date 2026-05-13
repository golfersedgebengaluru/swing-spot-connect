import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { useLandingLeagues, type LandingLeague } from "@/hooks/useLeagues";
import { JoinLegacyLeagueDialog } from "@/components/league/JoinLegacyLeagueDialog";

export function LeaguesLandingSection() {
  const { data: legacyLeagues } = useLandingLeagues();
  const [joinTarget, setJoinTarget] = useState<LandingLeague | null>(null);

  if (!legacyLeagues || legacyLeagues.length === 0) return null;

  return (
    <section className="container py-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Trophy className="h-7 w-7 text-accent" /> Join a League
        </h2>
        <p className="text-muted-foreground mt-2">Form your team and compete.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {legacyLeagues.map((l) => (
          <Card key={`legacy-${l.id}`}>
            <CardContent className="p-6 space-y-3">
              <h3 className="font-semibold text-lg">{l.name}</h3>
              <div className="text-sm text-muted-foreground">
                {l.allowed_team_sizes.length > 0
                  ? `Team sizes: ${l.allowed_team_sizes.join(", ")} · `
                  : ""}
                {l.currency} {l.price_per_person}/person
              </div>
              <Button className="w-full" size="lg" onClick={() => setJoinTarget(l)}>
                Join League
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {joinTarget && (
        <JoinLegacyLeagueDialog
          league={joinTarget}
          open={!!joinTarget}
          onOpenChange={(o) => { if (!o) setJoinTarget(null); }}
        />
      )}
    </section>
  );
}
