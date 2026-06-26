import { useMemo, useState, Fragment } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Pencil, GraduationCap, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMyCoachSessions,
  useMyAssignedStudents,
  useMyCoachRow,
  useCoaches,
  type CoachingSession,
} from "@/hooks/useCoaching";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SessionFormDialog } from "@/components/coaching/SessionFormDialog";
import { ManageCoachStudents } from "@/components/coaching/ManageCoachStudents";

function StudentList({ onPick }: { onPick: (id: string, label: string) => void }) {
  const { data: sessions, isLoading } = useMyCoachSessions();
  const { data: assigned } = useMyAssignedStudents();
  const { data: myCoach } = useMyCoachRow();
  const [showRoster, setShowRoster] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; label: string; count: number; last: string | null }>();
    (assigned ?? []).forEach((s: any) => {
      const id = s.resolved_id as string;
      if (!m.has(id)) m.set(id, { id, label: s.display_name || s.email || "Student", count: 0, last: null });
    });
    (sessions ?? []).forEach((s) => {
      const label = s.student_profile?.display_name || s.student_profile?.email || "Student";
      const cur = m.get(s.student_user_id);
      if (!cur) m.set(s.student_user_id, { id: s.student_user_id, label, count: 1, last: s.session_date });
      else {
        cur.count += 1;
        if (!cur.last || s.session_date > cur.last) cur.last = s.session_date;
        if (cur.label === "Student" && label !== "Student") cur.label = label;
      }
    });
    return Array.from(m.values()).sort((a, b) => {
      if (a.last && b.last) return b.last.localeCompare(a.last);
      if (a.last) return -1;
      if (b.last) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [sessions, assigned]);

  return (
    <div className="space-y-3">
      {myCoach?.id && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Add or remove the students you coach. They'll show up here and in the New Session form.
          </p>
          <Button size="sm" variant="outline" onClick={() => setShowRoster((v) => !v)}>
            <Users className="mr-1.5 h-3.5 w-3.5" />
            {showRoster ? "Hide roster" : "Manage students"}
          </Button>
        </div>
      )}

      {showRoster && myCoach?.id && (
        <ManageCoachStudents coachId={myCoach.id} coachLabel="you" />
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !groups.length ? (
        <Card className="p-8 text-center">
          <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium">No students yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Click <strong>Manage students</strong> above to add the players you coach, then log your first session.
          </p>
        </Card>
      ) : (
        <ScrollableTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead>Last Session</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.label}</TableCell>
                  <TableCell className="text-right">{g.count}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {g.last ? format(parseISO(g.last), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => onPick(g.id, g.label)}>Open</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollableTable>
      )}
    </div>
  );
}

function StudentProfile({
  studentId, studentLabel, onBack, onEdit, onAdd,
}: {
  studentId: string; studentLabel: string;
  onBack: () => void; onEdit: (s: CoachingSession) => void; onAdd: () => void;
}) {
  const { data: sessions } = useMyCoachSessions();
  const filtered = (sessions ?? []).filter((s) => s.student_user_id === studentId);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-1">← All Students</Button>
          <h2 className="text-lg font-semibold">{studentLabel}</h2>
          <p className="text-xs text-muted-foreground">{filtered.length} session{filtered.length === 1 ? "" : "s"}</p>
        </div>
        <Button size="sm" onClick={onAdd}><Plus className="mr-1.5 h-4 w-4" />Add Session</Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No sessions yet.</Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {format(parseISO(s.session_date), "EEE, MMM d, yyyy")}
                    <span className="ml-2 text-xs text-muted-foreground">{s.city}</span>
                  </div>
                  {s.progress_summary && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{s.progress_summary}</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => onEdit(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function CoachView() {
  const { user } = useAuth();
  const { data: allCoaches } = useCoaches();
  const myCoachCity = useMemo(
    () => (allCoaches ?? []).find((c) => c.user_id === user?.id)?.city ?? "",
    [allCoaches, user?.id]
  );

  const [openStudent, setOpenStudent] = useState<{ id: string; label: string } | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<CoachingSession | null>(null);

  const openNewSession = () => { setEditingSession(null); setSessionOpen(true); };
  const openEditSession = (s: CoachingSession) => { setEditingSession(s); setSessionOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" />
            Coaching
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your students and session notes.
          </p>
        </div>
        <Button size="sm" onClick={openNewSession}>
          <Plus className="mr-1.5 h-4 w-4" />New Session
        </Button>
      </div>

      {openStudent ? (
        <StudentProfile
          studentId={openStudent.id}
          studentLabel={openStudent.label}
          onBack={() => setOpenStudent(null)}
          onEdit={openEditSession}
          onAdd={openNewSession}
        />
      ) : (
        <StudentList onPick={(id, label) => setOpenStudent({ id, label })} />
      )}

      <SessionFormDialog
        open={sessionOpen}
        onOpenChange={setSessionOpen}
        session={editingSession}
        lockedStudentId={!editingSession && openStudent ? openStudent.id : undefined}
        lockedStudentLabel={!editingSession && openStudent ? openStudent.label : undefined}
        defaultCity={myCoachCity || undefined}
        allowCoachPick={false}
      />
    </div>
  );
}

export default CoachView;
