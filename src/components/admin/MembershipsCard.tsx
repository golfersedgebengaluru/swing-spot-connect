import { useMemo, useState } from "react";
import { format } from "date-fns";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCancelMembership, useCustomerMemberships, type MembershipRow } from "@/hooks/useMemberships";
import { recognizedInRange } from "@/lib/membership-recognition";
import { getCurrencySymbol } from "@/lib/currencies";
import { useBays } from "@/hooks/useBookings";

const REFUND_METHODS = ["Cash", "UPI", "Card", "Bank transfer", "Online gateway"];
const day = (d: string) => format(new Date(`${d}T00:00:00`), "d MMM yyyy");
const formatMoney = (symbol: string) => (n: number) => `${symbol}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function statusLabel(m: MembershipRow, today: string) {
  if (m.status === "cancelled") return { text: `Cancelled ${m.cancelled_on ? day(m.cancelled_on) : ""}`, variant: "destructive" as const };
  if (m.status === "void") return { text: "Invoice removed", variant: "outline" as const };
  if (m.starts_on > today) return { text: `Starts ${day(m.starts_on)}`, variant: "secondary" as const };
  if (m.ends_on < today) return { text: "Ended", variant: "outline" as const };
  return { text: "Active", variant: "default" as const };
}

function hoursLabel(m: MembershipRow) {
  if (Number(m.hours) === 0) return null;
  switch (m.hours_state) {
    case "active": return `${Number(m.hours_remaining)} of ${Number(m.hours)} hrs left`;
    case "expired": return `${Number(m.hours_closed)} unused hrs expired`;
    case "kept": return `${Number(m.hours_closed)} unused hrs kept`;
    default: return `${Number(m.hours_closed)} unused hrs removed`;
  }
}

function CancelMembershipDialog({ membership, symbol, onClose }: { membership: MembershipRow; symbol: string; onClose: () => void }) {
  const money = formatMoney(symbol);
  const { toast } = useToast();
  const cancel = useCancelMembership();
  const today = format(new Date(), "yyyy-MM-dd");
  const [cancelledOn, setCancelledOn] = useState(today);
  const [refund, setRefund] = useState<number>(0);
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const amount = Number(membership.amount);

  const earned = useMemo(
    () => (cancelledOn ? recognizedInRange({ ...membership, status: "active" }, "1900-01-01", cancelledOn) : 0),
    [membership, cancelledOn],
  );
  const unearned = Math.max(Math.round((amount - earned) * 100) / 100, 0);

  const submit = async () => {
    if (!cancelledOn || cancelledOn < membership.sold_on || cancelledOn > today) {
      toast({ title: "Check the cancellation date", description: "It must be between the sale date and today.", variant: "destructive" });
      return;
    }
    if (refund < 0 || refund > amount) {
      toast({ title: "Check the refund", description: `It must be between ${money(0)} and ${money(amount)}.`, variant: "destructive" });
      return;
    }
    if (refund > 0 && !method) {
      toast({ title: "Choose how the refund was paid", variant: "destructive" });
      return;
    }
    try {
      const res = await cancel.mutateAsync({ membershipId: membership.id, cancelledOn, refundAmount: refund, refundMethod: method, note });
      toast({
        title: res.already_cancelled ? "Already cancelled" : "Membership cancelled",
        description: res.credit_note_number ? `Credit note ${res.credit_note_number} issued for ${money(Number(res.refund_amount))}.` : "No refund was recorded.",
      });
      onClose();
    } catch (err) {
      toast({ title: "Not cancelled", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {membership.label}</DialogTitle>
          <DialogDescription>
            Sold {day(membership.sold_on)} for {money(amount)}. Unused hours are removed and a credit note is issued for any refund.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="cancel-date">Cancellation date</Label>
            <Input id="cancel-date" type="date" min={membership.sold_on} max={today} value={cancelledOn} onChange={(e) => setCancelledOn(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Earned so far</p><p className="font-medium">{money(earned)}</p></div>
            <div><p className="text-xs text-muted-foreground">Not yet earned</p><p className="font-medium">{money(unearned)}</p></div>
          </div>
          <div>
            <Label htmlFor="refund-amount">Refund amount ({symbol})</Label>
            <Input id="refund-amount" type="number" min={0} max={amount} value={refund || ""}
              onChange={(e) => setRefund(e.target.value === "" ? 0 : Number(e.target.value))}
              onBlur={() => setRefund((r) => Math.min(Math.max(Math.round(r * 100) / 100, 0), amount))}
              placeholder="0 for no refund" />
          </div>
          {refund > 0 && (
            <div>
              <Label>Refund paid by</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{REFUND_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="cancel-note">Note (optional)</Label>
            <Textarea id="cancel-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Keep membership</Button>
          <Button variant="destructive" onClick={submit} disabled={cancel.isPending}>
            {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel membership"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Memberships sold from the go-live date on, with validity, hours left and a staff cancel action. */
export function MembershipsCard({ keys }: { keys: (string | null | undefined)[] }) {
  const { data: memberships = [] } = useCustomerMemberships(keys);
  const [cancelling, setCancelling] = useState<MembershipRow | null>(null);
  const { data: bays } = useBays();
  const symbolFor = (city: string) => getCurrencySymbol(bays?.find((b) => b.city === city)?.currency ?? "INR");
  const today = format(new Date(), "yyyy-MM-dd");
  if (memberships.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BadgeCheck className="h-5 w-5" />Memberships</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {memberships.map((m) => {
          const status = statusLabel(m, today);
          const hours = hoursLabel(m);
          const money = formatMoney(symbolFor(m.city));
          return (
            <div key={m.id} className="flex flex-col gap-2 border-t pt-3 text-sm first:border-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.label}</span>
                  <Badge variant={status.variant} className="text-[11px]">{status.text}</Badge>
                </div>
                <p className="text-muted-foreground">
                  {day(m.starts_on)} – {day(m.ends_on)} · {money(Number(m.amount))}
                  {hours ? ` · ${hours}` : ""}
                  {m.status === "cancelled" && Number(m.refund_amount) > 0 ? ` · refunded ${money(Number(m.refund_amount))}` : ""}
                </p>
              </div>
              {m.status === "active" && (
                <Button size="sm" variant="outline" className="min-h-9 shrink-0" onClick={() => setCancelling(m)}>Cancel membership</Button>
              )}
            </div>
          );
        })}
      </CardContent>
      {cancelling && <CancelMembershipDialog membership={cancelling} symbol={symbolFor(cancelling.city)} onClose={() => setCancelling(null)} />}
    </Card>
  );
}
