import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, History, MinusCircle, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useHoursTransactions } from "@/hooks/useMemberHours";
import { sendNotificationEmail } from "@/hooks/useNotificationEmail";
import { supabase } from "@/integrations/supabase/client";
import { recordRevenue } from "@/lib/revenue";

const ADJUST_REASONS = ["Correction", "Comp", "Refund", "Walk-in", "Missed booking", "Other"] as const;
const PURCHASE_PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Complimentary"] as const;

type Member = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  preferred_city: string | null;
  hours_purchased: number;
  hours_used: number;
};

type Adjustment = {
  type: string;
  hours: number;
  note: string;
  reason: string;
  service_date: string;
  amount: number;
  payment_method: string;
};

function HoursHistory({ userId }: { userId: string }) {
  const { data, isLoading } = useHoursTransactions(userId);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading history…</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
  return (
    <div className="space-y-2">
      {data.map((transaction) => (
        <div key={transaction.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
          <div className="flex min-w-0 items-start gap-2">
            {transaction.type === "deduction" ? <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <PlusCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <div><p className="capitalize">{transaction.type}</p><p className="text-xs text-muted-foreground">{transaction.note || "—"}</p></div>
          </div>
          <div className="shrink-0 text-right"><p>{transaction.hours} hrs</p><p className="text-xs text-muted-foreground">{new Date(transaction.created_at).toLocaleDateString()}</p></div>
        </div>
      ))}
    </div>
  );
}

function AdjustHoursForm({ member, onSave, onCancel }: { member: Member; onSave: (data: Adjustment) => void; onCancel: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<Adjustment>({ type: "deduction", hours: 0, note: "", reason: "", service_date: today, amount: 0, payment_method: "" });
  const isPurchase = form.type === "purchase";
  const isDeduction = form.type === "deduction";
  const complimentary = form.payment_method === "Complimentary";
  const valid = form.hours > 0 && Boolean(form.reason) && Boolean(form.note.trim()) && (!isDeduction || Boolean(form.service_date)) && (!isPurchase || (Boolean(form.payment_method) && (complimentary || form.amount > 0)));
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted p-3 text-sm"><p>{member.display_name || "Member"}</p><p className="text-muted-foreground">Remaining: {member.hours_purchased - member.hours_used} hrs</p></div>
      <div><Label>Action</Label><Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="deduction">Deduct Hours</SelectItem><SelectItem value="purchase">Add Hours</SelectItem><SelectItem value="adjustment">Adjustment</SelectItem></SelectContent></Select></div>
      <div><Label>Hours</Label><Input type="number" min="0" step="0.5" value={form.hours || ""} onChange={(event) => setForm({ ...form, hours: Number(event.target.value) })} onBlur={() => form.hours < 0 && setForm({ ...form, hours: 0 })} /></div>
      <div><Label>Reason</Label><Select value={form.reason} onValueChange={(reason) => setForm({ ...form, reason })}><SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger><SelectContent>{ADJUST_REASONS.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select></div>
      {isPurchase && <div className="grid gap-3 sm:grid-cols-2"><div><Label>Paid By</Label><Select value={form.payment_method} onValueChange={(payment_method) => setForm({ ...form, payment_method, amount: payment_method === "Complimentary" ? 0 : form.amount })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{PURCHASE_PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent></Select></div><div><Label>Amount Collected</Label><Input type="number" min="0" step="0.01" disabled={complimentary} value={form.amount || ""} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} onBlur={() => form.amount < 0 && setForm({ ...form, amount: 0 })} /></div></div>}
      {isDeduction && <div><Label>Service Date</Label><Input type="date" max={today} value={form.service_date} onChange={(event) => setForm({ ...form, service_date: event.target.value })} /></div>}
      <div><Label>Note</Label><Input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Details for the audit trail" /></div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button disabled={!valid} onClick={() => onSave({ ...form, note: form.note.trim() })}>Confirm</Button></div>
    </div>
  );
}

export function MemberHoursManager({ member, mode, onClose }: { member: Member; mode: "adjust" | "history"; onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: lowHoursThreshold = 2 } = useQuery({
    queryKey: ["admin_config", "low_hours_threshold"],
    queryFn: async () => {
      const { data } = await supabase.from("admin_config").select("value").eq("key", "low_hours_threshold").maybeSingle();
      return Number.parseFloat(data?.value || "2");
    },
  });
  const memberId = member.user_id ?? member.id;

  const save = async (adjustment: Adjustment) => {
    const { data: existing, error: readError } = await supabase.from("member_hours").select("id, hours_purchased, hours_used").eq("user_id", memberId).maybeSingle();
    if (readError) throw readError;
    const purchased = existing?.hours_purchased ?? member.hours_purchased;
    const used = existing?.hours_used ?? member.hours_used;
    const nextPurchased = adjustment.type === "purchase" || (adjustment.type === "adjustment" && adjustment.hours > 0) ? purchased + adjustment.hours : purchased;
    const nextUsed = adjustment.type === "deduction" ? used + adjustment.hours : used;
    const writeResult = existing
      ? await supabase.from("member_hours").update({ hours_purchased: nextPurchased, hours_used: nextUsed }).eq("id", existing.id)
      : await supabase.from("member_hours").insert({ user_id: memberId, hours_purchased: nextPurchased, hours_used: nextUsed });
    if (writeResult.error) throw writeResult.error;
    const { data: transaction, error: transactionError } = await supabase.from("hours_transactions").insert({ user_id: memberId, type: adjustment.type, hours: adjustment.hours, note: adjustment.note, reason: adjustment.reason, service_date: adjustment.type === "deduction" ? adjustment.service_date : null, created_by: user?.id }).select("id").single();
    if (transactionError) throw transactionError;
    if (adjustment.type === "purchase" && adjustment.amount > 0) {
      await recordRevenue({ sourceRef: `hours_purchase:${transaction.id}`, transactionType: "purchase", amount: adjustment.amount, description: `Prepaid hours purchase - ${adjustment.hours}h (${adjustment.note})`, city: member.preferred_city, userId: memberId, hoursTransactionId: transaction.id, gatewayName: adjustment.payment_method || "Offline", metadata: { offline: true, hours: adjustment.hours, payment_method: adjustment.payment_method || null } });
    }
    if (adjustment.type === "deduction") {
      const remaining = nextPurchased - nextUsed;
      const notification = await supabase.from("notifications").insert({ user_id: memberId, title: "Hours Deducted", message: `${adjustment.hours} hour(s) have been deducted. You have ${remaining} hour(s) remaining.`, type: "usage" });
      if (notification.error) console.error("Hours notification failed:", notification.error.message);
      if (remaining <= lowHoursThreshold) sendNotificationEmail({ user_id: memberId, template: "low_hours_alert", subject: "Low Hours Alert", data: { hours_remaining: Math.max(0, remaining), purchase_url: `${window.location.origin}/dashboard` } });
    }
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["admin_all_users"] }), queryClient.invalidateQueries({ queryKey: ["member_hours"] }), queryClient.invalidateQueries({ queryKey: ["hours_transactions", memberId] })]);
    toast({ title: "Hours updated" });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{mode === "adjust" ? "Adjust Hours" : "Hours History"}</DialogTitle></DialogHeader>
        {mode === "adjust" ? <AdjustHoursForm member={member} onSave={(data) => save(data).catch((error: Error) => toast({ title: "Hours update failed", description: error.message, variant: "destructive" }))} onCancel={onClose} /> : <HoursHistory userId={memberId} />}
      </DialogContent>
    </Dialog>
  );
}

export function HoursActionLabel({ mode }: { mode: "adjust" | "history" }) {
  return mode === "adjust" ? <><Clock className="mr-2 h-4 w-4" />Adjust Hours</> : <><History className="mr-2 h-4 w-4" />Hours History</>;
}