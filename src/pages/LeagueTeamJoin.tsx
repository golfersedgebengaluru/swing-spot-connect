import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { leagueServiceInvoke } from "@/hooks/useLeagues";

interface ClaimResult {
  ok: boolean;
  error?: string;
  team_name?: string;
  invited_email?: string;
  already_member?: boolean;
}

function errorCopy(code: string | undefined, invitedEmail?: string): string {
  switch (code) {
    case "email_mismatch":
      return `This invite was sent to ${invitedEmail || "a different address"}. Sign out and sign back in using that email to join the team.`;
    case "invite_revoked":
      return "This invite has been revoked by the team captain. Please ask them to resend.";
    case "invite_expired":
      return "This invite link has expired. Please ask the team captain to resend.";
    case "invalid_invite":
    case "invalid_token":
      return "This invite link is no longer valid.";
    case "team_full":
      return "This team is already full.";
    case "team_not_paid":
      return "This team's registration is not yet complete.";
    case "already_on_other_team":
      return "You're already on another team in this league.";
    case "not_invited":
      return "You weren't invited to this team. Ask the captain to send you an invite using the email you signed in with.";
    case "team_not_found":
      return "Team not found.";
    default:
      return code || "Could not join team";
  }
}

export default function LeagueTeamJoin() {
  const params = useParams<{ token?: string; inviteToken?: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<"idle" | "joining" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [teamName, setTeamName] = useState<string>("");
  const [invitedEmail, setInvitedEmail] = useState<string>("");

  const isInviteFlow = !!params.inviteToken;
  const tokenValue = params.inviteToken || params.token || "";

  useEffect(() => {
    if (loading || !tokenValue) return;
    if (!user) {
      const backPath = isInviteFlow
        ? `/league-team-join/i/${tokenValue}`
        : `/league-team-join/${tokenValue}`;
      navigate(`/auth?redirect=${encodeURIComponent(backPath)}`, { replace: true });
      return;
    }
    if (state !== "idle") return;
    setState("joining");

    const call = isInviteFlow
      ? leagueServiceInvoke("/leagues/legacy/claim-by-invite", "POST", { invite_token: tokenValue })
      : leagueServiceInvoke("/leagues/legacy/claim-by-token", "POST", { token: tokenValue });

    call
      .then((res: { result?: ClaimResult }) => {
        const r = res.result;
        if (r?.ok) {
          setTeamName(r.team_name || "");
          setState("ok");
        } else {
          setInvitedEmail(r?.invited_email || "");
          setMessage(errorCopy(r?.error, r?.invited_email));
          setState("error");
        }
      })
      .catch((e: Error) => { setMessage(e.message); setState("error"); });
  }, [user, loading, tokenValue, isInviteFlow, navigate, state]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    const backPath = isInviteFlow
      ? `/league-team-join/i/${tokenValue}`
      : `/league-team-join/${tokenValue}`;
    navigate(`/auth?redirect=${encodeURIComponent(backPath)}`, { replace: true });
  };

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
              <div className="flex flex-col gap-2 pt-2">
                {invitedEmail && (
                  <Button onClick={handleSignOut} variant="default">
                    Sign out and use {invitedEmail}
                  </Button>
                )}
                <Button asChild variant="outline"><Link to="/leagues">Back to Leagues</Link></Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
