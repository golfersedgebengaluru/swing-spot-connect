import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Wallet, PlusCircle, MinusCircle, ArrowUpRight, ArrowDownLeft, TrendingUp, FileText } from "lucide-react";
import { useAdvanceBalance, useAdvanceTransactions, useAddAdvanceCredit } from "@/hooks/useAdvanceAccount";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  displayName: string;
  city?: string;
}

export function CustomerFinanceDialog({ open, onOpenChange, userId, displayName, city }: Props) {
  const currency = useDefaultCurrency();
  const { toast } = useToast();
  const { data: advanceBalance, isLoading: balLoading } = useAdvanceBalance(userId);
  const { data: advanceTransactions, isLoading: txnLoading } = useAdvanceTransactions(userId);
  const addCredit = useAddAdvanceCredit();

  // Lifetime revenue
  const { data: lifetimeRevenue } = useQuery({
    queryKey: ["customer_lifetime_revenue", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("revenue_transactions")
        .select("amount")
        .eq("user_id", userId)
        .eq("status", "confirmed");
      return (data ?? []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);
    },
  });

  // Outstanding credit notes
  const { data: outstandingCreditNotes } = useQuery({
    queryKey: ["customer_credit_notes", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_number, total, invoice_date, credit_note_disposition")
        .eq("customer_user_id", userId)
        .eq("invoice_type", "credit_note")
        .eq("status", "issued")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Combined transaction history (invoices + advance transactions)
  const { data: invoiceHistory } = useQuery({
    queryKey: ["customer_invoice_history", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_number, total, invoice_date, invoice_type, status, payment_method")
        .eq("customer_user_id", userId)
        .order("invoice_date", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  // Manual advance deposit form
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;
    try {
      await addCredit.mutateAsync({
        customerId: userId,
        amount: amt,
        sourceType: "manual_deposit",
        description: depositNote || "Manual advance deposit",
        city: city || "Default",
      });
      toast({ title: "Advance credit added", description: `${currency.format(amt)} credited to ${displayName}'s advance account.` });
      setShowDepositForm(false);
      setDepositAmount("");
      setDepositNote("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // Merge advance transactions and invoices for combined timeline
  const combinedHistory = (() => {
    const items: { date: string; type: string; description: string; amount: number; variant: "credit" | "debit" | "neutral" }[] = [];

    for (const inv of (invoiceHistory ?? [])) {
      items.push({
        date: inv.invoice_date,
        type: inv.invoice_type === "credit_note" ? "Credit Note" : "Invoice",
        description: inv.invoice_number,
        amount: Number(inv.total),
        variant: inv.invoice_type === "credit_note" ? "credit" : "debit",
      });
    }

    for (const t of (advanceTransactions ?? [])) {
      items.push({
        date: t.created_at.split("T")[0],
        type: t.source_type === "credit_note" ? "CN → Advance" : t.source_type === "manual_deposit" ? "Advance Deposit" : "Advance Drawdown",
        description: t.description || "",
        amount: Number(t.amount),
        variant: t.transaction_type === "credit" ? "credit" : "debit",
      });
    }

    items.sort((a, b) => b.date.localeCompare(a.date));
    return items.slice(0, 50);
  })();

  const isLoading = balLoading || txnLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Finance — {displayName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Wallet className="h-3.5 w-3.5" /> Advance Balance
                  </div>
                  <p className="text-lg font-semibold">{currency.format(advanceBalance ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <TrendingUp className="h-3.5 w-3.5" /> Lifetime Revenue
                  </div>
                  <p className="text-lg font-semibold">{currency.format(lifetimeRevenue ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <FileText className="h-3.5 w-3.5" /> Credit Notes
                  </div>
                  <p className="text-lg font-semibold">{outstandingCreditNotes?.length ?? 0}</p>
                </CardContent>
              </Card>
            </div>

            {/* Advance Account section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">Advance Account</h3>
                <Button size="sm" variant="outline" onClick={() => setShowDepositForm(!showDepositForm)}>
                  <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add Deposit
                </Button>
              </div>

              {showDepositForm && (
                <Card className="mb-3">
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Amount</Label>
                        <Input type="number" min="0" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="mt-1" placeholder="0.00" />
                      </div>
                      <div>
                        <Label className="text-xs">Note</Label>
                        <Input value={depositNote} onChange={(e) => setDepositNote(e.target.value)} className="mt-1" placeholder="e.g. Corporate deposit" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setShowDepositForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleDeposit} disabled={addCredit.isPending || !depositAmount}>
                        {addCredit.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                        Add Credit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Advance transaction history */}
              {(advanceTransactions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No advance transactions yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(advanceTransactions ?? []).map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {t.transaction_type === "credit" ? (
                          <ArrowDownLeft className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5 text-destructive shrink-0" />
                        )}
                        <span className="truncate text-muted-foreground">{t.description || t.source_type}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={t.transaction_type === "credit" ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                          {t.transaction_type === "credit" ? "+" : "-"}{currency.format(Number(t.amount))}
                        </span>
                        <span className="text-xs text-muted-foreground">{format(new Date(t.created_at), "dd MMM")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Combined History */}
            <div>
              <h3 className="text-sm font-medium mb-3">Transaction History</h3>
              {combinedHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {combinedHistory.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant={item.variant === "credit" ? "default" : item.variant === "debit" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                          {item.type}
                        </Badge>
                        <span className="truncate text-muted-foreground">{item.description}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={item.variant === "credit" ? "text-green-600 font-medium" : item.variant === "debit" ? "text-foreground font-medium" : "text-muted-foreground"}>
                          {currency.format(item.amount)}
                        </span>
                        <span className="text-xs text-muted-foreground">{format(new Date(item.date), "dd MMM yyyy")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
