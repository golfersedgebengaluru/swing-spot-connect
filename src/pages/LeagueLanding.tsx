import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Trophy, Users, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLandingLeague } from "@/hooks/useLeagues";
import { useMyLegacyTeam } from "@/hooks/useMyLegacyTeam";
import { CreateLegacyTeamDialog } from "@/components/league/CreateLegacyTeamDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function LeagueLanding() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: league, isLoading } = useLandingLeague(id ?? null);
  const { data: my } = useMyLegacyTeam(user && id ? id : null);
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container py-10 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !league ? (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <h1 className="text-2xl font-semibold">League not found</h1>
              <p className="text-muted-foreground">This league is not available or not currently open for registration.</p>
              <Button asChild><Link to="/">Go home</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-8 space-y-5">
              <div className="flex items-center gap-3">
                <Trophy className="h-7 w-7 text-accent" />
                <h1 className="text-2xl font-bold">{league.name}</h1>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                {league.allowed_team_sizes.length > 0 && (
                  <div>Team sizes: {league.allowed_team_sizes.join(", ")}</div>
                )}
                <div>{league.currency} {league.price_per_person} / person</div>
              </div>

              {my?.team ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-emerald-600" />
                    <span className="font-medium">{my.team.team_name}</span>
                    <span className="text-muted-foreground">· {my.my_role}</span>
                  </div>
                  <Button asChild size="lg" className="w-full">
                    <Link to="/leagues">Open My Leagues</Link>
                  </Button>
                </div>
              ) : user ? (
                <Button size="lg" className="w-full" onClick={() => setOpen(true)}>
                  Create Team
                </Button>
              ) : (
                <Button asChild size="lg" className="w-full">
                  <Link to={`/auth?redirect=/leagues/${league.id}`}>Sign in to create team</Link>
                </Button>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Share this page: <span className="font-mono">{typeof window !== "undefined" ? window.location.href : ""}</span>
              </p>
            </CardContent>
          </Card>
        )}

        {league && (
          <CreateLegacyTeamDialog
            league={league}
            open={open}
            onOpenChange={setOpen}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
