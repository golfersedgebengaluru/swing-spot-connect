import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRewards } from "@/hooks/useRewards";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

function CatalogueForm({ reward, onSave, onCancel }: { reward?: any; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: reward?.name ?? "",
    description: reward?.description ?? "",
    points_cost: reward?.points_cost ?? 0,
    is_available: reward?.is_available ?? true,
    sort_order: reward?.sort_order ?? 0,
    reward_type: reward?.reward_type ?? "standard",
    reward_value: reward?.reward_value ?? 0,
    redemption_cap_per_day: reward?.redemption_cap_per_day ?? null,
    usage_gate_percentage: reward?.usage_gate_percentage ?? null,
  });

  return (
    <div className="space-y-4">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>Description</Label><RichTextEditor content={form.description} onChange={(html) => setForm({ ...form, description: html })} minHeight="100px" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Points Cost</Label><Input type="number" value={form.points_cost} onChange={(e) => setForm({ ...form, points_cost: Number(e.target.value) })} /></div>
        <div>
          <Label>Reward Type</Label>
          <Select value={form.reward_type} onValueChange={(v) => setForm({ ...form, reward_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="discount">Discount (₹ value)</SelectItem>
              <SelectItem value="upgrade">Upgrade</SelectItem>
              <SelectItem value="session">Free Session</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><Label>Reward Value (₹)</Label><Input type="number" value={form.reward_value ?? ""} onChange={(e) => setForm({ ...form, reward_value: e.target.value ? Number(e.target.value) : null })} placeholder="Optional" /></div>
        <div><Label>Daily Cap</Label><Input type="number" value={form.redemption_cap_per_day ?? ""} onChange={(e) => setForm({ ...form, redemption_cap_per_day: e.target.value ? Number(e.target.value) : null })} placeholder="No limit" /></div>
        <div><Label>Usage Gate (%)</Label><Input type="number" value={form.usage_gate_percentage ?? ""} onChange={(e) => setForm({ ...form, usage_gate_percentage: e.target.value ? Number(e.target.value) : null })} placeholder="None" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={form.is_available} onCheckedChange={(v) => setForm({ ...form, is_available: v })} /><Label>Available</Label></div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.name}>Save</Button>
      </div>
    </div>
  );
}

export function LoyaltyCatalogueTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rewards, isLoading } = useRewards();
  const [editing, setEditing] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSave = async (data: any) => {
    const { error } = editing?.id
      ? await supabase.from("rewards").update(data).eq("id", editing.id)
      : await supabase.from("rewards").insert(data);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing?.id ? "Reward updated" : "Reward created" });
    queryClient.invalidateQueries({ queryKey: ["rewards"] });
    setDialogOpen(false);
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("rewards").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Reward deleted" });
    queryClient.invalidateQueries({ queryKey: ["rewards"] });
  };

  const typeLabel = (t: string) => ({ standard: "Standard", discount: "Discount", upgrade: "Upgrade", session: "Session" }[t] ?? t);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Redemption catalogue with gating, caps, and reward types.</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing({})}><Plus className="mr-2 h-4 w-4" />Add Reward</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{editing?.id ? "Edit Reward" : "New Reward"}</DialogTitle></DialogHeader>
            <CatalogueForm reward={editing} onSave={handleSave} onCancel={() => { setDialogOpen(false); setEditing(null); }} />
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : (
        <div className="space-y-2">
          {(rewards ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No rewards in catalogue.</p>}
          {(rewards ?? []).map((r: any) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-medium text-foreground">{r.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {r.points_cost} pts · {typeLabel(r.reward_type ?? "standard")}
                    {r.redemption_cap_per_day ? ` · Cap: ${r.redemption_cap_per_day}/day` : ""}
                    {r.usage_gate_percentage ? ` · Gate: ${r.usage_gate_percentage}%` : ""}
                    {" · "}{r.is_available ? "Available" : "Unavailable"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => { setEditing(r); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
