import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, Loader2, MinusCircle, PlusCircle } from "lucide-react";
import { usePointsTransactions } from "@/hooks/usePoints";

export function PointsHistory() {
  const { data: transactions, isLoading } = usePointsTransactions();

  return (
    <Card className="shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-xl">
          <Gift className="h-5 w-5 text-primary" />
          Points History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        ) : !transactions?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">No activity yet. Start earning points!</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
            {transactions.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      t.type === "redemption" ? "bg-destructive/10" : "bg-primary/10"
                    }`}
                  >
                    {t.type === "redemption" ? (
                      <MinusCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <PlusCircle className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground capitalize truncate">
                      {t.description || t.type}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      {t.event_type && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {t.event_type}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-sm font-bold tabular-nums shrink-0 ml-2 ${
                    t.type === "redemption" ? "text-destructive" : "text-primary"
                  }`}
                >
                  {t.type === "redemption" ? "−" : "+"}
                  {t.points} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
