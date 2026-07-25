import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useEditScore, useDeleteScore } from "@/hooks/useLeagues";
import type { LeagueScore } from "@/types/league";

interface Props {
  leagueId: string;
  score: LeagueScore & { player_name?: string | null };
  numHoles: number;
}

export function AdminScoreEditActions({ leagueId, score, numHoles }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const editMut = useEditScore(leagueId);
  const deleteMut = useDeleteScore(leagueId);

  const initial = () => {
    const base = Array(numHoles).fill("");
    (score.hole_scores || []).forEach((v, i) => {
      if (i < numHoles) base[i] = v == null ? "" : String(v);
    });
    return base;
  };

  const [holes, setHoles] = useState<string[]>(initial());
  const [reason, setReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  useEffect(() => {
    if (editOpen) {
      setHoles(initial());
      setReason("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, score.id]);

  useEffect(() => {
    if (deleteOpen) setDeleteReason("");
  }, [deleteOpen, score.id]);

  const total = holes.reduce((s, v) => s + (Number(v) || 0), 0);

  const submitEdit = () => {
    const hole_scores = holes.map((v) => Number(v) || 0);
    editMut.mutate(
      { score_id: score.id, hole_scores, reason: reason.trim() },
      { onSuccess: () => setEditOpen(false) },
    );
  };

  const submitDelete = () => {
    deleteMut.mutate(
      { score_id: score.id, reason: deleteReason.trim() },
      { onSuccess: () => setDeleteOpen(false) },
    );
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
          title="Edit score"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}
          title="Delete score"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Edit Score</DialogTitle>
            <DialogDescription>
              {score.player_name || score.player_id?.slice(0, 8)} · Round {score.round_number}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Holes ({numHoles})</Label>
                <div className="grid grid-cols-9 gap-1.5">
                  {Array.from({ length: numHoles }).map((_, i) => (
                    <div key={i} className="space-y-1">
                      <div className="text-[10px] text-muted-foreground text-center">{i + 1}</div>
                      <Input
                        type="number"
                        min={0}
                        max={15}
                        value={holes[i]}
                        onChange={(e) => {
                          const next = [...holes];
                          next[i] = e.target.value;
                          setHoles(next);
                        }}
                        className="h-8 text-xs px-2"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded border p-3 bg-muted/40">
                <span className="text-sm font-medium">Total</span>
                <span className="text-lg font-bold">{total}</span>
              </div>
              <div>
                <Label htmlFor="edit-reason">Reason for edit (required, logged for audit)</Label>
                <Textarea
                  id="edit-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Corrected transcription error on hole 7"
                  rows={3}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={editMut.isPending}>Cancel</Button>
            <Button onClick={submitEdit} disabled={editMut.isPending || !reason.trim()}>
              {editMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete Score</DialogTitle>
            <DialogDescription>
              This will permanently remove the score for {score.player_name || score.player_id?.slice(0, 8)} · Round {score.round_number}.
              The action is logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-reason">Reason for deletion (required)</Label>
            <Textarea
              id="delete-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Duplicate submission"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleteMut.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={submitDelete}
              disabled={deleteMut.isPending || !deleteReason.trim()}
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
