import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Couldn't send reset email", description: error.message, variant: "destructive" });
      return;
    }
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {sent ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : <KeyRound className="h-6 w-6 text-primary" />}
          </div>
          <CardTitle className="font-display text-2xl">
            {sent ? "Check your email" : "Forgot your password?"}
          </CardTitle>
          <CardDescription>
            {sent
              ? `If an account exists for ${email}, we've sent a password reset link.`
              : "Enter your email and we'll send you a link to reset your password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth"><ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in</Link>
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : "Send reset link"}
              </Button>
              <Button asChild type="button" variant="ghost" className="w-full">
                <Link to="/auth"><ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in</Link>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
