import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2, Clock, MinusCircle, PlusCircle, History, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMemberHours, useHoursTransactions } from "@/hooks/useMemberHours";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { sendNotificationEmail } from "@/hooks/useNotificationEmail";

function TransactionHistory({ userId }: { userId: string }) {
  const { data: transactions, isLoading } = useHoursTransactions(userId);
  if (isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin" />;
  if (!transactions?.length) return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
  return (
    <div className="space-y-2 max-h-60 overflow-y-auto">
      {transactions.map((t) => (
        <div key={t.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
          <div className="flex items-center gap-2">
            {t.type === "deduction" ? <MinusCircle className="h-4 w-4 text-destructive" /> : <PlusCircle className="h-4 w-4 text-primary" />}
            <span className="capitalize">{t.type}</span>
            {t.note && <span className="text-muted-foreground">— {t.note}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className={t.type === "deduction" ? "text-destructive" : "text-primary"}>
              {t.type === "deduction" ? "-" : "+"}{t.hours} hrs
            </span>
            <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberHoursForm({ onSave, onCancel, profiles }: { onSave: (data: any) => void; onCancel: () => void; profiles: any[] }) {
  const [form, setForm] = useState({ user_id: "", hours_purchased: 0 });
  return (
    <div className="space-y-4">
      <div>
        <Label>Member</Label>
        <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
          <SelectTrigger><SelectValue placeholder="Select a member" /></SelectTrigger>
          <SelectContent>
            {profiles.map((p: any) => (
              <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.user_id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Hours Purchased</Label><Input type="number" step="0.5" value={form.hours_purchased} onChange={(e) => setForm({ ...form, hours_purchased: Number(e.target.value) })} /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.user_id || form.hours_purchased <= 0}>Add Member</Button>
      </div>
    </div>
  );
}

function AdjustHoursForm({ member, onSave, onCancel }: { member: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ type: "deduction" as string, hours: 0, note: "" });
  const remaining = member.hours_purchased - member.hours_used;
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted p-3">
        <p className="text-sm text-muted-foreground">Member: <span className="font-medium text-foreground">{member.display_name}</span></p>
        <p className="text-sm text-muted-foreground">Remaining: <span className="font-medium text-foreground">{remaining} hrs</span></p>
      </div>
      <div>
        <Label>Action</Label>
        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="deduction">Deduct Hours</SelectItem>
            <SelectItem value="purchase">Add Hours</SelectItem>
            <SelectItem value="adjustment">Adjustment</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Hours</Label><Input type="number" step="0.5" min="0" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} /></div>
      <div><Label>Note (optional)</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Bay session 2hrs" /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={form.hours <= 0}>Confirm</Button>
      </div>
    </div>
  );
}

export function AdminMembersTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: memberHours, isLoading } = useMemberHours();
  const [adjustingMember, setAdjustingMember] = useState<any>(null);
  const [viewingHistory, setViewingHistory] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState<string | null>(null);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);

  const loadProfiles = async () => {
    const { data } = await supabase.from("profiles").select("user_id, display_name, email");
    setAllProfiles(data ?? []);
  };

  const handleAddMember = async (data: any) => {
    const { data: existing } = await supabase
      .from("member_hours")
      .select("id, hours_purchased")
      .eq("user_id", data.user_id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("member_hours")
        .update({ hours_purchased: existing.hours_purchased + data.hours_purchased })
        .eq("id", existing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("member_hours").insert({
        user_id: data.user_id,
        hours_purchased: data.hours_purchased,
        hours_used: 0,
      });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    const { data: htxn } = await supabase.from("hours_transactions").insert({
      user_id: data.user_id,
      type: "purchase",
      hours: data.hours_purchased,
      note: "Initial hours setup",
      created_by: user?.id,
    }).select("id").single();

    // Create revenue transaction for prepaid hours purchase
    try {
      await supabase.from("revenue_transactions").insert({
        transaction_type: "payment" as any,
        amount: 0, // Admin-side entry; amount can be updated if price is known
        currency: "INR",
        user_id: data.user_id,
        hours_transaction_id: htxn?.id || null,
        description: `Prepaid hours purchase - ${data.hours_purchased}h`,
        status: "confirmed",
      });
    } catch (e) {
      console.error("Failed to create revenue transaction:", e);
    }
    toast({ title: "Member hours added" });
    queryClient.invalidateQueries({ queryKey: ["member_hours"] });
    setDialogOpen(null);
  };

  const handleAdjustHours = async (data: any) => {
    const member = adjustingMember;
    if (!member) return;
    const newPurchased = data.type === "purchase" || (data.type === "adjustment" && data.hours > 0)
      ? member.hours_purchased + data.hours : member.hours_purchased;
    const newUsed = data.type === "deduction" ? member.hours_used + data.hours : member.hours_used;

    const { error } = await supabase.from("member_hours").update({
      hours_purchased: newPurchased,
      hours_used: newUsed,
    }).eq("user_id", member.user_id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    const { data: htxn } = await supabase.from("hours_transactions").insert({
      user_id: member.user_id,
      type: data.type,
      hours: data.hours,
      note: data.note || null,
      created_by: user?.id,
    }).select("id").single();

    // Create revenue transaction for purchase-type adjustments
    if (data.type === "purchase") {
      try {
        await supabase.from("revenue_transactions").insert({
          transaction_type: "payment" as any,
          amount: 0,
          currency: "INR",
          user_id: member.user_id,
          hours_transaction_id: htxn?.id || null,
          description: `Prepaid hours purchase - ${data.hours}h${data.note ? ` (${data.note})` : ""}`,
          status: "confirmed",
        });
      } catch (e) {
        console.error("Failed to create revenue transaction:", e);
      }
    }

    if (data.type === "deduction") {
      const remaining = newPurchased - newUsed;
      await supabase.from("notifications").insert({
        user_id: member.user_id,
        title: "Hours Deducted",
        message: `${data.hours} hour(s) have been deducted. You have ${remaining} hour(s) remaining.${data.note ? ` Note: ${data.note}` : ""}`,
        type: "usage",
      });
      if (remaining <= 3 && remaining > 0) {
        await supabase.from("notifications").insert({
          user_id: member.user_id,
          title: "⚠️ Low Hours Alert",
          message: `You only have ${remaining} hour(s) remaining. Please purchase more hours to continue.`,
          type: "warning",
        });
      } else if (remaining <= 0) {
        await supabase.from("notifications").insert({
          user_id: member.user_id,
          title: "🚨 No Hours Remaining",
          message: "Your hours balance has been fully used. Please purchase more hours.",
          type: "critical",
        });
      }
    }

    toast({ title: "Hours updated" });
    queryClient.invalidateQueries({ queryKey: ["member_hours"] });
    queryClient.invalidateQueries({ queryKey: ["hours_transactions", member.user_id] });
    setAdjustingMember(null);
    setDialogOpen(null);
  };

  const handleDeleteMember = async (userId: string) => {
    await supabase.from("hours_transactions").delete().eq("user_id", userId);
    const { error } = await supabase.from("member_hours").delete().eq("user_id", userId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Member removed" });
    queryClient.invalidateQueries({ queryKey: ["member_hours"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen === "member"} onOpenChange={(open) => { setDialogOpen(open ? "member" : null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => loadProfiles()}><Plus className="mr-2 h-4 w-4" />Add Member Hours</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Add Member Hours</DialogTitle></DialogHeader>
            <MemberHoursForm profiles={allProfiles} onSave={handleAddMember} onCancel={() => setDialogOpen(null)} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={dialogOpen === "adjust"} onOpenChange={(open) => { setDialogOpen(open ? "adjust" : null); if (!open) setAdjustingMember(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adjust Hours</DialogTitle></DialogHeader>
          {adjustingMember && <AdjustHoursForm member={adjustingMember} onSave={handleAdjustHours} onCancel={() => { setDialogOpen(null); setAdjustingMember(null); }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen === "history"} onOpenChange={(open) => { setDialogOpen(open ? "history" : null); if (!open) setViewingHistory(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Transaction History</DialogTitle></DialogHeader>
          {viewingHistory && <TransactionHistory userId={viewingHistory} />}
        </DialogContent>
      </Dialog>

      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <div className="space-y-3">
          {(memberHours ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No members with hours packages yet.</p>}
          {(memberHours ?? []).map((member) => {
            const remaining = member.hours_purchased - member.hours_used;
            return (
              <Card key={member.id} className="shadow-elegant">
                <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h3 className="font-medium text-foreground">{member.display_name}</h3>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {remaining} hrs remaining</span>
                      <span>Purchased: {member.hours_purchased} hrs</span>
                      <span>Used: {member.hours_used} hrs</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => { setAdjustingMember(member); setDialogOpen("adjust"); }}>
                      <MinusCircle className="mr-1 h-4 w-4" />Adjust
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => { setViewingHistory(member.user_id); setDialogOpen("history"); }}>
                      <History className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleDeleteMember(member.user_id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
