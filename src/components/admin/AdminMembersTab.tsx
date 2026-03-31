import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { useAdmin } from "@/hooks/useAdmin";
import { useAdminCity } from "@/contexts/AdminCityContext";

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
  const { isAdmin, assignedCities } = useAdmin();
  const { selectedCity } = useAdminCity();
  const { data: allMemberHours, isLoading } = useMemberHours();

  // Filter members by city for site_admins
  const { data: memberHours } = useQuery({
    queryKey: ["member_hours_filtered", allMemberHours, isAdmin, assignedCities, selectedCity],
    enabled: !!allMemberHours,
    queryFn: async () => {
      if (!allMemberHours) return [];
      if (isAdmin && !selectedCity) return allMemberHours;

      const citiesToFilter = isAdmin
        ? (selectedCity ? [selectedCity] : [])
        : (selectedCity ? [selectedCity] : assignedCities);

      if (citiesToFilter.length === 0) return allMemberHours;

      // Find users affiliated with these cities
      const { data: cityBookings } = await supabase
        .from("bookings")
        .select("user_id, city")
        .in("city", citiesToFilter);
      const { data: cityProfiles } = await supabase
        .from("profiles")
        .select("user_id, preferred_city")
        .in("preferred_city", citiesToFilter);

      const validUserIds = new Set([
        ...(cityBookings ?? []).map((b: any) => b.user_id),
        ...(cityProfiles ?? []).filter((p: any) => p.user_id).map((p: any) => p.user_id),
      ]);

      return allMemberHours.filter((m) => validUserIds.has(m.user_id));
    },
  });
  const { data: lowHoursThreshold } = useQuery({
    queryKey: ["admin_config", "low_hours_threshold"],
    queryFn: async () => {
      const { data } = await supabase.from("admin_config").select("value").eq("key", "low_hours_threshold").single();
      return parseFloat(data?.value || "2");
    },
  });
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
      const threshold = lowHoursThreshold ?? 2;
      await supabase.from("notifications").insert({
        user_id: member.user_id,
        title: "Hours Deducted",
        message: `${data.hours} hour(s) have been deducted. You have ${remaining} hour(s) remaining.${data.note ? ` Note: ${data.note}` : ""}`,
        type: "usage",
      });
      if (remaining <= threshold && remaining > 0) {
        await supabase.from("notifications").insert({
          user_id: member.user_id,
          title: "⚠️ Low Hours Alert",
          message: `You only have ${remaining} hour(s) remaining. Please purchase more hours to continue.`,
          type: "warning",
        });
        // Send low hours alert email
        sendNotificationEmail({
          user_id: member.user_id,
          template: "low_hours_alert",
          subject: "Low Hours Alert",
          data: {
            hours_remaining: remaining,
            purchase_url: `${window.location.origin}/dashboard`,
          },
        });
      } else if (remaining <= 0) {
        await supabase.from("notifications").insert({
          user_id: member.user_id,
          title: "🚨 No Hours Remaining",
          message: "Your hours balance has been fully used. Please purchase more hours.",
          type: "critical",
        });
        // Send low hours alert email for zero balance too
        sendNotificationEmail({
          user_id: member.user_id,
          template: "low_hours_alert",
          subject: "Low Hours Alert",
          data: {
            hours_remaining: 0,
            purchase_url: `${window.location.origin}/dashboard`,
          },
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
        <>
          {(memberHours ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No members with hours packages yet.</p>}
          {(memberHours ?? []).length > 0 && (
            <div className="rounded-lg border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium w-[40%]"><span className="pl-[44px]">Member</span></TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-center">Purchased</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-center">Used</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-center">Remaining</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(memberHours ?? []).map((member, idx) => {
                    const remaining = member.hours_purchased - member.hours_used;
                    const avatarColors = [
                      "bg-blue-500/15 text-blue-400",
                      "bg-emerald-500/15 text-emerald-400",
                      "bg-amber-500/15 text-amber-400",
                      "bg-purple-500/15 text-purple-400",
                      "bg-rose-500/15 text-rose-400",
                      "bg-cyan-500/15 text-cyan-400",
                    ];
                    const avatarClass = avatarColors[idx % avatarColors.length];
                    const initials = (member.display_name || "?")
                      .split(" ")
                      .map((w: string) => w[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase();

                    let pillClass = "bg-green-500/15 text-green-400";
                    let dotClass = "bg-green-400";
                    if (remaining <= 1) {
                      pillClass = "bg-red-500/15 text-red-400";
                      dotClass = "bg-red-400";
                    } else if (remaining <= 3) {
                      pillClass = "bg-amber-500/15 text-amber-400";
                      dotClass = "bg-amber-400";
                    }

                    return (
                      <TableRow key={member.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${avatarClass}`}>
                              {initials}
                            </div>
                            <span className="font-normal text-foreground">{member.display_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-center text-sm text-muted-foreground">{member.hours_purchased} hrs</TableCell>
                        <TableCell className="py-3 text-center text-sm text-muted-foreground">{member.hours_used} hrs</TableCell>
                        <TableCell className="py-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${pillClass}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                            {remaining} hrs
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <div className="inline-flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => { setAdjustingMember(member); setDialogOpen("adjust"); }}>
                              <Clock className="mr-1 h-3.5 w-3.5" />Adjust
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => { setViewingHistory(member.user_id); setDialogOpen("history"); }}>
                              <History className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteMember(member.user_id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
