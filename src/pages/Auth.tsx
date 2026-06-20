import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/contexts/AuthContext";
import bannerLogo from "@/assets/golfers-edge-banner.jpg";
import heroImage from "@/assets/golfers-edge-hero.jpg";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [isSignUp, setIsSignUp] = useState(searchParams.get("mode") === "signup");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    dob: "",
    parentEmail: "",
  });

  const ageYears = (dobStr: string): number | null => {
    if (!dobStr) return null;
    const d = new Date(dobStr);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  };
  const age = ageYears(formData.dob);
  const isMinor = age !== null && age < 18;

  const redirectTo = searchParams.get("redirect") || "/dashboard";

  // Check if user is admin and redirect accordingly
  useEffect(() => {
    if (!user) return;

    const checkAdminAndRedirect = async () => {
      // If there's an explicit redirect param, use it
      if (searchParams.get("redirect")) {
        navigate(searchParams.get("redirect")!);
        return;
      }

      // Special case: contests user always lands on admin
      if (user.email?.toLowerCase().startsWith("contests@golfers-edge")) {
        navigate("/admin");
        return;
      }

      // Check if user has admin role
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      const { data: isSiteAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "site_admin" as any });

      if (isAdmin === true || isSiteAdmin === true) {
        navigate("/admin");
        return;
      }

      // QC-only owners (no other elevated role) → go straight to /qc-admin
      const { data: isCoach } = await supabase.rpc("has_role", { _user_id: user.id, _role: "coach" as any });
      if (isCoach !== true) {
        const { data: qcRows } = await supabase
          .from("qc_only_admins")
          .select("tenant_id")
          .eq("user_id", user.id)
          .eq("disabled", false)
          .limit(1);
        if (qcRows && qcRows.length > 0) {
          navigate("/qc-admin");
          return;
        }
      }

      navigate("/dashboard");

    };

    checkAdminAndRedirect();
  }, [user, navigate, searchParams]);

  useEffect(() => {
    setIsSignUp(searchParams.get("mode") === "signup");
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!agreedToTerms) {
          toast({ title: "Please accept the Terms and Privacy Policy", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        if (!formData.dob) {
          toast({ title: "Date of birth is required", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        if (isMinor && !formData.parentEmail.trim()) {
          toast({ title: "Parent's email is required for users under 18", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        const effectiveMarketing = isMinor ? false : marketingOptIn;
        const { data: signupData, error } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: { full_name: formData.name },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        try {
          const newUserId = signupData?.user?.id;
          if (newUserId) {
            await supabase.from("profiles").update({
              date_of_birth: formData.dob,
              parent_email: isMinor ? formData.parentEmail.trim().toLowerCase() : null,
              parent_consent_status: isMinor ? "pending" : "not_required",
            }).eq("user_id", newUserId);

            await supabase.from("consent_log" as any).insert([
              { user_id: newUserId, email: formData.email, consent_type: "tos", granted: true, user_agent: navigator.userAgent },
              { user_id: newUserId, email: formData.email, consent_type: "privacy", granted: true, user_agent: navigator.userAgent },
              { user_id: newUserId, email: formData.email, consent_type: "marketing_email", granted: effectiveMarketing, user_agent: navigator.userAgent },
            ] as any);

            if (isMinor) {
              try {
                await supabase.functions.invoke("request-parental-consent", {
                  body: { parent_email: formData.parentEmail.trim().toLowerCase() },
                });
              } catch (_) { /* non-blocking */ }
            }
          }
        } catch (_) { /* non-blocking */ }
        toast({
          title: "Check your email!",
          description: isMinor
            ? "We've also emailed your parent for consent before your account is active."
            : "We sent you a confirmation link to complete your signup.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;
        navigate(redirectTo);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: "google" | "apple") => {
    const { error } = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: `${window.location.origin}${redirectTo}`,
    });
    if (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign in",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Panel - Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <Link
            to="/"
            className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to home
          </Link>

          <div>
            <Link to="/" className="flex items-center gap-3">
              <img src={bannerLogo} alt="Golfer's Edge" className="h-8 w-auto" />
              <span className="font-display text-xl font-semibold text-foreground">
                EdgeCollective
              </span>
            </Link>
            <h2 className="mt-8 font-display text-2xl font-bold text-foreground">
              {isSignUp ? "Join the EdgeCollective" : "Welcome back"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isSignUp
                ? "Create your account and join the collective"
                : "Sign in to access your dashboard"}
            </p>
          </div>

          {/* Social Auth */}
          <div className="mt-8 space-y-3">
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => handleOAuthSignIn("google")}
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </Button>
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => handleOAuthSignIn("apple")}
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </Button>
          </div>

          {/* Divider */}
          <div className="relative mt-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {isSignUp && (
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-2"
                  required={isSignUp}
                />
              </div>
            )}

            {isSignUp && (
              <div>
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  className="mt-2"
                  required={isSignUp}
                  max={new Date().toISOString().split("T")[0]}
                />
                {isMinor && (
                  <p className="mt-1 text-xs text-amber-600">
                    You're under 18 — we'll need your parent or guardian's consent.
                  </p>
                )}
              </div>
            )}

            {isSignUp && isMinor && (
              <div>
                <Label htmlFor="parentEmail">Parent / guardian email</Label>
                <Input
                  id="parentEmail"
                  type="email"
                  placeholder="parent@example.com"
                  value={formData.parentEmail}
                  onChange={(e) => setFormData({ ...formData, parentEmail: e.target.value })}
                  className="mt-2"
                  required
                />
              </div>
            )}

            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-2"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {!isSignUp && (
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary hover:text-primary/80"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="relative mt-2">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-start gap-2">
                  <Checkbox id="terms" checked={agreedToTerms} onCheckedChange={(v) => setAgreedToTerms(!!v)} className="mt-0.5" />
                  <Label htmlFor="terms" className="text-xs font-normal leading-relaxed cursor-pointer">
                    I agree to the{" "}
                    <Link to="/page/terms" target="_blank" className="underline text-primary">Terms of Service</Link>{" "}
                    and{" "}
                    <Link to="/page/privacy" target="_blank" className="underline text-primary">Privacy Policy</Link>{" "}
                    (DPDP Act, 2023 compliant). <span className="text-destructive">*</span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="marketing" checked={marketingOptIn} onCheckedChange={(v) => setMarketingOptIn(!!v)} className="mt-0.5" />
                  <Label htmlFor="marketing" className="text-xs font-normal leading-relaxed cursor-pointer text-muted-foreground">
                    Send me occasional marketing emails about offers, events and new features. You can opt out anytime.
                  </Label>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? "Loading..." : isSignUp ? "Join the Collective" : "Sign In"}
            </Button>

          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignUp ? "Already a collective member?" : "Not a member yet?"}{" "}
            <Link
              to={isSignUp ? "/auth" : "/auth?mode=signup"}
              className="font-medium text-primary hover:text-primary/80"
            >
              {isSignUp ? "Sign in" : "Join the Collective"}
            </Link>
          </p>
        </div>
      </div>

      {/* Right Panel - Image */}
      <div className="relative hidden flex-1 lg:block">
        <img src={heroImage} alt="Golfer's Edge Indoor Golf" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-hero opacity-80" />
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="max-w-lg text-center">
            <h3 className="font-display text-4xl font-bold text-primary-foreground">
              Your Golf Journey
              <span className="text-gradient-gold"> Starts Here</span>
            </h3>
            <p className="mt-4 text-lg text-primary-foreground/80">
              Track your progress, compete with friends, and earn rewards with every round at Golfer's Edge.
            </p>
          </div>
        </div>
        <div className="absolute -bottom-20 -left-20 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary-foreground/5 blur-3xl" />
      </div>
    </div>
  );
}
