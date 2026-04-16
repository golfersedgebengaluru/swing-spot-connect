import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllCities } from "@/hooks/useBookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trophy, Users, Copy, Trash2, Eye, Image as ImageIcon, Calendar, UserPlus, UserMinus, Search, ChevronDown, ChevronRight, Edit, ListOrdered, Settings2, Shuffle, Lock, Unlock } from "lucide-react";
import { BaySchedulingPanel } from "@/components/admin/league/BaySchedulingPanel";
import { format } from "date-fns";
import {
  useTenants,
  useCreateTenant,
  useLeagues,
  useCreateLeague,
  useUpdateLeague,
  useJoinCodes,
  useCreateJoinCode,
  useRevokeJoinCode,
  useLeagueScores,
  useLeagueBranding,
  useUpdateBranding,
  useLeagueAuditLog,
  useTenantBays,
  useLeaguePlayers,
  useAddLeaguePlayer,
  useRemoveLeaguePlayer,
  useLeagueRounds,
  useCreateRound,
  useUpdateRound,
  useDeleteRound,
  useRoundCompetitions,
  useCreateCompetition,
  useUpdateCompetition,
  useDeleteCompetition,
  useLeagueTeams,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useAddTeamMember,
  useRemoveTeamMember,
  useHiddenHoles,
  useSetHiddenHoles,
  useCloseRound,
} from "@/hooks/useLeagues";
import { supabase } from "@/integrations/supabase/client";
import type { League, LeagueFormat, LeagueStatus, Tenant, LeagueRound, LeagueCompetition, LeagueTeam } from "@/types/league";
import { useToast } from "@/hooks/use-toast";

// ── Status badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: LeagueStatus }) {
  const variants: Record<LeagueStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  return <Badge className={variants[status]}>{status}</Badge>;
}

