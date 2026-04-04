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
import { useLoyaltyMilestones, useSaveLoyaltyMilestone, useDeleteLoyaltyMilestone } from "@/hooks/useLoyalty";

function MilestoneForm({ item, onSave, onCancel }: { item?: any; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    milestone_type: item?.milestone_type ?? "monthly",
    threshold_hours: item?.threshold_hours ?? 0,
    bonus_points: item?.bonus_points ?? 0,
    is_active: item?.is_active ?? true,
    sort_order: item?.sort_order ?? 0,
  });

  return (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Type</Label>
          <Select value={form.milestone_type} onValueChange={(v) => setForm({ ...form, milestone_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="plan_cycle">Plan Cycle</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Threshold (hours)</Label><Input type="number" step="0.5" value={form.threshold_hours || ""} onChange={(e) => setForm({ ...form, threshold_hours: Number(e.target.value) })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Bonus Points</Label><Input type="number" value={form.bonus_points || ""} onChange={(e) => setForm({ ...form, bonus_points: Number(e.target.value) })} /></div>
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

export function LoyaltyMilestonesTab() {
  const { toast } = useToast();
  const { data: milestones, isLoading } = useLoyaltyMilestones();
  const saveMut = useSaveLoyaltyMilestone();
  const deleteMut = useDeleteLoyaltyMilestone();
  const [editing, setEditing] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSave = async (data: any) => {
    try {
      await saveMut.mutateAsync(editing?.id ? { id: editing.id, ...data } : data);
      toast({ title: editing?.id ? "Milestone updated" : "Milestone created" });
      setDialogOpen(false);
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMut.mutateAsync(id);
      toast({ title: "Milestone deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Reward bonus points when users hit hour milestones.</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing({})}><Plus className="mr-2 h-4 w-4" />Add Milestone</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>{editing?.id ? "Edit Milestone" : "New Milestone"}</DialogTitle></DialogHeader>
            <MilestoneForm item={editing} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditing(null); }} />
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <div className="space-y-2">
          {(milestones ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No milestones configured.</p>}
          {(milestones ?? []).map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-medium text-foreground">{m.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {m.threshold_hours}h → {m.bonus_points} pts · {m.milestone_type} · {m.is_active ? "Active" : "Inactive"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => { setEditing(m); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
