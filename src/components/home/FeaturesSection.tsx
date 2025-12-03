import { Trophy, Users, Calendar, Gift, ShoppingBag, BarChart3 } from "lucide-react";

const features = [
  {
    icon: BarChart3,
    title: "Track Your Progress",
    description: "Monitor your handicap, scores, and improvement over time with detailed analytics.",
  },
  {
    icon: Trophy,
    title: "Compete & Climb",
    description: "See where you rank among fellow members on our dynamic leaderboards.",
  },
  {
    icon: Calendar,
    title: "Events & Tournaments",
    description: "Join leagues, competitions, and social events with other golf enthusiasts.",
  },
  {
    icon: Users,
    title: "Community Feed",
    description: "Share achievements, tips, and connect with fellow golfers in your community.",
  },
  {
    icon: Gift,
    title: "Earn Rewards",
    description: "Collect points for visits, purchases, and referrals. Redeem for exclusive perks.",
  },
  {
    icon: ShoppingBag,
    title: "Shop & Order",
    description: "Browse merchandise, pre-order beverages, and pick up when you arrive.",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-20 lg:py-28">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            Everything You Need to
            <span className="text-primary"> Elevate Your Game</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Our community platform brings together all the tools you need to improve, compete, and connect.
          </p>
        </div>

        {/* Features Grid */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-border bg-gradient-card p-6 shadow-elegant transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
