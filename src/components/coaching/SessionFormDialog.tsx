import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStudentSearch, useSaveSession, useDeleteSession, useCoaches, type CoachingSession } from "@/hooks/useCoaching";
import { useAuth } from "@/contexts/AuthContext";
import { useAllCities } from "@/hooks/useBookings";
import { Trash2, Search } from "lucide-react";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: CoachingSession | null;
  /** If provided, locks the student selector. */
  lockedStudentId?: string;
  lockedStudentLabel?: string;
  /** Override coach (admin scheduling for someone else). Defaults to current user. */
  coachUserId?: string;
  defaultCity?: string;
}

export function SessionFormDialog({
  open,
  onOpenChange,
  session,
  lockedStudentId,
  lockedStudentLabel,
  coachUserId,
  defaultCity,
}: Props) {
  const { user } = useAuth();
  const { data: cities } = useAllCities();
  const save = useSaveSession();
  const del = useDeleteSession();

  const [studentId, setStudentId] = useState<string>("");
  const [studentLabel, setStudentLabel] = useState<string>("");
  const [search, setSearch] = useState("");
  const { data: searchResults } = useStudentSearch(search);

  const [city, setCity] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [drills, setDrills] = useState("");
  const [progress, setProgress] = useState("");
  const [onform, setOnform] = useState("");
  const [sportsbox, setSportsbox] = useState("");
  const [superspeed, setSuperspeed] = useState("");

  useEffect(() => {
    if (!open) return;
    if (session) {
      setStudentId(session.student_user_id);
      setStudentLabel(session.student_profile?.display_name || session.student_profile?.email || "Student");
      setCity(session.city);
      setDate(session.session_date);
      setNotes(session.notes ?? "");
      setDrills(session.drills ?? "");
      setProgress(session.progress_summary ?? "");
      setOnform(session.onform_url ?? "");
      setSportsbox(session.sportsbox_url ?? "");
      setSuperspeed(session.superspeed_url ?? "");
    } else {
      setStudentId(lockedStudentId ?? "");
      setStudentLabel(lockedStudentLabel ?? "");
      setSearch("");
      setCity(defaultCity ?? "");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setNotes("");
      setDrills("");
      setProgress("");
      setOnform("");
      setSportsbox("");
      setSuperspeed("");
    }
  }, [open, session, lockedStudentId, lockedStudentLabel, defaultCity]);

  const canSubmit = !!studentId && !!city && !!date && !save.isPending;

  const handleSave = async () => {
    if (!user) return;
    await save.mutateAsync({
      id: session?.id,
      coach_user_id: coachUserId ?? user.id,
      student_user_id: studentId,
      city,
      session_date: date,
      notes: notes || null,
      drills: drills || null,
      progress_summary: progress || null,
      onform_url: onform.trim() || null,
      sportsbox_url: sportsbox.trim() || null,
      superspeed_url: superspeed.trim() || null,
    });
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!session) return;
    if (!confirm("Delete this session? This cannot be undone.")) return;
    await del.mutateAsync(session.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{session ? "Edit Session" : "New Coaching Session"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Student */}
          <div className="space-y-1.5">
            <Label>Student</Label>
            {lockedStudentId || studentId ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="truncate">{studentLabel || "Selected"}</span>
                {!lockedStudentId && !session && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setStudentId(""); setStudentLabel(""); }}>
                    Change
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="pl-8"
                  />
                </div>
                {search.length >= 2 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    {(searchResults ?? []).length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No matches</div>
                    ) : (
                      (searchResults ?? []).map((p: any) => (
                        <button
                          key={p.user_id}
                          type="button"
                          onClick={() => {
                            setStudentId(p.user_id);
                            setStudentLabel(p.display_name || p.email);
                            setSearch("");
                          }}
                          className="block w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        >
                          <div className="font-medium">{p.display_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{p.email}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* City + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {(cities ?? []).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Session Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Notes / drills / progress */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What you worked on…" />
          </div>
          <div className="space-y-1.5">
            <Label>Drills</Label>
            <Textarea value={drills} onChange={(e) => setDrills(e.target.value)} rows={3} placeholder="Drills assigned…" />
          </div>
          <div className="space-y-1.5">
            <Label>Progress Summary</Label>
            <Textarea value={progress} onChange={(e) => setProgress(e.target.value)} rows={2} placeholder="Summary visible on the card…" />
          </div>

          {/* External tools */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label>Onform link</Label>
              <Input value={onform} onChange={(e) => setOnform(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Sportsbox AI link</Label>
              <Input value={sportsbox} onChange={(e) => setSportsbox(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Superspeed link</Label>
              <Input value={superspeed} onChange={(e) => setSuperspeed(e.target.value)} placeholder="https://…" />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          {session && (
            <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={!canSubmit}>
            {save.isPending ? "Saving…" : "Save Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
