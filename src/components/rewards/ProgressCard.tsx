import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, Check, Lock } from "lucide-react";
import { useLoyaltyMilestones } from "@/hooks/useLoyalty";
import { useUserLoyaltyProgress } from "@/hooks/useLoyaltyProgress";
import { Loader2 } from "lucide-react";

export function ProgressCard() {
  const { data: milestones, isLoading: loadingMilestones } = useLoyaltyMilestones();
  const { data: progress, isLoading: loadingProgress } = useUserLoyaltyProgress();

  const isLoading = loadingMilestones || loadingProgress;
  const hoursLogged = progress?.hours_logged ?? 0;
  const visitCount = progress?.visit_count ?? 0;
  const achievedIds = (progress?.milestones_achieved as string[]) ?? [];

  const activeMilestones = (milestones ?? []).filter((m) => m.is_active);

  if (isLoading) {
    return (
      <Card className="shadow-elegant">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-xl">
          <Target className="h-5 w-5 text-primary" />
          Monthly Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{hoursLogged.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Hours Logged</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{visitCount}</p>
            <p className="text-xs text-muted-foreground">Visits</p>
          </div>
        </div>

        {/* Milestones */}
        {activeMilestones.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Milestones</p>
            {activeMilestones.map((m) => {
              const achieved = achievedIds.includes(m.id);
              const progressPct = Math.min((hoursLogged / m.threshold_hours) * 100, 100);
              return (
                <div key={m.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {achieved ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={`text-sm ${achieved ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {m.name}
                      </span>
                    </div>
                    <Badge variant={achieved ? "default" : "secondary"} className="text-xs">
                      +{m.bonus_points} pts
                    </Badge>
                  </div>
                  <Progress value={progressPct} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {hoursLogged.toFixed(1)} / {m.threshold_hours}h
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
