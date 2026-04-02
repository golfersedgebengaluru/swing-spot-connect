import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Calendar, ShoppingBag, Users, Trophy } from "lucide-react";
import { useLoyaltyEarningRules } from "@/hooks/useLoyalty";
import { Loader2 } from "lucide-react";

const iconMap: Record<string, any> = {
  calendar: Calendar,
  "shopping-bag": ShoppingBag,
  users: Users,
  trophy: Trophy,
  star: Star,
};

export function EarnMethodsCard() {
  const { data: rules, isLoading } = useLoyaltyEarningRules();

  const activeRules = (rules ?? []).filter((r) => r.is_active);

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
        <CardTitle className="font-display text-xl">How to Earn Points</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {activeRules.map((rule) => {
            const IconComp = iconMap[rule.event_type] || Star;
            return (
              <div key={rule.id} className="flex items-center gap-4 rounded-xl border border-border p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <IconComp className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{rule.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {rule.base_rate} pts/{rule.rate_unit}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        {activeRules.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">No earning rules configured.</p>
        )}
      </CardContent>
    </Card>
  );
}
