import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { FileText, Save, Loader2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAllPageContent, useUpdatePageContent } from "@/hooks/usePageContent";

function PageContentEditor() {
  const { data: pages, isLoading } = useAllPageContent();
  const updatePage = useUpdatePageContent();
  const { toast } = useToast();
  const [editingPage, setEditingPage] = useState<{ id: string; title: string; content: string; slug: string } | null>(null);

  const handleSave = async () => {
    if (!editingPage) return;
    try {
      await updatePage.mutateAsync({ id: editingPage.id, title: editingPage.title, content: editingPage.content });
      toast({ title: "Page updated", description: `"${editingPage.title}" has been saved.` });
      setEditingPage(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  if (editingPage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Editing: {editingPage.slug}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Page Title</Label>
            <Input
              value={editingPage.title}
              onChange={(e) => setEditingPage({ ...editingPage, title: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Content</Label>
            <RichTextEditor
              content={editingPage.content}
              onChange={(html) => setEditingPage({ ...editingPage, content: html })}
              className="mt-1"
              minHeight="300px"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditingPage(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updatePage.isPending}>
              {updatePage.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {(pages ?? []).length === 0 && <p className="text-center text-muted-foreground py-8">No pages configured yet.</p>}
      {(pages ?? []).map((page) => (
        <Card key={page.id} className="shadow-elegant">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <h3 className="font-medium text-foreground">{page.title}</h3>
              <p className="text-sm text-muted-foreground capitalize">/{page.slug} · Updated {new Date(page.updated_at).toLocaleDateString()}</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => setEditingPage(page)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AdminPagesTab() {
  return <PageContentEditor />;
}
