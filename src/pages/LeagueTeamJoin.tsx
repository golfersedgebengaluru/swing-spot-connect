import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { leagueServiceInvoke } from "@/hooks/useLeagues";

export default function LeagueTeamJoin() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<"idle" | "joining" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [teamName, setTeamName] = useState<string>("");

  useEffect(() => {
    if (loading || !token) return;
    if (!user) {
      // Stash and bounce to /auth, then come back
      sessionStorage.setItem("post_auth_redirect", `/league-team-join/${token}`);
      navigate("/auth");
      return;
    }
    if (state !== "idle") return;
    setState("joining");
    leagueServiceInvoke("/leagues/legacy/claim-by-token", "POST", { token })
      .then((res: { result?: { ok: boolean; error?: string; team_name?: string } }) => {
        const r = res.result;
        if (r?.ok) {
          setTeamName(r.team_name || "");
          setState("ok");
        } else {
          setMessage(r?.error || "Could not join team");
          setState("error");
        }
      })
      .catch((e: Error) => { setMessage(e.message); setState("error"); });
  }, [user, loading, token, navigate, state]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          {state === "joining" || loading ? (
            <><Loader2 className="h-8 w-8 animate-spin mx-auto" /><p>Joining team…</p></>
          ) : state === "ok" ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h1 className="text-xl font-semibold">You're on the team!</h1>
              {teamName && <p className="text-muted-foreground">Welcome to "{teamName}".</p>}
              <Button asChild><Link to="/leagues">Go to My Leagues</Link></Button>
            </>
          ) : state === "error" ? (
            <>
              <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
              <h1 className="text-xl font-semibold">Couldn't join</h1>
              <p className="text-muted-foreground">{message}</p>
              <Button asChild variant="outline"><Link to="/leagues">Back</Link></Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
