import { useNavigate, useParams, Link } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { useDeleteSelfDirectedSession, useSession, useUpdateSelfDirectedSession } from "@/hooks/useCoaching";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Pencil, Trash2, User } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ExternalToolLinks } from "@/components/coaching/ExternalToolLinks";
import { SessionLibrarySummary } from "@/components/coaching/SessionLibrarySummary";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoiceTextarea } from "@/components/coaching/VoiceTextarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function CoachingSessionDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession(sessionId);
  const update = useUpdateSelfDirectedSession();
  const remove = useDeleteSelfDirectedSession();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!session) return;
    setCity(session.city);
    setDate(session.session_date);
    setNotes(session.notes ?? "");
    setProgress(session.progress_summary ?? "");
  }, [session]);

  const save = async () => {
    if (!session) return;
    await update.mutateAsync({ id: session.id, city, sessionDate: date, notes, progressSummary: progress });
    setEditing(false);
  };

  const deleteLog = async () => {
    if (!session) return;
    await remove.mutateAsync(session.id);
    navigate("/training");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6 md:py-10 max-w-3xl">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/training"><ArrowLeft className="mr-1 h-4 w-4" />Back to Training</Link>
        </Button>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !session ? (
          <Card className="p-8 text-center">
            <p className="font-medium">Session not found</p>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              {session.session_type === "self_directed" && (
                <div className="mb-4 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing((value) => !value)}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>
                  <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="mr-1.5 h-4 w-4" />Delete</Button>
                </div>
              )}
              {editing && session.session_type === "self_directed" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label>City</Label><Input value={city} onChange={(event) => setCity(event.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
                  </div>
                  <VoiceTextarea label="Training notes" field="notes" value={notes} onChange={setNotes} rows={3} />
                  <VoiceTextarea label="Progress summary" field="progress" value={progress} onChange={setProgress} rows={2} />
                  <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={save} disabled={!city || !date || update.isPending}>Save</Button></div>
                </div>
              ) : (
                <>
              <div className="flex items-center gap-2 text-base font-medium">
                <Calendar className="h-4 w-4 text-primary" />
                {format(parseISO(session.session_date), "EEEE, MMMM d, yyyy")}
              </div>
              {session.session_type === "coach_directed" && <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Coach: <span className="text-foreground">
                  {session.coach_profile?.display_name || session.coach_profile?.email || "—"}
                </span>
              </div>}
                </>
              )}
            </Card>

            {((session.onform_links?.length ?? 0) > 0 ||
              (session.sportsbox_links?.length ?? 0) > 0 ||
              (session.superspeed_links?.length ?? 0) > 0 ||
              (session.other_links?.length ?? 0) > 0 ||
              session.onform_url || session.sportsbox_url || session.superspeed_url || session.other_url) && (
              <Card className="p-5">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Tools</h2>
                <ExternalToolLinks
                  onformLinks={session.onform_links}
                  sportsboxLinks={session.sportsbox_links}
                  superspeedLinks={session.superspeed_links}
                  otherLinks={session.other_links}
                  onform={session.onform_url}
                  sportsbox={session.sportsbox_url}
                  superspeed={session.superspeed_url}
                  other={session.other_url}
                  otherLabel={session.other_label}
                  size="default"
                />
              </Card>
            )}

            {session.progress_summary && (
              <Card className="p-5">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">Progress Summary</h2>
                <p className="text-sm whitespace-pre-wrap">{session.progress_summary}</p>
              </Card>
            )}
            {session.notes && (
              <Card className="p-5">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">Notes</h2>
                <p className="text-sm whitespace-pre-wrap">{session.notes}</p>
              </Card>
            )}
            <SessionLibrarySummary sessionId={session.id} heading="Focus & Drills" />
            {session.drills && (
              <Card className="p-5">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">Drills (legacy notes)</h2>
                <p className="text-sm whitespace-pre-wrap">{session.drills}</p>
              </Card>
            )}
          </div>
        )}
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete training log?</AlertDialogTitle><AlertDialogDescription>This removes the completed log and its saved focus and drill history.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={deleteLog}>Delete</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
