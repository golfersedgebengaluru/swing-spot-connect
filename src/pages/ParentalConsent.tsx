import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldX, Loader2 } from "lucide-react";

export default function ParentalConsent() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{ display_name: string | null; status: string } | null>(null);
  const [result, setResult] = useState<"approved" | "rejected" | "expired" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data } = await supabase.rpc("lookup_parental_consent_token", { _token: token });
      const row = Array.isArray(data) ? data[0] : null;
      if (!row || row.status !== "pending") {
        setResult("expired");
      } else {
        setInfo({ display_name: row.display_name, status: row.status });
      }
      setLoading(false);
    })();
  }, [token]);

  const decide = async (approve: boolean) => {
    if (!token) return;
    setBusy(true);
    const { data } = await supabase.rpc("confirm_parental_consent", { _token: token, _approve: approve });
    setBusy(false);
    setResult(data ? (approve ? "approved" : "rejected") : "expired");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">Parental Consent</CardTitle>
          <CardDescription>Digital Personal Data Protection Act, 2023 — §9</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
          )}

          {!loading && result === "expired" && (
            <div className="text-center space-y-3">
              <ShieldX className="h-10 w-10 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">
                This consent link is invalid or has already been used. If your child still needs your approval, please ask them to resend the request from their profile.
              </p>
              <Button asChild variant="outline"><Link to="/">Go home</Link></Button>
            </div>
          )}

          {!loading && result === "approved" && (
            <div className="text-center space-y-3">
              <ShieldCheck className="h-10 w-10 text-primary mx-auto" />
              <p>Consent recorded. Your child can now use the service with the protections required for minors.</p>
              <Button asChild><Link to="/">Done</Link></Button>
            </div>
          )}

          {!loading && result === "rejected" && (
            <div className="text-center space-y-3">
              <ShieldX className="h-10 w-10 text-destructive mx-auto" />
              <p>Consent was declined. The child's account will be restricted and they will be notified.</p>
              <Button asChild variant="outline"><Link to="/">Done</Link></Button>
            </div>
          )}

          {!loading && !result && info && (
            <>
              <p className="text-sm">
                <strong>{info.display_name ?? "A user"}</strong> has nominated you as their parent or
                lawful guardian. They are under 18, and under the DPDP Act we require your verifiable
                consent before processing their personal data.
              </p>
              <p className="text-xs text-muted-foreground">
                If you consent, we will: (a) limit marketing communications, (b) keep the account out
                of public leaderboards by default, and (c) restrict behavioural tracking.
              </p>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => decide(false)} disabled={busy}>
                  Decline
                </Button>
                <Button className="flex-1" onClick={() => decide(true)} disabled={busy}>
                  {busy ? "Saving…" : "I consent"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