// ── Create Tenant Dialog ─────────────────────────────────────
function CreateTenantDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const createTenant = useCreateTenant();
  const { data: cities, isLoading: citiesLoading } = useAllCities();

  const handleCreate = () => {
    if (!name || !city) return;
    createTenant.mutate({ name, city }, {
      onSuccess: () => { setOpen(false); setName(""); setCity(""); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Tenant</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Tenant</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Franchise name" /></div>
          <div>
            <Label>City</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger><SelectValue placeholder={citiesLoading ? "Loading cities…" : "Select a city"} /></SelectTrigger>
              <SelectContent>
                {(cities || []).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate} disabled={createTenant.isPending || !city} className="w-full">
            {createTenant.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Create League Dialog ─────────────────────────────────────
function CreateLeagueDialog({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<LeagueFormat>("stroke_play");
  const [venueId, setVenueId] = useState<string>("");
  const createLeague = useCreateLeague(tenantId);
  const { data: bays } = useTenantBays(tenantId);

  const handleCreate = () => {
    if (!name) return;
    createLeague.mutate({ name, format, venue_id: venueId || undefined }, {
      onSuccess: () => { setOpen(false); setName(""); setVenueId(""); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New League</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create League</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="League name" /></div>
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as LeagueFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["stroke_play", "match_play", "stableford", "scramble", "best_ball", "skins"].map((f) => (
                  <SelectItem key={f} value={f}>{f.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {bays && bays.length > 0 && (
            <div>
              <Label>Venue (Bay)</Label>
              <Select value={venueId} onValueChange={setVenueId}>
                <SelectTrigger><SelectValue placeholder="Select a venue" /></SelectTrigger>
                <SelectContent>
                  {bays.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={handleCreate} disabled={createLeague.isPending} className="w-full">
            {createLeague.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Player Dialog ────────────────────────────────────────
function AddPlayerDialog({ leagueId }: { leagueId: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ user_id: string; display_name: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const addPlayer = useAddLeaguePlayer(leagueId);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .not("user_id", "is", null)
        .or(`display_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(10);
      setResults((data || []).filter((p) => p.user_id) as any);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = (userId: string) => {
    addPlayer.mutate(userId, {
      onSuccess: () => {
        setResults((prev) => prev.filter((p) => p.user_id !== userId));
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSearch(""); setResults([]); } }}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Add Player</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Player to League</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={searching} size="sm">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {results.length > 0 ? (
            <div className="divide-y max-h-[300px] overflow-y-auto">
              {results.map((p) => (
                <div key={p.user_id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{p.display_name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleAdd(p.user_id)} disabled={addPlayer.isPending}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>
              ))}
            </div>
          ) : search && !searching ? (
            <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Competition Editor ────────────────────────────────────────
function CompetitionEditor({ leagueId, round }: { leagueId: string; round: LeagueRound }) {
  const { data: competitions, isLoading } = useRoundCompetitions(leagueId, round.id);
  const createComp = useCreateCompetition(leagueId, round.id);
  const updateComp = useUpdateCompetition(leagueId, round.id);
  const deleteComp = useDeleteCompetition(leagueId, round.id);
  const [showAdd, setShowAdd] = useState(false);
  const [compName, setCompName] = useState("");
  const [compDesc, setCompDesc] = useState("");
  const [pointsEntries, setPointsEntries] = useState<{ position: number; points: number }[]>([
    { position: 1, points: 10 }, { position: 2, points: 7 }, { position: 3, points: 5 },
  ]);

  const addPointsRow = () => setPointsEntries((prev) => [...prev, { position: prev.length + 1, points: 0 }]);
  const removePointsRow = (i: number) => setPointsEntries((prev) => prev.filter((_, idx) => idx !== i));
  const updatePointsRow = (i: number, field: "position" | "points", val: number) =>
    setPointsEntries((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const handleCreate = () => {
    if (!compName.trim()) return;
    createComp.mutate({ name: compName, description: compDesc || undefined, points_config: pointsEntries }, {
      onSuccess: () => { setShowAdd(false); setCompName(""); setCompDesc(""); setPointsEntries([{ position: 1, points: 10 }, { position: 2, points: 7 }, { position: 3, points: 5 }]); },
    });
  };

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Competitions</p>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Competition
        </Button>
      </div>

      {showAdd && (
        <div className="border rounded-md p-3 space-y-3 bg-muted/30">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Name</Label><Input value={compName} onChange={(e) => setCompName(e.target.value)} placeholder="e.g. Longest Drive" /></div>
            <div><Label>Description</Label><Input value={compDesc} onChange={(e) => setCompDesc(e.target.value)} placeholder="Optional" /></div>
          </div>
          <div>
            <Label>Points by Position</Label>
            <div className="space-y-1 mt-1">
              {pointsEntries.map((pe, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs w-8 text-muted-foreground">#{pe.position}</span>
                  <Input type="number" className="w-20 h-8" value={pe.points} onChange={(e) => updatePointsRow(i, "points", Number(e.target.value))} />
                  <span className="text-xs text-muted-foreground">pts</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removePointsRow(i)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={addPointsRow}><Plus className="h-3 w-3 mr-1" /> Position</Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createComp.isPending}>
              {createComp.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {(!competitions || competitions.length === 0) ? (
        <p className="text-xs text-muted-foreground">No competitions configured for this round.</p>
      ) : (
        <div className="space-y-2">
          {competitions.map((comp) => (
            <div key={comp.id} className="border rounded-md p-3 bg-background">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{comp.name}</p>
                  {comp.description && <p className="text-xs text-muted-foreground">{comp.description}</p>}
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteComp.mutate(comp.id)} disabled={deleteComp.isPending}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              {comp.points_config && (comp.points_config as any[]).length > 0 && (
                <div className="flex gap-3 mt-2 flex-wrap">
                  {(comp.points_config as any[]).map((pc: any, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">#{pc.position}: {pc.points}pts</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Rounds Panel ─────────────────────────────────────────────
function RoundsPanel({ league }: { league: League }) {
  const { data: rounds, isLoading } = useLeagueRounds(league.id);
  const createRound = useCreateRound(league.id);
  const updateRound = useUpdateRound(league.id);
  const deleteRound = useDeleteRound(league.id);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [newRound, setNewRound] = useState({ name: "", description: "", start_date: "", end_date: "" });
  const [editingRound, setEditingRound] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: "", description: "", start_date: "", end_date: "" });

  const handleCreate = () => {
    if (!newRound.name || !newRound.start_date || !newRound.end_date) return;
    createRound.mutate(newRound, {
      onSuccess: () => { setShowAdd(false); setNewRound({ name: "", description: "", start_date: "", end_date: "" }); },
    });
  };

  const startEdit = (r: LeagueRound) => {
    setEditingRound(r.id);
    setEditData({ name: r.name, description: r.description || "", start_date: r.start_date, end_date: r.end_date });
  };

  const saveEdit = (roundId: string) => {
    updateRound.mutate({ roundId, body: editData }, {
      onSuccess: () => setEditingRound(null),
    });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
        <Plus className="h-4 w-4 mr-1" /> Add Round
      </Button>

      {showAdd && (
        <div className="border rounded-md p-4 space-y-3 bg-muted/30">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Round Name</Label><Input value={newRound.name} onChange={(e) => setNewRound({ ...newRound, name: e.target.value })} placeholder="e.g. Week 1" /></div>
            <div><Label>Description</Label><Input value={newRound.description} onChange={(e) => setNewRound({ ...newRound, description: e.target.value })} placeholder="Optional" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Start Date</Label><Input type="date" value={newRound.start_date} onChange={(e) => setNewRound({ ...newRound, start_date: e.target.value })} /></div>
            <div><Label>End Date</Label><Input type="date" value={newRound.end_date} onChange={(e) => setNewRound({ ...newRound, end_date: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createRound.isPending}>
              {createRound.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Create Round
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {(!rounds || rounds.length === 0) ? (
        <p className="text-sm text-muted-foreground py-4">No rounds configured. Add rounds to structure the league schedule.</p>
      ) : (
        <div className="space-y-2">
          {rounds.map((r) => (
            <div key={r.id} className="border rounded-md">
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                onClick={() => setExpandedRound(expandedRound === r.id ? null : r.id)}
              >
                <div className="flex items-center gap-2">
                  <ChevronRight className={`h-4 w-4 transition-transform ${expandedRound === r.id ? "rotate-90" : ""}`} />
                  <div>
                    <span className="font-medium text-sm">Round {r.round_number}: {r.name}</span>
                    <p className="text-xs text-muted-foreground">{r.start_date} → {r.end_date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" onClick={() => startEdit(r)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteRound.mutate(r.id)} disabled={deleteRound.isPending}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              {editingRound === r.id && (
                <div className="px-3 pb-3 space-y-3 border-t bg-muted/20">
                  <div className="grid gap-3 sm:grid-cols-2 pt-3">
                    <div><Label>Name</Label><Input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} /></div>
                    <div><Label>Description</Label><Input value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} /></div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label>Start Date</Label><Input type="date" value={editData.start_date} onChange={(e) => setEditData({ ...editData, start_date: e.target.value })} /></div>
                    <div><Label>End Date</Label><Input type="date" value={editData.end_date} onChange={(e) => setEditData({ ...editData, end_date: e.target.value })} /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(r.id)} disabled={updateRound.isPending}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingRound(null)}>Cancel</Button>
                  </div>
                </div>
              )}

              {expandedRound === r.id && editingRound !== r.id && (
                <div className="px-3 pb-3 border-t pt-3">
                  {r.description && <p className="text-sm text-muted-foreground mb-3">{r.description}</p>}
                  <CompetitionEditor leagueId={league.id} round={r} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Teams Panel ──────────────────────────────────────────────
function TeamsPanel({ league }: { league: League }) {
  const { data: teams, isLoading } = useLeagueTeams(league.id);
  const { data: players } = useLeaguePlayers(league.id);
  const createTeam = useCreateTeam(league.id);
  const updateTeam = useUpdateTeam(league.id);
  const deleteTeam = useDeleteTeam(league.id);
  const addMember = useAddTeamMember(league.id);
  const removeMember = useRemoveTeamMember(league.id);

  const [showAdd, setShowAdd] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [rosterSize, setRosterSize] = useState(4);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: "", max_roster_size: 4 });

  const handleCreate = () => {
    if (!teamName.trim()) return;
    createTeam.mutate({ name: teamName, max_roster_size: rosterSize }, {
      onSuccess: () => { setShowAdd(false); setTeamName(""); setRosterSize(4); },
    });
  };

  const startEdit = (t: LeagueTeam) => {
    setEditingTeam(t.id);
    setEditData({ name: t.name, max_roster_size: t.max_roster_size });
  };

  const saveEdit = (teamId: string) => {
    updateTeam.mutate({ teamId, body: editData }, { onSuccess: () => setEditingTeam(null) });
  };

  // Players not in any team (available for assignment)
  const unassignedPlayers = (players || []).filter(
    (p) => !teams?.some((t) => t.members?.some((m) => m.player_id === p.id))
  );

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
        <Plus className="h-4 w-4 mr-1" /> Create Team
      </Button>

      {showAdd && (
        <div className="border rounded-md p-4 space-y-3 bg-muted/30">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Team Name</Label><Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Team Alpha" /></div>
            <div><Label>Max Roster Size</Label><Input type="number" value={rosterSize || ""} onChange={(e) => setRosterSize(Number(e.target.value))} min={2} max={20} /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createTeam.isPending}>
              {createTeam.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {(!teams || teams.length === 0) ? (
        <p className="text-sm text-muted-foreground py-4">No teams yet. Create teams and assign players.</p>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <div key={team.id} className="border rounded-md">
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
              >
                <div className="flex items-center gap-2">
                  <ChevronRight className={`h-4 w-4 transition-transform ${expandedTeam === team.id ? "rotate-90" : ""}`} />
                  <div>
                    <span className="font-medium text-sm">{team.name}</span>
                    <p className="text-xs text-muted-foreground">
                      {team.members?.length || 0}/{team.max_roster_size} players
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" onClick={() => startEdit(team)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteTeam.mutate(team.id)} disabled={deleteTeam.isPending}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              {editingTeam === team.id && (
                <div className="px-3 pb-3 space-y-3 border-t bg-muted/20 pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label>Name</Label><Input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} /></div>
                    <div><Label>Max Roster</Label><Input type="number" value={editData.max_roster_size || ""} onChange={(e) => setEditData({ ...editData, max_roster_size: Number(e.target.value) })} /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(team.id)} disabled={updateTeam.isPending}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingTeam(null)}>Cancel</Button>
                  </div>
                </div>
              )}

              {expandedTeam === team.id && editingTeam !== team.id && (
                <div className="px-3 pb-3 border-t pt-3 space-y-3">
                  {/* Current members */}
                  {team.members && team.members.length > 0 ? (
                    <div className="space-y-1">
                      {team.members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/20">
                          <span className="text-sm">{m.display_name || "Unnamed"}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => removeMember.mutate({ teamId: team.id, memberId: m.id })}
                            disabled={removeMember.isPending}
                          >
                            <UserMinus className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No members assigned.</p>
                  )}

                  {/* Assign unassigned players */}
                  {unassignedPlayers.length > 0 && (team.members?.length || 0) < team.max_roster_size && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Assign a player:</p>
                      <div className="flex flex-wrap gap-1">
                        {unassignedPlayers.map((p) => (
                          <Button
                            key={p.id}
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => addMember.mutate({ teamId: team.id, playerId: p.id })}
                            disabled={addMember.isPending}
                          >
                            <Plus className="h-3 w-3 mr-1" />{p.display_name || p.email || "Unnamed"}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scoring Config Panel ────────────────────────────────────
function ScoringConfigPanel({ league }: { league: League }) {
  const updateLeague = useUpdateLeague(league.id);
  const [scoringHoles, setScoringHoles] = useState(league.scoring_holes || 18);
  const [fairnessPct, setFairnessPct] = useState(league.fairness_factor_pct || 0);
  const [aggregation, setAggregation] = useState(league.team_aggregation_method || 'best_ball');
  const [peoriaMultiplier, setPeoriaMultiplier] = useState(league.peoria_multiplier || 3);

  const handleSave = () => {
    updateLeague.mutate({
      scoring_holes: scoringHoles,
      fairness_factor_pct: fairnessPct,
      team_aggregation_method: aggregation as 'best_ball' | 'average',
      peoria_multiplier: peoriaMultiplier,
    });
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold">Scoring Configuration</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Holes per Round</Label>
          <div className="flex gap-2 mt-1">
            <Button size="sm" variant={scoringHoles === 9 ? "default" : "outline"} onClick={() => setScoringHoles(9)}>9 Holes</Button>
            <Button size="sm" variant={scoringHoles === 18 ? "default" : "outline"} onClick={() => setScoringHoles(18)}>18 Holes</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {scoringHoles === 9 ? "3 hidden holes, ×3 multiplier" : "6 hidden holes, ×3 multiplier"}
          </p>
        </div>
        <div>
          <Label>Peoria Multiplier</Label>
          <Input type="number" value={peoriaMultiplier || ""} onChange={(e) => setPeoriaMultiplier(Number(e.target.value))} min={1} max={10} step={0.5} />
          <p className="text-xs text-muted-foreground mt-1">Hidden hole sum × this value = handicap</p>
        </div>
        <div>
          <Label>Team Aggregation Method</Label>
          <Select value={aggregation} onValueChange={(v) => setAggregation(v as 'best_ball' | 'average')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="best_ball">Best Ball (lowest net score)</SelectItem>
              <SelectItem value="average">Average Score</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Team Fairness Factor (%)</Label>
          <Input type="number" value={fairnessPct || ""} onChange={(e) => setFairnessPct(Number(e.target.value))} min={0} max={100} step={1} />
          <p className="text-xs text-muted-foreground mt-1">Team score reduced by this % to compete with individuals</p>
        </div>
      </div>
      <Button onClick={handleSave} disabled={updateLeague.isPending} size="sm">
        {updateLeague.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save Configuration
      </Button>
    </div>
  );
}

// ── Hidden Holes Panel ──────────────────────────────────────
function HiddenHolesPanel({ league }: { league: League }) {
  const { data: hiddenHoles, isLoading } = useHiddenHoles(league.id);
  const { data: rounds } = useLeagueRounds(league.id);
  const setHiddenHoles = useSetHiddenHoles(league.id);
  const closeRound = useCloseRound(league.id);
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [manualHoles, setManualHoles] = useState<number[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);

  const scoringHoles = league.scoring_holes || 18;
  const requiredCount = scoringHoles === 9 ? 3 : 6;

  const currentRoundHH = hiddenHoles?.find((h) => h.round_number === selectedRound);

  const toggleHole = (hole: number) => {
    setManualHoles((prev) => {
      if (prev.includes(hole)) return prev.filter((h) => h !== hole);
      if (prev.length >= requiredCount) return prev;
      return [...prev, hole].sort((a, b) => a - b);
    });
  };

  const handleRandomize = () => {
    setHiddenHoles.mutate({ round_number: selectedRound, randomize: true });
  };

  const handleSaveManual = () => {
    if (manualHoles.length !== requiredCount) return;
    setHiddenHoles.mutate({ round_number: selectedRound, hidden_holes: manualHoles });
  };

  const handleCloseRound = () => {
    closeRound.mutate(selectedRound, {
      onSuccess: (data) => setLastResult(data),
    });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold">Hidden Holes (Peoria System)</h4>

      <div className="flex items-center gap-3">
        <div>
          <Label>Round</Label>
          {rounds && rounds.length > 0 ? (
            <Select value={String(selectedRound)} onValueChange={(v) => setSelectedRound(Number(v))}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {rounds.map((r) => (
                  <SelectItem key={r.round_number} value={String(r.round_number)}>
                    Round {r.round_number}: {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input type="number" value={selectedRound} onChange={(e) => setSelectedRound(Number(e.target.value))} min={1} className="w-20" />
          )}
        </div>
      </div>

      {currentRoundHH ? (
        <div className="border rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentRoundHH.revealed_at ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><Unlock className="h-3 w-3 mr-1" /> Revealed</Badge>
              ) : (
                <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" /> Hidden</Badge>
              )}
              <span className="text-sm">Round {currentRoundHH.round_number}</span>
            </div>
            {!currentRoundHH.revealed_at && (
              <Button size="sm" variant="destructive" onClick={handleCloseRound} disabled={closeRound.isPending}>
                {closeRound.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Close Round & Reveal
              </Button>
            )}
          </div>
          {currentRoundHH.hidden_holes && (
            <div className="flex gap-2 flex-wrap">
              {currentRoundHH.hidden_holes.map((h) => (
                <Badge key={h} variant="outline" className="text-sm">Hole {h}</Badge>
              ))}
            </div>
          )}
          {currentRoundHH.revealed_at && (
            <p className="text-xs text-muted-foreground">Revealed at {format(new Date(currentRoundHH.revealed_at), "PP p")}</p>
          )}
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-lg p-4 space-y-4">
          <p className="text-sm text-muted-foreground">No hidden holes set for Round {selectedRound}. Select {requiredCount} holes or randomize.</p>

          {/* Hole grid */}
          <div className="grid grid-cols-9 gap-1">
            {Array.from({ length: scoringHoles }, (_, i) => {
              const hole = i + 1;
              const isSelected = manualHoles.includes(hole);
              return (
                <Button
                  key={hole}
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="h-8 w-8 p-0 text-xs"
                  onClick={() => toggleHole(hole)}
                >
                  {hole}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{manualHoles.length}/{requiredCount} selected</p>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveManual} disabled={manualHoles.length !== requiredCount || setHiddenHoles.isPending}>
              {setHiddenHoles.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Save Selection
            </Button>
            <Button size="sm" variant="outline" onClick={handleRandomize} disabled={setHiddenHoles.isPending}>
              <Shuffle className="h-3.5 w-3.5 mr-1" /> Randomize
            </Button>
          </div>
        </div>
      )}

      {/* Peoria Results */}
      {lastResult?.peoria_results && lastResult.peoria_results.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium">Peoria Handicap Results</h5>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Hidden Sum</TableHead>
                <TableHead>Handicap</TableHead>
                <TableHead>Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lastResult.peoria_results
                .sort((a: any, b: any) => a.net_score - b.net_score)
                .map((r: any) => (
                  <TableRow key={r.score_id}>
                    <TableCell className="font-mono text-xs">{r.player_id.slice(0, 8)}</TableCell>
                    <TableCell>{r.gross_score}</TableCell>
                    <TableCell>{r.hidden_hole_sum}</TableCell>
                    <TableCell>{r.peoria_handicap}</TableCell>
                    <TableCell className="font-semibold">{r.net_score}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}


function LeagueDetail({ league, tenant }: { league: League; tenant: Tenant }) {
  const updateLeague = useUpdateLeague(league.id);
  const { data: joinCodes, isLoading: codesLoading } = useJoinCodes(league.id);
  const createCode = useCreateJoinCode(league.id);
  const revokeCode = useRevokeJoinCode(league.id);
  const { data: scores } = useLeagueScores(league.id);
  const { data: players, isLoading: playersLoading } = useLeaguePlayers(league.id);
  const removePlayer = useRemoveLeaguePlayer(league.id);
  const { data: branding } = useLeagueBranding(tenant.sponsorship_enabled ? league.id : null);
  const updateBranding = useUpdateBranding(league.id);
  const { data: auditLogs } = useLeagueAuditLog(league.tenant_id, league.id);
  const { data: teams } = useLeagueTeams(league.id);
  const { toast } = useToast();

  const [sponsorName, setSponsorName] = useState(branding?.sponsor_name || "");
  const [sponsorUrl, setSponsorUrl] = useState(branding?.sponsor_url || "");
  const [codeTeamId, setCodeTeamId] = useState<string>("");

  // Bidirectional status transitions
  const statusTransitions: Record<LeagueStatus, LeagueStatus[]> = {
    draft: ["active"],
    active: ["draft", "completed"],
    completed: ["active", "archived"],
    archived: ["completed"],
  };

  const availableTransitions = statusTransitions[league.status] || [];

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: code });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{league.name}</h3>
          <p className="text-sm text-muted-foreground">{league.format.replace(/_/g, " ")} · {league.score_entry_method.replace(/_/g, " ")}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={league.status} />
          {availableTransitions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={updateLeague.isPending}>
                  Change Status <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableTransitions.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => updateLeague.mutate({ status: s })}>
                    → {s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Tabs defaultValue="players">
        <TabsList className="flex-wrap">
          <TabsTrigger value="players"><Users className="h-3.5 w-3.5 mr-1" />Players ({players?.length || 0})</TabsTrigger>
          <TabsTrigger value="teams"><Users className="h-3.5 w-3.5 mr-1" />Teams</TabsTrigger>
          <TabsTrigger value="rounds"><ListOrdered className="h-3.5 w-3.5 mr-1" />Rounds</TabsTrigger>
          <TabsTrigger value="codes">Join Codes</TabsTrigger>
          <TabsTrigger value="scheduling"><Calendar className="h-3.5 w-3.5 mr-1" />Bay Scheduling</TabsTrigger>
          <TabsTrigger value="scores">Scores ({scores?.length || 0})</TabsTrigger>
          <TabsTrigger value="scoring"><Settings2 className="h-3.5 w-3.5 mr-1" />Scoring</TabsTrigger>
          {tenant.sponsorship_enabled && <TabsTrigger value="branding">Branding</TabsTrigger>}
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        {/* Players */}
        <TabsContent value="players" className="space-y-4">
          <AddPlayerDialog leagueId={league.id} />
          {playersLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (!players || players.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4">No players yet. Add players or share a join code.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.display_name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.email || "—"}</TableCell>
                    <TableCell>{format(new Date(p.joined_at), "PP")}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.joined_via_code_id ? "Join Code" : "Admin Added"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removePlayer.mutate(p.id)}
                        disabled={removePlayer.isPending}
                        title="Remove player"
                      >
                        <UserMinus className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Teams */}
        <TabsContent value="teams">
          <TeamsPanel league={league} />
        </TabsContent>

        {/* Rounds */}
        <TabsContent value="rounds">
          <RoundsPanel league={league} />
        </TabsContent>

        {/* Join Codes */}
        <TabsContent value="codes" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {teams && teams.length > 0 && (
              <Select value={codeTeamId} onValueChange={setCodeTeamId}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Individual (no team)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Individual (no team)</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={() => createCode.mutate({ team_id: codeTeamId && codeTeamId !== "none" ? codeTeamId : undefined })} disabled={createCode.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Generate Code
            </Button>
          </div>
          {codesLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(joinCodes || []).map((jc) => {
                  const teamName = jc.team_id ? teams?.find((t) => t.id === jc.team_id)?.name : null;
                  return (
                    <TableRow key={jc.id}>
                      <TableCell className="font-mono">{jc.code}</TableCell>
                      <TableCell>
                        {teamName ? (
                          <Badge variant="secondary" className="text-xs">{teamName}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Individual</Badge>
                        )}
                      </TableCell>
                      <TableCell>{jc.use_count}/{jc.max_uses}</TableCell>
                      <TableCell>{jc.expires_at ? format(new Date(jc.expires_at), "PP") : "—"}</TableCell>
                      <TableCell>
                        {jc.revoked_at ? <Badge variant="destructive">Revoked</Badge> :
                          jc.expires_at && new Date(jc.expires_at) < new Date() ? <Badge variant="secondary">Expired</Badge> :
                          <Badge variant="default">Active</Badge>}
                      </TableCell>
                      <TableCell className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => copyCode(jc.code)}><Copy className="h-3.5 w-3.5" /></Button>
                        {!jc.revoked_at && (
                          <Button size="icon" variant="ghost" onClick={() => revokeCode.mutate(jc.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Bay Scheduling */}
        <TabsContent value="scheduling">
          <BaySchedulingPanel league={league} tenantId={league.tenant_id} />
        </TabsContent>

        {/* Scores */}
        <TabsContent value="scores">
          {(!scores || scores.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4">No scores submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Confirmed</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scores.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">{(s as any).player_name || s.player_id.slice(0, 8)}</TableCell>
                    <TableCell>{s.round_number}</TableCell>
                    <TableCell className="font-semibold">{s.total_score ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{s.method}</Badge></TableCell>
                    <TableCell>{s.confirmed_at ? "✓" : "Pending"}</TableCell>
                    <TableCell>{format(new Date(s.created_at), "PP p")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Branding */}
        {tenant.sponsorship_enabled && (
          <TabsContent value="branding" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Sponsor Name</Label><Input value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} /></div>
              <div><Label>Sponsor URL</Label><Input value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="https://" /></div>
            </div>
            <Button onClick={() => updateBranding.mutate({ sponsor_name: sponsorName, sponsor_url: sponsorUrl })} disabled={updateBranding.isPending}>
              {updateBranding.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Branding
            </Button>
          </TabsContent>
        )}

        {/* Audit Log */}
        <TabsContent value="audit">
          <ScrollArea className="h-[300px]">
            {(!auditLogs || auditLogs.length === 0) ? (
              <p className="text-sm text-muted-foreground py-4">No audit entries yet.</p>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm border-b pb-2">
                    <Badge variant="outline" className="shrink-0">{log.action}</Badge>
                    <div className="min-w-0">
                      <p className="text-muted-foreground">{log.entity_type} · <span className="font-mono text-xs">{log.actor_id.slice(0, 8)}</span> ({log.actor_role})</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(log.created_at), "PP p")}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN ADMIN LEAGUES TAB
// ══════════════════════════════════════════════════════════════
export function AdminLeaguesTab() {
  const { data: tenants, isLoading: tenantsLoading } = useTenants();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);

  const selectedTenant = tenants?.find((t) => t.id === selectedTenantId) ?? null;
  const { data: leagues, isLoading: leaguesLoading } = useLeagues(selectedTenantId);

  // Auto-select first tenant
  if (!selectedTenantId && tenants && tenants.length > 0) {
    setSelectedTenantId(tenants[0].id);
  }

  if (tenantsLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Tenant selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Select value={selectedTenantId || ""} onValueChange={setSelectedTenantId}>
            <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
            <SelectContent>
              {(tenants || []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name} ({t.city})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CreateTenantDialog />
        {selectedTenant && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Sponsorship:</span>
            <Badge variant={selectedTenant.sponsorship_enabled ? "default" : "secondary"}>
              {selectedTenant.sponsorship_enabled ? "ON" : "OFF"}
            </Badge>
          </div>
        )}
      </div>

      {selectedTenantId && (
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          {/* League list */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4" /> Leagues</CardTitle>
              <CreateLeagueDialog tenantId={selectedTenantId} />
            </CardHeader>
            <CardContent className="p-0">
              {leaguesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (!leagues || leagues.length === 0) ? (
                <p className="text-sm text-muted-foreground px-6 py-8 text-center">No leagues yet. Create one to get started.</p>
              ) : (
                <div className="divide-y">
                  {leagues.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setSelectedLeague(l)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selectedLeague?.id === l.id ? "bg-muted" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{l.name}</span>
                        <StatusBadge status={l.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{l.format.replace(/_/g, " ")}</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detail panel */}
          <Card>
            <CardContent className="pt-6">
              {selectedLeague && selectedTenant ? (
                <LeagueDetail league={selectedLeague} tenant={selectedTenant} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Eye className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Select a league to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
