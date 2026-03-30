import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X, Loader2, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProductCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/useProductCategories";

export function ProductCategoriesCard() {
  const { toast } = useToast();
  const { data: categories, isLoading } = useProductCategories();
  const createCat = useCreateCategory();
  const updateCat = useUpdateCategory();
  const deleteCat = useDeleteCategory();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    createCat.mutate(newName.trim(), {
      onSuccess: () => { setNewName(""); toast({ title: "Category added" }); },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleUpdate = (id: string) => {
    if (!editName.trim()) return;
    updateCat.mutate({ id, name: editName.trim() }, {
      onSuccess: () => { setEditingId(null); toast({ title: "Category updated" }); },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleDelete = (id: string) => {
    deleteCat.mutate(id, {
      onSuccess: () => toast({ title: "Category deleted" }),
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" />Product & Service Categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(categories ?? []).map((cat) => (
          <div key={cat.id} className="flex items-center gap-2">
            {editingId === cat.id ? (
              <>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" onKeyDown={(e) => e.key === "Enter" && handleUpdate(cat.id)} />
                <Button size="icon" variant="ghost" onClick={() => handleUpdate(cat.id)}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-foreground">{cat.name}</span>
                <Button size="icon" variant="ghost" onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(cat.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
              </>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Input placeholder="New category name" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
          <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
      </CardContent>
    </Card>
  );
}
