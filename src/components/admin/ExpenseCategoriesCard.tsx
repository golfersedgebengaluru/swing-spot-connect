import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useExpenseCategories, useCreateExpenseCategory, useUpdateExpenseCategory, useDeleteExpenseCategory, type ExpenseCategory } from "@/hooks/useExpenseCategories";

export function ExpenseCategoriesCard() {
  const { toast } = useToast();
  const { data: categories, isLoading } = useExpenseCategories();
  const createCat = useCreateExpenseCategory();
  const updateCat = useUpdateExpenseCategory();
  const deleteCat = useDeleteExpenseCategory();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await createCat.mutateAsync({ name: newName.trim(), sort_order: (categories?.length ?? 0) + 1 });
      setNewName("");
      toast({ title: "Category added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRename = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await updateCat.mutateAsync({ id: editingId, name: editName.trim() });
      setEditingId(null);
      toast({ title: "Category renamed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleToggle = async (cat: ExpenseCategory, active: boolean) => {
    try {
      await updateCat.mutateAsync({ id: cat.id, is_active: active });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteCat.mutateAsync(deleteId);
      toast({ title: "Category deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setDeleteId(null);
  };

  return (
    <>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Tag className="h-5 w-5" />Expense Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : (
            <div className="space-y-2">
              {categories?.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2">
                  {editingId === cat.id ? (
                    <>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm flex-1" onKeyDown={(e) => e.key === "Enter" && handleRename()} autoFocus />
                      <Button size="sm" variant="outline" onClick={handleRename}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>✕</Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{cat.name}</span>
                      <Switch checked={cat.is_active} onCheckedChange={(v) => handleToggle(cat, v)} />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(cat.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Input placeholder="New category name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
            <Button size="sm" onClick={handleAdd} disabled={createCat.isPending}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>Expenses using this category won't be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
