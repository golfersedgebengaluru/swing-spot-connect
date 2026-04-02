import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useLoyaltyTransactions } from "@/hooks/useLoyalty";
import { format } from "date-fns";

export function LoyaltyTransactionsTab() {
  const { data: transactions, isLoading } = useLoyaltyTransactions(100);

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Full audit trail of all point transactions.</p>
      {(transactions ?? []).length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No transactions yet.</p>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Final</TableHead>
                <TableHead>Multipliers</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(transactions ?? []).map((tx: any) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm whitespace-nowrap">{format(new Date(tx.created_at), "dd MMM yy HH:mm")}</TableCell>
                  <TableCell className="text-sm">{tx.profiles?.display_name || tx.profiles?.email || tx.user_id?.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={tx.type === "allocation" ? "default" : tx.type === "redemption" ? "secondary" : "outline"}>
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{tx.event_type ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm">{tx.base_points ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{tx.type === "redemption" ? `-${tx.points}` : `+${tx.points}`}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tx.multipliers_applied && Array.isArray(tx.multipliers_applied) && tx.multipliers_applied.length > 0
                      ? tx.multipliers_applied.map((m: any) => `${m.name || m} ×${m.value || ""}`).join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{tx.reason || tx.description || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
