import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 sm:p-12 lg:p-16 shadow-sm">
          {/* Background Effects */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

          <div className="relative mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl">
              Ready to Join the
              <span className="text-neon-green"> EdgeCollective?</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Start tracking your progress, competing with friends, and earning rewards today. Your golf journey at Golfer's Edge awaits.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/auth?mode=signup">
                <Button size="xl" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button variant="outline" size="lg">
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
