import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Trophy, Users, Calendar, Gift } from "lucide-react";
import heroImage from "@/assets/golfers-edge-hero.jpg";

const features = [
  { icon: Trophy, label: "Leaderboards" },
  { icon: Users, label: "Community" },
  { icon: Calendar, label: "Events" },
  { icon: Gift, label: "Rewards" },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-hero py-20 lg:py-32">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0">
        <img src={heroImage} alt="" className="h-full w-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-hero opacity-90" />
      </div>

      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-accent blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-primary-foreground blur-3xl" />
      </div>

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2 text-sm text-primary-foreground backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            Welcome to the EdgeCollective Community
          </div>

          {/* Headline */}
          <h1 className="animate-fade-up font-display text-4xl font-bold leading-tight text-primary-foreground sm:text-5xl lg:text-6xl" style={{ animationDelay: "0.1s" }}>
            Join the
            <span className="text-gradient-gold"> EdgeCollective </span>
            by Golfer's Edge
          </h1>

          {/* Subheadline */}
          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg text-primary-foreground/80" style={{ animationDelay: "0.2s" }}>
            Your exclusive community for indoor golf enthusiasts. Track your progress, compete on leaderboards, attend events, and earn rewards with every swing.
          </p>

          {/* CTA Buttons */}
          <div className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row" style={{ animationDelay: "0.3s" }}>
            <Link to="/auth?mode=signup">
              <Button variant="gold" size="xl">
                Join the Tribe
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="heroOutline" size="xl">
                Sign In
              </Button>
            </Link>
          </div>

          {/* Feature Pills */}
          <div className="animate-fade-up mt-16 flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: "0.4s" }}>
            {features.map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-5 py-2.5 text-primary-foreground backdrop-blur-sm transition-all hover:bg-primary-foreground/10"
              >
                <feature.icon className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium">{feature.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path
            d="M0 50L60 45.7C120 41.3 240 32.7 360 35.8C480 39 600 54 720 58.3C840 62.7 960 56.3 1080 51.7C1200 47 1320 44 1380 42.5L1440 41V100H1380C1320 100 1200 100 1080 100C960 100 840 100 720 100C600 100 480 100 360 100C240 100 120 100 60 100H0V50Z"
            fill="hsl(var(--background))"
          />
        </svg>
      </div>
    </section>
  );
}
