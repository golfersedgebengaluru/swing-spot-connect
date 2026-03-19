import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";

const MAX_ATTEMPTS = 3;

export default function AdminSetup() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(0);

  if (authLoading || adminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;

  const isLockedOut = attempts >= MAX_ATTEMPTS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut) return;
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("setup-admin", {
        body: { admin_password: password },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Admin access granted!", description: "Redirecting to admin dashboard..." });
      setTimeout(() => navigate("/admin"), 1000);
    } catch (err: any) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPassword("");

      if (newAttempts >= MAX_ATTEMPTS) {
        toast({
          title: "Too many failed attempts",
          description: "Access locked. Please refresh the page to try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Access denied",
          description: `${err.message || "Invalid admin password"} (${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? "" : "s"} remaining)`,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${isLockedOut ? "bg-destructive/10" : "bg-primary/10"}`}>
            {isLockedOut ? <Lock className="h-6 w-6 text-destructive" /> : <Shield className="h-6 w-6 text-primary" />}
          </div>
          <CardTitle className="font-display text-2xl">Admin Access</CardTitle>
          <CardDescription>
            {isLockedOut
              ? "Too many failed attempts. Refresh the page to try again."
              : "Enter the admin password to gain admin privileges"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLockedOut ? (
            <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
              Refresh & Try Again
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="admin-password">Admin Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2"
                  required
                />
              </div>
              {attempts > 0 && (
                <p className="text-sm text-destructive">
                  {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts === 1 ? "" : "s"} remaining
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : "Verify & Grant Access"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
