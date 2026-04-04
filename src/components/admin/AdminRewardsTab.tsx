import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRewards } from "@/hooks/useRewards";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

function RewardForm({ reward, onSave, onCancel }: { reward?: any; onSave: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: reward?.name ?? "",
    description: reward?.description ?? "",
    points_cost: reward?.points_cost ?? 0,
    is_available: reward?.is_available ?? true,
    sort_order: reward?.sort_order ?? 0,
  });

  return (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>Description</Label><RichTextEditor content={form.description} onChange={(html) => setForm({ ...form, description: html })} minHeight="120px" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Points Cost</Label><Input type="number" value={form.points_cost || ""} onChange={(e) => setForm({ ...form, points_cost: Number(e.target.value) })} /></div>
        <div><Label>Sort Order</Label><Input type="number" value={form.sort_order || ""} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={form.is_available} onCheckedChange={(v) => setForm({ ...form, is_available: v })} /><Label>Available</Label></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)}>Save</Button>
      </div>
    </div>
  );
}

export function AdminRewardsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rewards, isLoading } = useRewards();
  const [editingReward, setEditingReward] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSave = async (data: any) => {
    const { error } = editingReward?.id
      ? await supabase.from("rewards").update(data).eq("id", editingReward.id)
      : await supabase.from("rewards").insert(data);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingReward?.id ? "Reward updated" : "Reward created" });
    queryClient.invalidateQueries({ queryKey: ["rewards"] });
    setEditingReward(null);
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("rewards").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Deleted successfully" });
    queryClient.invalidateQueries({ queryKey: ["rewards"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingReward(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingReward({})}><Plus className="mr-2 h-4 w-4" />Add Reward</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{editingReward?.id ? "Edit Reward" : "New Reward"}</DialogTitle></DialogHeader>
            <RewardForm reward={editingReward} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditingReward(null); }} />
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <div className="space-y-3">
          {(rewards ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No rewards yet.</p>}
          {(rewards ?? []).map((reward) => (
            <Card key={reward.id} className="shadow-elegant">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-medium text-foreground">{reward.name}</h3>
                  <p className="text-sm text-muted-foreground">{reward.points_cost} pts · {reward.is_available ? "Available" : "Unavailable"}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => { setEditingReward(reward); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => handleDelete(reward.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
