import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Star, TrendingUp } from "lucide-react";
import { useLoyaltyConfig } from "@/hooks/useLoyalty";

interface PointsSummaryCardProps {
  currentPoints: number;
  loadingPoints: boolean;
}

const tierThresholds = [
  { name: "Bronze", min: 0, next: 1000 },
  { name: "Silver", min: 1000, next: 5000 },
  { name: "Gold", min: 5000, next: 10000 },
  { name: "Platinum", min: 10000, next: 25000 },
];

function getTier(points: number) {
  for (let i = tierThresholds.length - 1; i >= 0; i--) {
    if (points >= tierThresholds[i].min) return tierThresholds[i];
  }
  return tierThresholds[0];
}

export function PointsSummaryCard({ currentPoints, loadingPoints }: PointsSummaryCardProps) {
  const { data: loyaltyConfig } = useLoyaltyConfig();
  const tier = getTier(currentPoints);
  const nextTierIdx = tierThresholds.indexOf(tier) + 1;
  const nextTierName = nextTierIdx < tierThresholds.length ? tierThresholds[nextTierIdx].name : "Max";
  const progressToNext = tier.next > tier.min ? ((currentPoints - tier.min) / (tier.next - tier.min)) * 100 : 100;

  const programName = loyaltyConfig?.find((c) => c.key === "program_name")?.value || "EDGE Rewards";

  return (
    <Card className="overflow-hidden bg-gradient-hero shadow-lg">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Star className="h-5 w-5 text-accent" />
              <span className="text-sm font-medium text-primary-foreground/80">{programName}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <p className="font-display text-5xl font-bold text-primary-foreground">
                {loadingPoints ? "..." : currentPoints.toLocaleString()}
              </p>
              <Badge variant="outline" className="border-primary-foreground/30 text-primary-foreground/80">
                {tier.name}
              </Badge>
            </div>
            <p className="mt-1 text-primary-foreground/70">Available Points</p>
          </div>
          <div className="md:text-right min-w-0">
            <div className="flex items-center gap-1.5 md:justify-end">
              <TrendingUp className="h-4 w-4 text-primary-foreground/60" />
              <p className="text-sm text-primary-foreground/70">
                {tier.next - currentPoints > 0
                  ? `${(tier.next - currentPoints).toLocaleString()} pts to ${nextTierName}`
                  : "Max tier reached!"}
              </p>
            </div>
            <Progress
              value={Math.min(progressToNext, 100)}
              className="mt-2 h-3 w-full max-w-64 bg-primary-foreground/20 ml-auto"
            />
            <p className="mt-1 text-xs text-primary-foreground/60">
              {currentPoints.toLocaleString()} / {tier.next.toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
