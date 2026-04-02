import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLoyaltyEarningRules, useSaveLoyaltyRule, useDeleteLoyaltyRule } from "@/hooks/useLoyalty";

const EVENT_TYPES = [
  { value: "walkin", label: "Walk-in Visit" },
  { value: "birdie_usage", label: "Birdie Hour Usage" },
  { value: "eagle_usage", label: "Eagle Hour Usage" },
  { value: "coaching", label: "Coaching Session" },
  { value: "practice", label: "Practice Session" },
  { value: "renewal", label: "Plan Renewal" },
];

const RATE_UNITS = [
  { value: "per_100_spent", label: "Per ₹100 Spent" },
  { value: "per_hour", label: "Per Hour" },
  { value: "flat", label: "Flat Points" },
];

function RuleForm({ rule, onSave, onCancel }: { rule?: any; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    event_type: rule?.event_type ?? "walkin",
    label: rule?.label ?? "",
    base_rate: rule?.base_rate ?? 0,
    rate_unit: rule?.rate_unit ?? "per_100_spent",
    is_active: rule?.is_active ?? true,
    sort_order: rule?.sort_order ?? 0,
  });

  return (
    <div className="space-y-4">
      <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Event Type</Label>
          <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Rate Unit</Label>
          <Select value={form.rate_unit} onValueChange={(v) => setForm({ ...form, rate_unit: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{RATE_UNITS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Base Rate (points)</Label><Input type="number" value={form.base_rate} onChange={(e) => setForm({ ...form, base_rate: Number(e.target.value) })} /></div>
        <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.label}>Save</Button>
      </div>
    </div>
  );
}

export function LoyaltyRulesTab() {
  const { toast } = useToast();
  const { data: rules, isLoading } = useLoyaltyEarningRules();
  const saveRule = useSaveLoyaltyRule();
  const deleteRule = useDeleteLoyaltyRule();
  const [editing, setEditing] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSave = async (data: any) => {
    try {
      await saveRule.mutateAsync(editing?.id ? { id: editing.id, ...data } : data);
      toast({ title: editing?.id ? "Rule updated" : "Rule created" });
      setDialogOpen(false);
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRule.mutateAsync(id);
      toast({ title: "Rule deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const unitLabel = (u: string) => RATE_UNITS.find((r) => r.value === u)?.label ?? u;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Define how points are earned from different events.</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing({})}><Plus className="mr-2 h-4 w-4" />Add Rule</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>{editing?.id ? "Edit Rule" : "New Earning Rule"}</DialogTitle></DialogHeader>
            <RuleForm rule={editing} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditing(null); }} />
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <div className="space-y-2">
          {(rules ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No earning rules configured.</p>}
          {(rules ?? []).map((rule) => (
            <Card key={rule.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-medium text-foreground">{rule.label}</h3>
                  <p className="text-sm text-muted-foreground">
                    {rule.base_rate} pts {unitLabel(rule.rate_unit)} · {rule.event_type} · {rule.is_active ? "Active" : "Inactive"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => { setEditing(rule); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => handleDelete(rule.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
