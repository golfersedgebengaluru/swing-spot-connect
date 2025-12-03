import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-hero p-8 sm:p-12 lg:p-16">
          {/* Background Effects */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary-foreground/10 blur-3xl" />

          <div className="relative mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl font-bold text-primary-foreground sm:text-4xl lg:text-5xl">
              Ready to Join the
              <span className="text-gradient-gold"> Community?</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
              Start tracking your progress, competing with friends, and earning rewards today. Your golf journey awaits.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/auth?mode=signup">
                <Button variant="gold" size="xl">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button variant="heroOutline" size="lg">
                  I Have an Account
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
