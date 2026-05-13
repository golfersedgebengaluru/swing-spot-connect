import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Users } from "lucide-react";
import { useLandingLeagues, type LandingLeague } from "@/hooks/useLeagues";
import { useMyLegacyTeam } from "@/hooks/useMyLegacyTeam";
import { CreateLegacyTeamDialog } from "@/components/league/CreateLegacyTeamDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

function LeagueCard({ league, onCreate }: { league: LandingLeague; onCreate: () => void }) {
  const { user } = useAuth();
  const { data: my } = useMyLegacyTeam(user ? league.id : null);
  const hasTeam = !!my?.team;

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <h3 className="font-semibold text-lg">{league.name}</h3>
        <div className="text-sm text-muted-foreground">
          {league.allowed_team_sizes.length > 0
            ? `Team sizes: ${league.allowed_team_sizes.join(", ")} · `
            : ""}
          {league.currency} {league.price_per_person}/person
        </div>
        {hasTeam ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-emerald-600" />
              <span className="font-medium">{my!.team!.team_name}</span>
              <span className="text-muted-foreground">· {my!.my_role}</span>
            </div>
            <Button asChild className="w-full" size="lg" variant="outline">
              <Link to="/leagues">Open My Leagues</Link>
            </Button>
          </div>
        ) : (
          <Button className="w-full" size="lg" onClick={user ? onCreate : undefined} asChild={!user}>
            {user ? <span>Create Team</span> : <Link to="/auth">Sign in to create team</Link>}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function LeaguesLandingSection() {
  const { data: legacyLeagues } = useLandingLeagues();
  const [target, setTarget] = useState<LandingLeague | null>(null);

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
          <LeagueCard key={`legacy-${l.id}`} league={l} onCreate={() => setTarget(l)} />
        ))}
      </div>
      {target && (
        <CreateLegacyTeamDialog
          league={target}
          open={!!target}
          onOpenChange={(o) => { if (!o) setTarget(null); }}
        />
      )}
    </section>
  );
}
