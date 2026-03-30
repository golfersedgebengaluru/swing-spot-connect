import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X, Loader2, Ruler } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUnitsOfMeasure, useCreateUnit, useUpdateUnit, useDeleteUnit } from "@/hooks/useUnitsOfMeasure";

export function UnitOfMeasureCard() {
  const { toast } = useToast();
  const { data: units, isLoading } = useUnitsOfMeasure();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();
  const deleteUnit = useDeleteUnit();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    createUnit.mutate(newName.trim(), {
      onSuccess: () => { setNewName(""); toast({ title: "Unit added" }); },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleUpdate = (id: string) => {
    if (!editName.trim()) return;
    updateUnit.mutate({ id, name: editName.trim() }, {
      onSuccess: () => { setEditingId(null); toast({ title: "Unit updated" }); },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleDelete = (id: string) => {
    deleteUnit.mutate(id, {
      onSuccess: () => toast({ title: "Unit deleted" }),
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Ruler className="h-5 w-5" />Units of Measure</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(units ?? []).map((unit) => (
          <div key={unit.id} className="flex items-center gap-2">
            {editingId === unit.id ? (
              <>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" onKeyDown={(e) => e.key === "Enter" && handleUpdate(unit.id)} />
                <Button size="icon" variant="ghost" onClick={() => handleUpdate(unit.id)}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-foreground">{unit.name}</span>
                <Button size="icon" variant="ghost" onClick={() => { setEditingId(unit.id); setEditName(unit.name); }}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(unit.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
              </>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Input placeholder="New unit name" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
      </CardContent>
    </Card>
  );
}
