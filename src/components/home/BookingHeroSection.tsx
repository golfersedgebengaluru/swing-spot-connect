import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useBranding } from "@/hooks/useBranding";

export function BookingHeroSection() {
  const { studioName } = useBranding();

  return (
    <section className="relative overflow-hidden bg-background py-20 lg:py-32">
      {/* Subtle background accent */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-primary blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-accent blur-3xl" />
      </div>

      <div className="container relative mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          {/* Headline */}
          <h1 className="animate-fade-up font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl lg:text-6xl" style={{ animationDelay: "0.1s" }}>
            Book Your Bay at
            <span className="text-primary"> {studioName}</span>
          </h1>

          {/* Subheadline */}
          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg text-muted-foreground" style={{ animationDelay: "0.2s" }}>
            Reserve an indoor golf bay in seconds. Pick a time and you're set.
          </p>

          {/* CTA Buttons */}
          <div className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row" style={{ animationDelay: "0.3s" }}>
            <Link to="/book">
              <Button size="xl" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Book Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="outline" size="xl">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
