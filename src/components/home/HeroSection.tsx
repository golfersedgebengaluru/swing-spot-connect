import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Trophy, Users, Calendar, Gift } from "lucide-react";

const features = [
  { icon: Trophy, label: "Leaderboards" },
  { icon: Users, label: "Community" },
  { icon: Calendar, label: "Events" },
  { icon: Gift, label: "Rewards" },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-background py-20 lg:py-32">
      {/* Subtle background accent */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-primary blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-accent blur-3xl" />
      </div>

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-4 py-2 text-sm text-foreground">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--neon-green))] animate-pulse" />
            Welcome to the EdgeCollective Community
          </div>

          {/* Headline */}
          <h1 className="animate-fade-up font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl lg:text-6xl" style={{ animationDelay: "0.1s" }}>
            Join the
            <span className="text-neon-green"> EdgeCollective </span>
            by Golfer's Edge
          </h1>

          {/* Subheadline */}
          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg text-muted-foreground" style={{ animationDelay: "0.2s" }}>
            Your exclusive community for indoor golf enthusiasts. Track your progress, compete on leaderboards, attend events, and earn rewards with every swing.
          </p>

          {/* CTA Buttons */}
          <div className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row" style={{ animationDelay: "0.3s" }}>
            <Link to="/book">
              <Button size="xl" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Book Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button variant="outline" size="xl">
                Join the Collective
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="outline" size="xl">
                Sign In
              </Button>
            </Link>
          </div>

          {/* Feature Pills */}
          <div className="animate-fade-up mt-16 flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: "0.4s" }}>
            {features.map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-foreground shadow-sm transition-all hover:shadow-md"
              >
                <feature.icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{feature.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
