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
import { useLoyaltyBonuses, useSaveLoyaltyBonus, useDeleteLoyaltyBonus } from "@/hooks/useLoyalty";

const TRIGGER_TYPES = [
  { value: "coaching_followup", label: "Coaching Follow-Through" },
  { value: "streak", label: "Visit Streak" },
  { value: "referral", label: "Referral" },
  { value: "custom", label: "Custom" },
];

function BonusForm({ item, onSave, onCancel }: { item?: any; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    trigger_type: item?.trigger_type ?? "coaching_followup",
    bonus_type: item?.bonus_type ?? "percentage",
    bonus_value: item?.bonus_value ?? 0,
    is_active: item?.is_active ?? true,
    sort_order: item?.sort_order ?? 0,
  });

  return (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Trigger Type</Label>
          <Select value={form.trigger_type} onValueChange={(v) => setForm({ ...form, trigger_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TRIGGER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Bonus Type</Label>
          <Select value={form.bonus_type} onValueChange={(v) => setForm({ ...form, bonus_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
              <SelectItem value="flat">Flat Points</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Bonus Value</Label><Input type="number" value={form.bonus_value || ""} onChange={(e) => setForm({ ...form, bonus_value: Number(e.target.value) })} /></div>
        <div><Label>Sort Order</Label><Input type="number" value={form.sort_order || ""} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.name}>Save</Button>
      </div>
    </div>
  );
}

export function LoyaltyBonusesTab() {
  const { toast } = useToast();
  const { data: bonuses, isLoading } = useLoyaltyBonuses();
  const saveMut = useSaveLoyaltyBonus();
  const deleteMut = useDeleteLoyaltyBonus();
  const [editing, setEditing] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSave = async (data: any) => {
    try {
      await saveMut.mutateAsync(editing?.id ? { id: editing.id, ...data } : data);
      toast({ title: editing?.id ? "Bonus updated" : "Bonus created" });
      setDialogOpen(false);
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
      toast({ title: "Bonus deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Special bonuses triggered by specific behaviours.</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing({})}><Plus className="mr-2 h-4 w-4" />Add Bonus</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>{editing?.id ? "Edit Bonus" : "New Bonus"}</DialogTitle></DialogHeader>
            <BonusForm item={editing} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditing(null); }} />
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <div className="space-y-2">
          {(bonuses ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No bonuses configured.</p>}
          {(bonuses ?? []).map((b) => (
            <Card key={b.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-medium text-foreground">{b.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {b.bonus_type === "percentage" ? `+${b.bonus_value}%` : `+${b.bonus_value} pts`} · {b.trigger_type} · {b.is_active ? "Active" : "Inactive"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => { setEditing(b); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => handleDelete(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
