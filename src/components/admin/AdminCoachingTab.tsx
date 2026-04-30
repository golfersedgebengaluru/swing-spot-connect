import { useState, useMemo } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAllSessions,
  useMyCoachSessions,
  useCoaches,
  useStudentSearch,
  useSaveCoach,
  useDeleteCoach,
  useIsCoach,
  type CoachingSession,
  type CoachRow,
} from "@/hooks/useCoaching";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Trash2, Pencil, GraduationCap } from "lucide-react";
import { format, parseISO } from "date-fns";
import { SessionFormDialog } from "@/components/coaching/SessionFormDialog";
import { useAllCities } from "@/hooks/useBookings";

/* ============ COACH STUDENT LIST (grouped from my sessions) ============ */
function CoachStudentList({ onPick }: { onPick: (studentId: string, label: string) => void }) {
  const { data: sessions, isLoading } = useMyCoachSessions();

  const groups = useMemo(() => {
    const m = new Map<string, { id: string; label: string; count: number; last: string }>();
    (sessions ?? []).forEach((s) => {
      const label = s.student_profile?.display_name || s.student_profile?.email || "Student";
      const cur = m.get(s.student_user_id);
      if (!cur) m.set(s.student_user_id, { id: s.student_user_id, label, count: 1, last: s.session_date });
      else {
        cur.count += 1;
        if (s.session_date > cur.last) cur.last = s.session_date;
      }
    });
    return Array.from(m.values()).sort((a, b) => b.last.localeCompare(a.last));
  }, [sessions]);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!groups.length)
    return (
      <Card className="p-8 text-center">
        <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <p className="font-medium">No students yet</p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Log your first session — your students will appear here automatically.
        </p>
      </Card>
    );

  return (
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
                {format(parseISO(g.last), "MMM d, yyyy")}
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => onPick(g.id, g.label)}>
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollableTable>
  );
}

