import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [validRecovery, setValidRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Supabase recovery links land here with a session in the URL hash.
  // The client picks them up automatically; we just listen for the event.
  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setValidRecovery(true);
        setReady(true);
      }
    });

    // Fallback: if a session already exists from the hash by the time we mount.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) setValidRecovery(true);
      setReady(true);
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSubmitting(false);
    if (error) {
      toast({ title: "Couldn't reset password", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Password updated", description: "You're now signed in." });
    navigate("/dashboard");
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="font-display text-2xl">Reset your password</CardTitle>
          <CardDescription>
            {validRecovery
              ? "Choose a new password for your account."
              : "This reset link is invalid or has expired. Request a new one."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {validRecovery ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-2"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-2"
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Update password"}
              </Button>
            </form>
          ) : (
            <Button asChild className="w-full">
              <Link to="/forgot-password"><ArrowLeft className="mr-2 h-4 w-4" /> Request a new link</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
