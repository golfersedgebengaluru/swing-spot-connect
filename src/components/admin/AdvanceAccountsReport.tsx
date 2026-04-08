import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, Search, Wallet } from "lucide-react";
import { useAllAdvanceBalances } from "@/hooks/useAdvanceAccount";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { CustomerFinanceDialog } from "./CustomerFinanceDialog";

interface Props {
  city?: string;
}

export function AdvanceAccountsReport({ city }: Props) {
  const currency = useDefaultCurrency();
  const { data: balances, isLoading } = useAllAdvanceBalances(city);
  const [search, setSearch] = useState("");

  // Fetch profile names for the customer IDs
  const customerIds = useMemo(() => (balances ?? []).map((b) => b.customer_id), [balances]);
  const { data: profiles } = useQuery({
    queryKey: ["advance_profiles", customerIds],
    enabled: customerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email")
        .or(`id.in.(${customerIds.join(",")}),user_id.in.(${customerIds.join(",")})`);
      const map = new Map<string, any>();
      for (const p of (data ?? [])) {
        if (p.user_id) map.set(p.user_id, p);
        map.set(p.id, p);
      }
      return map;
    },
  });

  const [financeDialogUser, setFinanceDialogUser] = useState<{ id: string; name: string; city: string } | null>(null);

  const enriched = useMemo(() => {
    if (!balances) return [];
    return balances.map((b) => {
      const profile = profiles?.get(b.customer_id);
      return {
        ...b,
        display_name: profile?.display_name || "Unknown",
        email: profile?.email || "",
      };
    }).filter((b) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return b.display_name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q);
    }).sort((a, b) => b.balance - a.balance);
  }, [balances, profiles, search]);

  const totalBalance = enriched.reduce((sum, b) => sum + b.balance, 0);

  const handleCsvExport = () => {
    if (!enriched.length) return;
    const headers = ["Customer", "Email", "Balance", "Last Transaction", "City"];
    const rows = enriched.map((b) => [
      b.display_name, b.email, b.balance.toFixed(2),
      format(new Date(b.last_transaction_date), "yyyy-MM-dd"), b.city,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `advance_accounts_${city || "all"}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Customer Advance Accounts
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 w-48" />
            </div>
            <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={!enriched.length}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {enriched.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No customers with advance balances.</p>
          ) : (
            <>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Last Transaction</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enriched.map((b) => (
                      <TableRow key={b.customer_id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{b.display_name}</div>
                            <div className="text-xs text-muted-foreground">{b.email}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{currency.format(b.balance)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(b.last_transaction_date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-sm">{b.city}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setFinanceDialogUser({ id: b.customer_id, name: b.display_name, city: b.city })}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end mt-3">
                <p className="text-sm text-muted-foreground">
                  Total: <span className="font-medium text-foreground">{currency.format(totalBalance)}</span> across {enriched.length} customers
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {financeDialogUser && (
        <CustomerFinanceDialog
          open={!!financeDialogUser}
          onOpenChange={(open) => { if (!open) setFinanceDialogUser(null); }}
          userId={financeDialogUser.id}
          displayName={financeDialogUser.name}
          city={financeDialogUser.city}
        />
      )}
    </div>
  );
}