/* ============ STUDENT PROFILE (single student's session timeline) ============ */
function CoachStudentProfile({
  studentId,
  studentLabel,
  onBack,
  onEdit,
  onAdd,
}: {
  studentId: string;
  studentLabel: string;
  onBack: () => void;
  onEdit: (session: CoachingSession) => void;
  onAdd: () => void;
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

/* ============ ADMIN: ALL SESSIONS ============ */
function AllSessionsView({ city, onEdit }: { city: string; onEdit: (s: CoachingSession) => void }) {
  const { data: sessions, isLoading } = useAllSessions(city || undefined);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!sessions || sessions.length === 0)
    return <Card className="p-6 text-center text-sm text-muted-foreground">No sessions yet.</Card>;

  return (
    <ScrollableTable>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Coach</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>City</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="whitespace-nowrap">{format(parseISO(s.session_date), "MMM d, yyyy")}</TableCell>
              <TableCell>{s.coach_profile?.display_name || s.coach_profile?.email || "—"}</TableCell>
              <TableCell>{s.student_profile?.display_name || s.student_profile?.email || "—"}</TableCell>
              <TableCell>{s.city}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => onEdit(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollableTable>
  );
}

/* ============ ADMIN: COACHES ROSTER ============ */
function CoachesManager({ city }: { city: string }) {
  const { data: coaches, isLoading } = useCoaches(city || undefined);
  const { data: cities } = useAllCities();
  const save = useSaveCoach();
  const del = useDeleteCoach();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CoachRow | null>(null);
  const [search, setSearch] = useState("");
  const { data: searchResults } = useStudentSearch(search);
  const [pickedUserId, setPickedUserId] = useState("");
  const [pickedLabel, setPickedLabel] = useState("");
  const [bio, setBio] = useState("");
  const [coachCity, setCoachCity] = useState(city || "");
  const [active, setActive] = useState(true);

  const reset = () => {
    setEditing(null);
    setSearch("");
    setPickedUserId("");
    setPickedLabel("");
    setBio("");
    setCoachCity(city || "");
    setActive(true);
  };

  const startNew = () => { reset(); setOpen(true); };
  const startEdit = (c: CoachRow) => {
    setEditing(c);
    setPickedUserId(c.user_id);
    setPickedLabel(c.profile?.display_name || c.profile?.email || "Coach");
    setBio(c.bio ?? "");
    setCoachCity(c.city);
    setActive(c.is_active);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!pickedUserId || !coachCity) return;
    await save.mutateAsync({
      id: editing?.id,
      user_id: pickedUserId,
      city: coachCity,
      bio: bio || null,
      is_active: active,
    });
    setOpen(false);
    reset();
  };

  const handleRemove = async (c: CoachRow) => {
    if (!confirm(`Remove ${c.profile?.display_name || c.profile?.email} as a coach?`)) return;
    await del.mutateAsync(c.id);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={startNew}><Plus className="mr-1.5 h-4 w-4" />Add Coach</Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !coaches || coaches.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No coaches yet. Add one to get started.
        </Card>
      ) : (
        <ScrollableTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coaches.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.profile?.display_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.profile?.email}</div>
                  </TableCell>
                  <TableCell>{c.city}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded ${c.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRemove(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollableTable>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Coach" : "Add Coach"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>User</Label>
              {pickedUserId ? (
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <span className="truncate">{pickedLabel}</span>
                  {!editing && <Button size="sm" variant="ghost" onClick={() => { setPickedUserId(""); setPickedLabel(""); }}>Change</Button>}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" className="pl-8" />
                  </div>
                  {search.length >= 2 && (
                    <div className="max-h-40 overflow-y-auto rounded-md border">
                      {(searchResults ?? []).filter((p: any) => p.is_registered).length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">No registered users match. Coaches must have signed in at least once.</div>
                      ) : (
                        (searchResults ?? []).filter((p: any) => p.is_registered).map((p: any) => (
                          <button
                            key={p.user_id}
                            type="button"
                            onClick={() => { setPickedUserId(p.user_id); setPickedLabel(p.display_name || p.email); setSearch(""); }}
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
            <div className="space-y-1.5">
              <Label>City</Label>
              <Select value={coachCity} onValueChange={setCoachCity}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {(cities ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bio (optional)</Label>
              <Input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio…" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <p className="text-xs text-muted-foreground">
              The <strong>coach</strong> role is granted automatically so this user can log sessions right away.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!pickedUserId || !coachCity || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============ MAIN TAB ============ */
export function AdminCoachingTab() {
  const { isAdmin, isSiteAdmin } = useAdmin();
  const { user } = useAuth();
  const { selectedCity } = useAdminCity();
  const { data: isCoach } = useIsCoach();

  const hasAdminAccess = isAdmin || isSiteAdmin;
  const showCoachView = !!isCoach;
  const showAdminView = hasAdminAccess;

  // Default landing tab
  const defaultTab = showCoachView ? "my-students" : showAdminView ? "all-sessions" : "my-students";
  const [tab, setTab] = useState(defaultTab);

  // Coach view drill-in
  const [openStudent, setOpenStudent] = useState<{ id: string; label: string } | null>(null);

  // Session dialog
  const [sessionOpen, setSessionOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<CoachingSession | null>(null);

  const openNewSession = () => { setEditingSession(null); setSessionOpen(true); };
  const openEditSession = (s: CoachingSession) => { setEditingSession(s); setSessionOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Coaching
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Session cards with notes, drills, and links to Onform, Sportsbox AI, and Superspeed.
          </p>
        </div>
        {(showCoachView || showAdminView) && (
          <Button size="sm" onClick={openNewSession}>
            <Plus className="mr-1.5 h-4 w-4" />New Session
          </Button>
        )}
      </div>

      {showAdminView && !showCoachView && (
        <Card className="p-3 text-xs text-muted-foreground bg-muted/30">
          Tip: Add coaches under the <strong>Coaches</strong> tab — they're automatically granted the coach role.
          Use <strong>New Session</strong> to log a session on behalf of any coach. Students appear automatically once they have a session.
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {showCoachView && <TabsTrigger value="my-students">My Students</TabsTrigger>}
          {showAdminView && <TabsTrigger value="all-sessions">All Sessions</TabsTrigger>}
          {showAdminView && <TabsTrigger value="coaches">Coaches</TabsTrigger>}
        </TabsList>

        {showCoachView && (
          <TabsContent value="my-students" className="mt-4">
            {openStudent ? (
              <CoachStudentProfile
                studentId={openStudent.id}
                studentLabel={openStudent.label}
                onBack={() => setOpenStudent(null)}
                onEdit={openEditSession}
                onAdd={openNewSession}
              />
            ) : (
              <CoachStudentList onPick={(id, label) => setOpenStudent({ id, label })} />
            )}
          </TabsContent>
        )}

        {showAdminView && (
          <TabsContent value="all-sessions" className="mt-4">
            <AllSessionsView city={selectedCity} onEdit={openEditSession} />
          </TabsContent>
        )}

        {showAdminView && (
          <TabsContent value="coaches" className="mt-4">
            <CoachesManager city={selectedCity} />
          </TabsContent>
        )}
      </Tabs>

      <SessionFormDialog
        open={sessionOpen}
        onOpenChange={setSessionOpen}
        session={editingSession}
        lockedStudentId={!editingSession && openStudent ? openStudent.id : undefined}
        lockedStudentLabel={!editingSession && openStudent ? openStudent.label : undefined}
        defaultCity={selectedCity || undefined}
        allowCoachPick={showAdminView}
      />
    </div>
  );
}

export default AdminCoachingTab;
