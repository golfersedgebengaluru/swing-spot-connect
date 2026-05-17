import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Plus, Wallet, History, MinusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVendors, type Vendor } from "@/hooks/useVendors";
import {
  useAllVendorAdvanceBalances,
  useVendorAdvanceTransactions,
  useAddVendorAdvance,
  useSettleVendorAdvance,
} from "@/hooks/useVendorAdvances";
import { useExpenses } from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  city: string;
}

export function VendorAdvancesPanel({ city }: Props) {
  const { toast } = useToast();
  const { format } = useCurrency(city);
  const { data: vendors, isLoading: loadingVendors } = useVendors(city);
  const { data: balances } = useAllVendorAdvanceBalances(city);

  const [addOpen, setAddOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [historyVendor, setHistoryVendor] = useState<Vendor | null>(null);
  const [activeVendor, setActiveVendor] = useState<Vendor | null>(null);

  const balanceFor = (vendorId: string) =>
    balances?.find((b) => b.vendor_id === vendorId)?.balance ?? 0;

  if (loadingVendors) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" /> Vendor Advances
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Track advances paid to vendors and settle them against expenses.
        </p>
      </CardHeader>
      <CardContent>
        {!vendors?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No vendors yet. Add vendors from the Vendors tab first.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead className="text-right">Advance Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v) => {
                  const bal = balanceFor(v.id);
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{v.gstin || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={bal > 0 ? "default" : "outline"}>
                          {format(bal)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setActiveVendor(v); setAddOpen(true); }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Advance
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={bal <= 0}
                          onClick={() => { setActiveVendor(v); setSettleOpen(true); }}
                        >
                          <MinusCircle className="h-3 w-3 mr-1" /> Settle
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistoryVendor(v)}
                        >
                          <History className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {activeVendor && (
        <>
          <AddAdvanceDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            vendor={activeVendor}
            city={city}
            onDone={() => { setAddOpen(false); toast({ title: "Advance recorded" }); }}
          />
          <SettleAdvanceDialog
            open={settleOpen}
            onOpenChange={setSettleOpen}
            vendor={activeVendor}
            city={city}
            balance={balanceFor(activeVendor.id)}
            onDone={() => { setSettleOpen(false); toast({ title: "Settlement recorded" }); }}
          />
        </>
      )}

      <VendorHistorySheet
        vendor={historyVendor}
        onClose={() => setHistoryVendor(null)}
        city={city}
      />
    </Card>
  );
}

function AddAdvanceDialog({ open, onOpenChange, vendor, city, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendor: Vendor;
  city: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const add = useAddVendorAdvance();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    try {
      await add.mutateAsync({
        vendorId: vendor.id,
        amount: amt,
        description: notes || `Advance to ${vendor.name}`,
        city,
      });
      setAmount(""); setNotes("");
      onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Advance — {vendor.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Notes / Reference</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cheque #123, paid via UPI"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={add.isPending}>
            {add.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record Advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettleAdvanceDialog({ open, onOpenChange, vendor, city, balance, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendor: Vendor;
  city: string;
  balance: number;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const settle = useSettleVendorAdvance();
  const { format } = useCurrency(city);
  // Unsettled expenses for this vendor
  const { data: expensesPage } = useExpenses({ city, vendorId: vendor.id, pageSize: 100 });
  const unsettled = (expensesPage?.data ?? []).filter(
    (e: any) => Number(e.total) - Number(e.settled_amount || 0) > 0.01
  );

  const [expenseId, setExpenseId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const selectedExp = unsettled.find((e: any) => e.id === expenseId);
  const maxForExp = selectedExp
    ? Number(selectedExp.total) - Number(selectedExp.settled_amount || 0)
    : balance;

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (amt > balance + 0.01) {
      toast({ title: `Amount exceeds advance balance (${format(balance)})`, variant: "destructive" });
      return;
    }
    if (selectedExp && amt > maxForExp + 0.01) {
      toast({ title: `Amount exceeds expense outstanding (${format(maxForExp)})`, variant: "destructive" });
      return;
    }
    try {
      await settle.mutateAsync({
        vendorId: vendor.id,
        amount: amt,
        expenseId: expenseId || undefined,
        description: notes || `Settled from advance${selectedExp ? ` against expense ${selectedExp.id.slice(0, 8)}` : ""}`,
        city,
      });
      setAmount(""); setNotes(""); setExpenseId("");
      onDone();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settle from Advance — {vendor.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Available advance balance: <strong>{format(balance)}</strong>
          </p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Apply to expense (optional)</Label>
            <Select value={expenseId} onValueChange={(v) => {
              setExpenseId(v);
              const exp = unsettled.find((e: any) => e.id === v);
              if (exp) setAmount(String(Number(exp.total) - Number(exp.settled_amount || 0)));
            }}>
              <SelectTrigger>
                <SelectValue placeholder="No specific expense — generic drawdown" />
              </SelectTrigger>
              <SelectContent>
                {unsettled.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.expense_date} — {format(Number(e.total) - Number(e.settled_amount || 0))} outstanding
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={settle.isPending}>
            {settle.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Settle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorHistorySheet({ vendor, onClose, city }: {
  vendor: Vendor | null;
  onClose: () => void;
  city: string;
}) {
  const { format } = useCurrency(city);
  const { data: txns, isLoading } = useVendorAdvanceTransactions(vendor?.id);

  return (
    <Sheet open={!!vendor} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{vendor?.name} — Advance History</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          {isLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : !txns?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions yet.</p>
          ) : (
            <div className="space-y-2">
              {txns.map((t) => (
                <div key={t.id} className="flex justify-between items-start border-b pb-2 text-sm">
                  <div>
                    <div className="font-medium capitalize">
                      {t.source_type.replace("_", " ")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                    {t.description && (
                      <div className="text-xs mt-1">{t.description}</div>
                    )}
                  </div>
                  <Badge variant={t.transaction_type === "credit" ? "default" : "destructive"}>
                    {t.transaction_type === "credit" ? "+" : "-"}{format(Number(t.amount))}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
