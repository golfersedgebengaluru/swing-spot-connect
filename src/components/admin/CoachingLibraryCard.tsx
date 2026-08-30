import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Check } from "lucide-react";
import {
  useCoachingCategories,
  useCoachingDrills,
  useCoachingFocuses,
  useSaveCoachingCategory,
  useSaveCoachingDrill,
  useSaveCoachingFocus,
  type CategoryRow,
  type DrillRow,
  type FocusRow,
} from "@/hooks/useCoachingLibrary";

const NONE = "__none__";

export function CoachingLibraryCard() {
  const { data: categories } = useCoachingCategories();
  const { data: focuses } = useCoachingFocuses();
  const { data: drills } = useCoachingDrills();
  const saveCategory = useSaveCoachingCategory();
  const saveFocus = useSaveCoachingFocus();
  const saveDrill = useSaveCoachingDrill();

  const [newCategory, setNewCategory] = useState("");
  const [focusEdit, setFocusEdit] = useState<Partial<FocusRow> | null>(null);
  const [drillEdit, setDrillEdit] = useState<Partial<DrillRow> | null>(null);

  const catName = (id: string | null | undefined) =>
    (categories ?? []).find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      {/* Categories */}
      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold">Categories</div>
        <div className="flex flex-wrap gap-2">
          {(categories ?? []).map((c: CategoryRow) => (
            <Badge key={c.id} variant={c.active ? "secondary" : "outline"} className="gap-2">
              {c.name}
              <button
                type="button"
                className="text-[10px] underline"
                onClick={() => saveCategory.mutate({ id: c.id, name: c.name, active: !c.active })}
              >
                {c.active ? "disable" : "enable"}
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category name"
          />
          <Button
            disabled={!newCategory.trim()}
            onClick={() => {
              saveCategory.mutate({ name: newCategory.trim() });
              setNewCategory("");
            }}
          >
            <Plus className="h-4 w-4 mr-1" />Add
          </Button>
        </div>
      </Card>

      {/* Focuses */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Focuses</div>
          <Button size="sm" variant="outline" onClick={() => setFocusEdit({ drill_ids: [] })}>
            <Plus className="h-4 w-4 mr-1" />Add focus
          </Button>
        </div>
        <div className="divide-y">
          {(focuses ?? []).map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {f.name}
                  {!f.active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {catName(f.category_id)} · {f.drill_ids.length} drill{f.drill_ids.length === 1 ? "" : "s"}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setFocusEdit(f)}>Edit</Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Drills */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Drills</div>
          <Button size="sm" variant="outline" onClick={() => setDrillEdit({})}>
            <Plus className="h-4 w-4 mr-1" />Add drill
          </Button>
        </div>
        <div className="divide-y">
          {(drills ?? []).map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {d.name}
                  {!d.active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {catName(d.category_id)}{d.recommended_reps ? ` · ${d.recommended_reps}` : ""}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDrillEdit(d)}>Edit</Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Focus dialog — mapping edited inline, no separate screen */}
      <Dialog open={!!focusEdit} onOpenChange={(o) => !o && setFocusEdit(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{focusEdit?.id ? "Edit Focus" : "New Focus"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={focusEdit?.name ?? ""}
                onChange={(e) => setFocusEdit({ ...focusEdit, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={focusEdit?.category_id ?? NONE}
                onValueChange={(v) =>
                  setFocusEdit({ ...focusEdit, category_id: v === NONE ? null : v })
                }
              >
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No category</SelectItem>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mapped drills</Label>
              <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                {(drills ?? []).map((d) => {
                  const on = (focusEdit?.drill_ids ?? []).includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        setFocusEdit({
                          ...focusEdit,
                          drill_ids: on
                            ? (focusEdit?.drill_ids ?? []).filter((id) => id !== d.id)
                            : [...(focusEdit?.drill_ids ?? []), d.id],
                        })
                      }
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="truncate">{d.name}</span>
                      {on && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={focusEdit?.active ?? true}
                onCheckedChange={(v) => setFocusEdit({ ...focusEdit, active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFocusEdit(null)}>Cancel</Button>
            <Button
              disabled={!focusEdit?.name?.trim() || saveFocus.isPending}
              onClick={async () => {
                await saveFocus.mutateAsync({
                  id: focusEdit?.id,
                  name: focusEdit!.name!.trim(),
                  category_id: focusEdit?.category_id ?? null,
                  active: focusEdit?.active ?? true,
                  drill_ids: focusEdit?.drill_ids ?? [],
                });
                setFocusEdit(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drill dialog */}
      <Dialog open={!!drillEdit} onOpenChange={(o) => !o && setDrillEdit(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drillEdit?.id ? "Edit Drill" : "New Drill"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={drillEdit?.name ?? ""}
                onChange={(e) => setDrillEdit({ ...drillEdit, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={drillEdit?.category_id ?? NONE}
                onValueChange={(v) =>
                  setDrillEdit({ ...drillEdit, category_id: v === NONE ? null : v })
                }
              >
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No category</SelectItem>
                  {(categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Objective</Label>
              <Textarea
                rows={2}
                value={drillEdit?.objective ?? ""}
                onChange={(e) => setDrillEdit({ ...drillEdit, objective: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instructions</Label>
              <Textarea
                rows={4}
                value={drillEdit?.instructions ?? ""}
                onChange={(e) => setDrillEdit({ ...drillEdit, instructions: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Recommended reps</Label>
                <Input
                  value={drillEdit?.recommended_reps ?? ""}
                  onChange={(e) => setDrillEdit({ ...drillEdit, recommended_reps: e.target.value })}
                  placeholder="10-15 balls"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Video URL (optional)</Label>
                <Input
                  value={drillEdit?.video_url ?? ""}
                  onChange={(e) => setDrillEdit({ ...drillEdit, video_url: e.target.value })}
                  placeholder="https://…"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={drillEdit?.active ?? true}
                onCheckedChange={(v) => setDrillEdit({ ...drillEdit, active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDrillEdit(null)}>Cancel</Button>
            <Button
              disabled={!drillEdit?.name?.trim() || saveDrill.isPending}
              onClick={async () => {
                const url = (drillEdit?.video_url ?? "").trim();
                if (url && !/^https?:\/\/\S+$/i.test(url)) return;
                await saveDrill.mutateAsync({
                  id: drillEdit?.id,
                  name: drillEdit!.name!.trim(),
                  category_id: drillEdit?.category_id ?? null,
                  objective: (drillEdit?.objective ?? "").trim() || null,
                  instructions: (drillEdit?.instructions ?? "").trim() || null,
                  recommended_reps: (drillEdit?.recommended_reps ?? "").trim() || null,
                  video_url: url || null,
                  active: drillEdit?.active ?? true,
                });
                setDrillEdit(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
