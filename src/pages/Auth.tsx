import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isSignUp, setIsSignUp] = useState(searchParams.get("mode") === "signup");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
  });

  useEffect(() => {
    setIsSignUp(searchParams.get("mode") === "signup");
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulated auth - will be replaced with Supabase
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: isSignUp ? "Account created!" : "Welcome back!",
        description: "Backend integration required. Connect Supabase to enable authentication.",
      });
      // For demo, navigate to dashboard
      navigate("/dashboard");
    }, 1500);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Panel - Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          {/* Back Link */}
          <Link
            to="/"
            className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to home
          </Link>

          {/* Header */}
          <div>
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
                <span className="font-display text-lg font-bold text-primary-foreground">G</span>
              </div>
              <span className="font-display text-xl font-semibold text-foreground">
                GolfHub
              </span>
            </Link>
            <h2 className="mt-8 font-display text-2xl font-bold text-foreground">
              {isSignUp ? "Create your account" : "Welcome back"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isSignUp
                ? "Join our community of golf enthusiasts"
                : "Sign in to access your dashboard"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
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
              <Label htmlFor="password">Password</Label>
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

            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
            </Button>
          </form>

          {/* Toggle Mode */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link
              to={isSignUp ? "/auth" : "/auth?mode=signup"}
              className="font-medium text-primary hover:text-primary/80"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </Link>
          </p>
        </div>
      </div>

      {/* Right Panel - Image/Pattern */}
      <div className="relative hidden flex-1 lg:block">
        <div className="absolute inset-0 bg-gradient-hero">
          <div className="absolute inset-0 flex items-center justify-center p-12">
            <div className="max-w-lg text-center">
              <h3 className="font-display text-4xl font-bold text-primary-foreground">
                Your Golf Journey
                <span className="text-gradient-gold"> Starts Here</span>
              </h3>
              <p className="mt-4 text-lg text-primary-foreground/80">
                Track your progress, compete with friends, and earn rewards with every round.
              </p>
            </div>
          </div>
          {/* Decorative elements */}
          <div className="absolute -bottom-20 -left-20 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary-foreground/5 blur-3xl" />
        </div>
      </div>
    </div>
  );
}
