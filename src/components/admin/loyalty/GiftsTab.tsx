import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gift, Plus, Pencil, Trash2, Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGiftedRewards, useAutoGiftRules, useGrantGift, useSaveAutoGiftRule, useDeleteAutoGiftRule } from "@/hooks/useGiftedRewards";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function ManualGiftDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const grantGift = useGrantGift();
  const [form, setForm] = useState({ user_id: "", reward_name: "", reward_description: "", notes: "" });

  const { data: profiles } = useQuery({
    queryKey: ["profiles_for_gift"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, user_id, display_name, email").not("user_id", "is", null).order("display_name");
      return data ?? [];
    },
  });

  const handleSend = async () => {
    if (!form.user_id || !form.reward_name) { toast({ title: "Fill required fields", variant: "destructive" }); return; }
    try {
      await grantGift.mutateAsync({ ...form, gifted_by: user?.id, gift_type: "manual" });
      toast({ title: "🎁 Gift assigned!" });
      onClose();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Member *</Label>
        <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
          <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
          <SelectContent>
            {(profiles ?? []).map((p: any) => (
              <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Gift Name *</Label><Input value={form.reward_name} onChange={(e) => setForm({ ...form, reward_name: e.target.value })} placeholder="e.g. Free Golf Ball" /></div>
      <div><Label>Description</Label><Textarea value={form.reward_description} onChange={(e) => setForm({ ...form, reward_description: e.target.value })} placeholder="Details about the gift" /></div>
      <div><Label>Admin Note</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Internal note" /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSend} disabled={grantGift.isPending}>
          {grantGift.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Send className="mr-2 h-4 w-4" />Assign Gift
        </Button>
      </div>
    </div>
  );
}

function AutoRuleForm({ rule, onSave, onCancel }: { rule?: any; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: rule?.name ?? "",
    reward_name: rule?.reward_name ?? "",
    reward_description: rule?.reward_description ?? "",
    description: rule?.description ?? "",
    trigger_type: rule?.trigger_type ?? "system_event",
    trigger_event: rule?.trigger_event ?? "signup",
    trigger_date: rule?.trigger_date ?? "",
    trigger_event_id: rule?.trigger_event_id ?? "",
    is_active: rule?.is_active ?? true,
    max_per_user: rule?.max_per_user ?? 1,
    sort_order: rule?.sort_order ?? 0,
  });

  const { data: events } = useQuery({
    queryKey: ["events_for_gifts"],
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id, title, date").eq("is_active", true).order("date", { ascending: false });
      return data ?? [];
    },
    enabled: form.trigger_type === "configured_event",
  });

  const handleTriggerTypeChange = (type: string) => {
    const updates: any = { trigger_type: type };
    if (type === "system_event") {
      updates.trigger_event = "signup";
      updates.trigger_date = "";
      updates.trigger_event_id = "";
    } else if (type === "specific_date") {
      updates.trigger_event = "specific_date";
      updates.trigger_event_id = "";
    } else if (type === "configured_event") {
      updates.trigger_date = "";
    }
    setForm({ ...form, ...updates });
  };

  return (
    <div className="space-y-4">
      <div><Label>Rule Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>Reward Name (what user sees)</Label><Input value={form.reward_name} onChange={(e) => setForm({ ...form, reward_name: e.target.value })} placeholder="e.g. Welcome Drink" /></div>
      <div><Label>Reward Description</Label><Textarea value={form.reward_description} onChange={(e) => setForm({ ...form, reward_description: e.target.value })} /></div>

      {/* Trigger Type */}
      <div>
        <Label>Trigger Type</Label>
        <Select value={form.trigger_type} onValueChange={handleTriggerTypeChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="system_event">System Event</SelectItem>
            <SelectItem value="specific_date">Specific Date</SelectItem>
            <SelectItem value="configured_event">Configured Event</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* System Event selector */}
      {form.trigger_type === "system_event" && (
        <div>
          <Label>System Event</Label>
          <Select value={form.trigger_event} onValueChange={(v) => setForm({ ...form, trigger_event: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="signup">First Signup</SelectItem>
              <SelectItem value="first_booking">First Booking</SelectItem>
              <SelectItem value="first_purchase">First Purchase</SelectItem>
              <SelectItem value="birthday">Birthday</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Specific Date picker */}
      {form.trigger_type === "specific_date" && (
        <div>
          <Label>Date</Label>
          <Input type="date" value={form.trigger_date} onChange={(e) => setForm({ ...form, trigger_date: e.target.value, trigger_event: "specific_date" })} />
          <p className="text-xs text-muted-foreground mt-1">Gift will be auto-granted to all members on this date</p>
        </div>
      )}

      {/* Configured Event selector */}
      {form.trigger_type === "configured_event" && (
        <div>
          <Label>Select Event</Label>
          <Select value={form.trigger_event_id} onValueChange={(v) => {
            const ev = events?.find((e: any) => e.id === v);
            setForm({ ...form, trigger_event_id: v, trigger_event: `event:${v}` });
          }}>
            <SelectTrigger><SelectValue placeholder="Pick an event" /></SelectTrigger>
            <SelectContent>
              {(events ?? []).map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.title} ({e.date})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Gift will be granted to attendees of this event</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div><Label>Max Per User</Label><Input type="number" value={form.max_per_user} onChange={(e) => setForm({ ...form, max_per_user: Number(e.target.value) })} /></div>
        <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)}>Save Rule</Button>
      </div>
    </div>
  );
}

export function GiftsTab() {
  const { toast } = useToast();
  const { data: gifts, isLoading: giftsLoading } = useGiftedRewards();
  const { data: rules, isLoading: rulesLoading } = useAutoGiftRules();
  const saveRule = useSaveAutoGiftRule();
  const deleteRule = useDeleteAutoGiftRule();
  const [giftDialogOpen, setGiftDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);

  const { data: profilesMap } = useQuery({
    queryKey: ["profiles_map_gifts"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, display_name, email");
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { if (p.user_id) map[p.user_id] = p.display_name || p.email || "Unknown"; });
      return map;
    },
  });

  const handleSaveRule = async (data: any) => {
    try {
      await saveRule.mutateAsync({ id: editingRule?.id, ...data });
      toast({ title: editingRule?.id ? "Rule updated" : "Rule created" });
      setRuleDialogOpen(false);
      setEditingRule(null);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const handleDeleteRule = async (id: string) => {
    try { await deleteRule.mutateAsync(id); toast({ title: "Rule deleted" }); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  };

  const isLoading = giftsLoading || rulesLoading;
  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-6">
      {/* Auto Gift Rules */}
      <Card className="shadow-elegant">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Auto-Gift Rules</CardTitle>
          <Dialog open={ruleDialogOpen} onOpenChange={(o) => { setRuleDialogOpen(o); if (!o) setEditingRule(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setEditingRule({})}><Plus className="mr-2 h-4 w-4" />Add Rule</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>{editingRule?.id ? "Edit Rule" : "New Auto-Gift Rule"}</DialogTitle></DialogHeader>
              <AutoRuleForm rule={editingRule} onSave={handleSaveRule} onCancel={() => { setRuleDialogOpen(false); setEditingRule(null); }} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {(rules ?? []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No auto-gift rules yet. Create one to auto-grant rewards on signup, first booking, etc.</p> : (
            <div className="space-y-2">
              {(rules ?? []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-primary" />
                      <span className="font-medium">{r.name}</span>
                      <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Inactive"}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Gives "{r.reward_name}" on <span className="font-medium">{r.trigger_event}</span> · Max {r.max_per_user}/user
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" onClick={() => { setEditingRule(r); setRuleDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => handleDeleteRule(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Gift Assignment */}
      <Card className="shadow-elegant">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Gifted Rewards Log</CardTitle>
          <Dialog open={giftDialogOpen} onOpenChange={setGiftDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Send className="mr-2 h-4 w-4" />Assign Gift</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Assign Gift to Member</DialogTitle></DialogHeader>
              <ManualGiftDialog onClose={() => setGiftDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {(gifts ?? []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No gifts assigned yet.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Gift</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(gifts ?? []).map((g: any) => (
                  <TableRow key={g.id}>
                    <TableCell>{profilesMap?.[g.user_id] ?? g.user_id?.slice(0, 8)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{g.reward_name}</div>
                      {g.reward_description && <div className="text-xs text-muted-foreground">{g.reward_description}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline">{g.gift_type}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={g.status === "claimed" ? "default" : g.status === "expired" ? "destructive" : "secondary"}>
                        {g.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(g.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
